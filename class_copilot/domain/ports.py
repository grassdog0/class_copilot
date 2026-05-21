from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass
from typing import Protocol


@dataclass(slots=True)
class ASRResult:
    text: str
    is_final: bool
    start_time: float
    end_time: float


@dataclass(slots=True)
class DetectedQuestion:
    question_text: str
    confidence: float
    context_text: str | None = None


@dataclass(slots=True)
class ChatMessage:
    role: str
    content: str


class RealtimeASRPort(Protocol):
    result_queue: asyncio.Queue[ASRResult]
    is_running: bool
    is_disconnected: bool
    is_permanent_error: bool
    last_error_code: int | str | None
    needs_rotation: bool
    last_text_activity_elapsed: float

    async def pre_connect(self) -> None: ...

    async def start(self, *, language: str, manual_turn_detection: bool = False) -> None: ...

    async def send_audio(self, pcm: bytes) -> None: ...

    async def update_context(self, context: str) -> None: ...

    async def stop(self) -> None: ...

    async def force_commit(self) -> None: ...

    async def finish_session(self) -> None: ...

    async def rotate_session(self) -> None: ...


class LLMPort(Protocol):
    def set_api_key(self, api_key: str | None) -> None: ...

    async def detect_question(self, *, context: str) -> DetectedQuestion | None: ...

    def generate_answer(
        self,
        *,
        question: str,
        context: str | None,
        answer_type: str,
        language: str,
        model: str,
        enable_thinking: bool,
    ) -> AsyncIterator[str]: ...

    def chat(
        self,
        *,
        messages: Sequence[ChatMessage],
        model: str,
        language: str,
        enable_thinking: bool,
        context: str,
    ) -> AsyncIterator[str]: ...
