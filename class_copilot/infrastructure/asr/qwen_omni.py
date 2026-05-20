from __future__ import annotations

import asyncio
import base64
import json
import time
from contextlib import suppress
from typing import Any

import websockets

from class_copilot.application.settings import RuntimeSettings
from class_copilot.domain.exceptions import ASRConnectionError, ConfigurationError
from class_copilot.domain.ports import ASRResult

REALTIME_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime"


class QwenOmniRealtimeASR:
    def __init__(
        self,
        *,
        api_key: str,
        settings: RuntimeSettings,
        prompt_provider=None,
    ) -> None:
        self.api_key = api_key
        self.settings = settings
        self.prompt_provider = prompt_provider
        self.result_queue: asyncio.Queue[ASRResult] = asyncio.Queue()
        self.is_running = False
        self.is_disconnected = False
        self.is_permanent_error = False
        self.last_error_code: int | str | None = None
        self.needs_rotation = False
        self._ws: Any = None
        self._reader_task: asyncio.Task[None] | None = None
        self._started_monotonic = 0.0
        self._last_text_activity_monotonic = time.monotonic()

    @property
    def last_text_activity_elapsed(self) -> float:
        return time.monotonic() - self._last_text_activity_monotonic

    async def pre_connect(self) -> None:
        if not self.api_key:
            raise ConfigurationError("DashScope API Key 未设置")

    async def start(self, *, language: str) -> None:
        await self.pre_connect()
        url = f"{REALTIME_URL}?model={self.settings.asr_model}"
        try:
            self._ws = await websockets.connect(
                url,
                additional_headers={"Authorization": f"Bearer {self.api_key}"},
                ping_interval=20,
                ping_timeout=20,
            )
            await self._send_session_update(language=language)
        except Exception as exc:
            self.is_disconnected = True
            raise ASRConnectionError("ASR 连接失败") from exc
        self.is_running = True
        self.is_disconnected = False
        self.is_permanent_error = False
        self.needs_rotation = False
        self._started_monotonic = time.monotonic()
        self._last_text_activity_monotonic = time.monotonic()
        self._reader_task = asyncio.create_task(self._reader())

    async def send_audio(self, pcm: bytes) -> None:
        if not self.is_running or self._ws is None:
            return
        await self._ws.send(
            json.dumps(
                {
                    "type": "input_audio_buffer.append",
                    "audio": base64.b64encode(pcm).decode("ascii"),
                }
            )
        )
        if time.monotonic() - self._started_monotonic >= self.settings.asr_session_rotate_minutes * 60:
            self.needs_rotation = True

    async def stop(self) -> None:
        self.is_running = False
        if self._reader_task:
            self._reader_task.cancel()
            with suppress(asyncio.CancelledError):
                await self._reader_task
        if self._ws is not None:
            with suppress(Exception):
                await self._ws.close()
        self._ws = None
        self._reader_task = None

    async def force_commit(self) -> None:
        if self._ws is None:
            return
        await self._ws.send(json.dumps({"type": "input_audio_buffer.commit"}))
        await self._ws.send(json.dumps({"type": "response.create"}))
        self._last_text_activity_monotonic = time.monotonic()

    async def rotate_session(self) -> None:
        language = self.settings.asr_language
        await self.stop()
        await asyncio.sleep(0.2)
        await self.start(language=language)
        self.needs_rotation = False

    async def _send_session_update(self, *, language: str) -> None:
        prompt = ""
        if self.prompt_provider:
            prompt = await self.prompt_provider()
        language_instruction = {
            "zh": "Transcribe classroom audio in Chinese.",
            "en": "Transcribe classroom audio in English.",
            "bilingual": "Transcribe bilingual classroom audio. Preserve both Chinese and English as spoken.",
        }.get(language, "Transcribe classroom audio.")
        payload = {
            "type": "session.update",
            "session": {
                "modalities": ["text"],
                "input_audio_format": "pcm16",
                "turn_detection": {
                    "type": "semantic_vad",
                    "threshold": self.settings.vad_threshold,
                    "prefix_padding_ms": self.settings.vad_prefix_padding_ms,
                    "silence_duration_ms": self.settings.vad_silence_duration_ms,
                },
                "instructions": (
                    f"{language_instruction} "
                    f"Use this previous lecture context when helpful:\n{prompt[-4000:]}"
                ),
            },
        }
        await self._ws.send(json.dumps(payload))

    async def _reader(self) -> None:
        try:
            async for raw in self._ws:
                data = json.loads(raw) if isinstance(raw, str) else {}
                await self._handle_event(data)
        except asyncio.CancelledError:
            raise
        except websockets.exceptions.ConnectionClosed as exc:
            self.last_error_code = exc.code
            self.is_disconnected = True
        except Exception as exc:
            self.last_error_code = exc.__class__.__name__
            self.is_disconnected = True

    async def _handle_event(self, data: dict[str, Any]) -> None:
        event_type = str(data.get("type") or "")
        if event_type in {"error", "session.error"}:
            error = data.get("error") or {}
            code = error.get("code") or data.get("code") or "unknown"
            self.last_error_code = code
            if str(code) in {"401", "403"} or "auth" in str(code).lower():
                self.is_permanent_error = True
            return

        text = (
            data.get("transcript")
            or data.get("text")
            or (data.get("delta") if isinstance(data.get("delta"), str) else None)
        )
        is_final = event_type.endswith(".done") or event_type.endswith(".completed")
        if text:
            self._last_text_activity_monotonic = time.monotonic()
            now = time.time()
            await self.result_queue.put(
                ASRResult(
                    text=str(text),
                    is_final=is_final,
                    start_time=float(data.get("audio_start_ms", 0) or now * 1000) / 1000,
                    end_time=float(data.get("audio_end_ms", 0) or now * 1000) / 1000,
                )
            )
