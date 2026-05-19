from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from loguru import logger

from class_copilot.domain.exceptions import AudioDeviceError, ConfigurationError


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ConfigurationError)
    async def configuration_error_handler(request: Request, exc: ConfigurationError):  # noqa: ANN001
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(AudioDeviceError)
    async def audio_error_handler(request: Request, exc: AudioDeviceError):  # noqa: ANN001
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(Exception)
    async def fallback_error_handler(request: Request, exc: Exception):  # noqa: ANN001
        logger.exception("Unhandled HTTP error")
        return JSONResponse(status_code=500, content={"detail": "服务端内部错误"})
