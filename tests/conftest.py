from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from class_copilot.application.chat import ChatService
from class_copilot.application.question import AnswerGenerator, QuestionDetector
from class_copilot.application.session import SessionService
from class_copilot.application.settings import SettingsService
from class_copilot.bootstrap import create_app
from class_copilot.config import AppConfig
from class_copilot.infrastructure.audio.monitor import MicLevelMonitor
from class_copilot.infrastructure.crypto import SettingsCipher
from class_copilot.api.ws.connection import ConnectionManager
from tests.fakes.asr import FakeASR
from tests.fakes.llm import FakeLLM


class FakeCapture:
    def __init__(
        self,
        *,
        output_path: Path,
        audio_queue: asyncio.Queue[bytes],
        audio_file_path: str = "",
        **kwargs,
    ) -> None:
        self.output_path = output_path
        self.audio_queue = audio_queue
        self.audio_file_path = audio_file_path
        self.started_at = 0

    async def __aenter__(self):
        self.output_path.parent.mkdir(parents=True, exist_ok=True)
        self.output_path.write_bytes(b"fake mp3")
        await self.audio_queue.put(b"pcm")
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None

    @property
    def duration_seconds(self) -> float:
        return 1.0

    @property
    def file_size_bytes(self) -> int:
        return self.output_path.stat().st_size if self.output_path.exists() else 0


@pytest.fixture()
async def app(tmp_path):
    config = AppConfig(data_dir=tmp_path / "data", force_ipv4=False)
    app = create_app(config)
    async with app.router.lifespan_context(app):
        fake_llm = FakeLLM()
        manager = ConnectionManager()
        settings_service = SettingsService(
            app.state.sessionmaker,
            SettingsCipher(config.encryption_key_path),
        )
        await settings_service.load()
        await settings_service.update({"dashscope_api_key": "sk-test"})
        question_detector = QuestionDetector(fake_llm, lambda: settings_service.runtime)
        answer_generator = AnswerGenerator(fake_llm, lambda: settings_service.runtime)
        fake_asr = FakeASR()
        session_service = SessionService(
            config=config,
            sessionmaker=app.state.sessionmaker,
            settings_service=settings_service,
            question_detector=question_detector,
            answer_generator=answer_generator,
            broadcast=manager.broadcast,
            asr_factory=lambda api_key: fake_asr,
            capture_factory=FakeCapture,
        )
        chat_service = ChatService(
            sessionmaker=app.state.sessionmaker,
            llm=fake_llm,
            settings_provider=lambda: settings_service.runtime,
        )
        app.state.settings_service = settings_service
        app.state.llm = fake_llm
        app.state.fake_llm = fake_llm
        app.state.connection_manager = manager
        app.state.session_service = session_service
        app.state.chat_service = chat_service
        app.state.mic_monitor = MicLevelMonitor(manager.broadcast)
        app.state.fake_asr = fake_asr
        yield app
        await session_service.stop_listening("interrupted")


@pytest.fixture()
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
