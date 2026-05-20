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
        self._language = "zh"
        self._manual_turn_detection = False
        self._context = ""

    @property
    def last_text_activity_elapsed(self) -> float:
        return time.monotonic() - self._last_text_activity_monotonic

    async def pre_connect(self) -> None:
        if not self.api_key:
            raise ConfigurationError("DashScope API Key 未设置")

    async def start(self, *, language: str, manual_turn_detection: bool = False) -> None:
        await self.pre_connect()
        url = f"{REALTIME_URL}?model={self.settings.asr_model}"
        try:
            self._ws = await websockets.connect(
                url,
                additional_headers={"Authorization": f"Bearer {self.api_key}"},
                ping_interval=20,
                ping_timeout=20,
            )
            self._language = language
            self._manual_turn_detection = manual_turn_detection
            self._context = ""
            await self._send_session_update(
                language=language,
                manual_turn_detection=manual_turn_detection,
            )
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

    async def update_context(self, context: str) -> None:
        if not self.is_running or self._ws is None:
            return
        cleaned = context.strip()
        if cleaned == self._context:
            return
        self._context = cleaned
        await self._send_session_update(
            language=self._language,
            manual_turn_detection=self._manual_turn_detection,
        )

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
        self._last_text_activity_monotonic = time.monotonic()

    async def finish_session(self) -> None:
        if self._ws is None:
            return
        await self._ws.send(json.dumps({"type": "session.finish"}))

    async def rotate_session(self) -> None:
        language = self.settings.asr_language
        context = self._context
        await self.stop()
        await asyncio.sleep(0.2)
        await self.start(language=language)
        if context:
            await self.update_context(context)
        self.needs_rotation = False

    async def _send_session_update(self, *, language: str, manual_turn_detection: bool) -> None:
        context = self._context
        if not context and self.prompt_provider:
            prompt = await self.prompt_provider()
            context = _trim_context_by_paragraph(prompt, 1000)
        language_instruction = {
            "zh": "Transcribe Chinese classroom audio verbatim. Do not translate foreign-language speech.",
            "en": "Transcribe English classroom audio verbatim. Do not translate foreign-language speech.",
            "bilingual": (
                "Transcribe bilingual classroom audio verbatim. Preserve each utterance in the "
                "language actually spoken, and do not translate between Chinese and English."
            ),
        }.get(language, "Transcribe classroom audio.")
        payload = {
            "type": "session.update",
            "session": {
                "modalities": ["text"],
                "input_audio_format": "pcm",
                "sample_rate": 16000,
                "input_audio_transcription": {
                    "language": "zh" if language == "bilingual" else language,
                },
                "turn_detection": None
                if manual_turn_detection
                else {
                    "type": "semantic_vad",
                    "threshold": self.settings.vad_threshold,
                    "prefix_padding_ms": self.settings.vad_prefix_padding_ms,
                    "silence_duration_ms": self.settings.vad_silence_duration_ms,
                },
                "instructions": (
                    f"{language_instruction} Output only the transcript text. "
                    "The previous transcript context below is only for continuity and disambiguation. "
                    "Do not copy it unless it is actually spoken in the current audio.\n"
                    f"Previous transcript context:\n{context}"
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
        if event_type == "session.finished":
            return
        if event_type in {"error", "session.error"}:
            error = data.get("error") or {}
            code = error.get("code") or data.get("code") or "unknown"
            self.last_error_code = code
            if str(code) in {"401", "403"} or "auth" in str(code).lower():
                self.is_permanent_error = True
            return

        text = None
        is_final = False
        if event_type == "conversation.item.input_audio_transcription.completed":
            text = data.get("transcript")
            is_final = True
        elif event_type in {
            "conversation.item.input_audio_transcription.text",
            "conversation.item.input_audio_transcription.delta",
        }:
            text = f"{data.get('text', '')}{data.get('stash', '')}"
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


def _trim_context_by_paragraph(text: str, max_chars: int) -> str:
    paragraphs = [line.strip() for line in text.splitlines() if line.strip()]
    selected: list[str] = []
    total = 0
    for paragraph in reversed(paragraphs):
        if len(paragraph) > max_chars:
            break
        extra = len(paragraph) + (1 if selected else 0)
        if total + extra > max_chars:
            break
        selected.append(paragraph)
        total += extra
    return "\n".join(reversed(selected))
