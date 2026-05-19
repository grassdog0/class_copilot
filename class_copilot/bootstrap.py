from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from class_copilot.api.http.error_handlers import register_error_handlers
from class_copilot.api.http.routes import router as http_router
from class_copilot.api.ws.connection import ConnectionManager
from class_copilot.api.ws.handlers import router as ws_router
from class_copilot.application.chat import ChatService
from class_copilot.application.question import AnswerGenerator, QuestionDetector
from class_copilot.application.session import SessionService
from class_copilot.application.settings import SettingsService
from class_copilot.config import AppConfig, get_config
from class_copilot.db import create_all, get_sessionmaker
from class_copilot.infrastructure.audio.monitor import MicLevelMonitor
from class_copilot.infrastructure.crypto import SettingsCipher
from class_copilot.infrastructure.llm.openai_compatible import DashScopeCompatibleLLM


def create_app(config: AppConfig | None = None) -> FastAPI:
    cfg = config or get_config()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        cfg.ensure_directories()
        await create_all(cfg)
        sessionmaker = get_sessionmaker(cfg)
        cipher = SettingsCipher(cfg.encryption_key_path)
        settings_service = SettingsService(sessionmaker, cipher)
        await settings_service.load()
        llm = DashScopeCompatibleLLM(settings_service.runtime.dashscope_api_key)
        connection_manager = ConnectionManager()
        question_detector = QuestionDetector(llm, lambda: settings_service.runtime)
        answer_generator = AnswerGenerator(llm, lambda: settings_service.runtime)
        chat_service = ChatService(
            sessionmaker=sessionmaker,
            llm=llm,
            settings_provider=lambda: settings_service.runtime,
        )
        session_service = SessionService(
            config=cfg,
            sessionmaker=sessionmaker,
            settings_service=settings_service,
            question_detector=question_detector,
            answer_generator=answer_generator,
            broadcast=connection_manager.broadcast,
        )
        mic_monitor = MicLevelMonitor(connection_manager.broadcast)

        app.state.config = cfg
        app.state.sessionmaker = sessionmaker
        app.state.settings_service = settings_service
        app.state.llm = llm
        app.state.connection_manager = connection_manager
        app.state.session_service = session_service
        app.state.chat_service = chat_service
        app.state.mic_monitor = mic_monitor

        await session_service.startup_recover()
        yield
        await mic_monitor.stop()
        await session_service.stop_listening("interrupted")

    app = FastAPI(title="Class Copilot", lifespan=lifespan)
    register_error_handlers(app)
    app.include_router(http_router)
    app.include_router(ws_router)
    mount_frontend(app)
    return app


def mount_frontend(app: FastAPI) -> None:
    repo_root = Path(__file__).resolve().parents[1]
    frontend_dist = repo_root / "frontend" / "dist"
    assets = frontend_dist / "assets"
    if frontend_dist.exists() and (frontend_dist / "index.html").exists():
        if assets.exists():
            app.mount("/assets", StaticFiles(directory=assets), name="assets")

        @app.get("/")
        async def frontend_index():
            return FileResponse(frontend_dist / "index.html")

        @app.get("/{path:path}")
        async def frontend_spa(path: str):
            candidate = frontend_dist / path
            if candidate.exists() and candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(frontend_dist / "index.html")

    else:

        @app.get("/")
        async def missing_frontend():
            return JSONResponse(
                status_code=503,
                content={"detail": "frontend/dist not found; run npm run build or use dev mode"},
            )
