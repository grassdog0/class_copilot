from __future__ import annotations

import asyncio
import time

from class_copilot.domain.ports import ASRResult


class FakeASR:
    def __init__(self) -> None:
        self.result_queue: asyncio.Queue[ASRResult] = asyncio.Queue()
        self.is_running = False
        self.is_disconnected = False
        self.is_permanent_error = False
        self.last_error_code = None
        self.needs_rotation = False
        self.force_commit_count = 0
        self.finish_session_count = 0
        self.rotate_count = 0
        self.sent_audio: list[bytes] = []
        self.context_updates: list[str] = []
        self.started_languages: list[str] = []
        self.manual_turn_detection = False
        self.last_text_activity_elapsed_override: float | None = None
        self._last_text = time.monotonic()

    @property
    def last_text_activity_elapsed(self) -> float:
        if self.last_text_activity_elapsed_override is not None:
            return self.last_text_activity_elapsed_override
        return time.monotonic() - self._last_text

    async def pre_connect(self) -> None:
        return None

    async def start(self, *, language: str, manual_turn_detection: bool = False) -> None:
        self.started_languages.append(language)
        self.manual_turn_detection = manual_turn_detection
        self.is_running = True
        self.is_disconnected = False

    async def send_audio(self, pcm: bytes) -> None:
        self.sent_audio.append(pcm)

    async def update_context(self, context: str) -> None:
        self.context_updates.append(context)

    async def stop(self) -> None:
        self.is_running = False

    async def force_commit(self) -> None:
        self.force_commit_count += 1
        self._last_text = time.monotonic()

    async def finish_session(self) -> None:
        self.finish_session_count += 1

    async def rotate_session(self) -> None:
        self.rotate_count += 1
        self.needs_rotation = False

    async def push(self, text: str, *, is_final: bool = True) -> None:
        now = time.time()
        self._last_text = time.monotonic()
        await self.result_queue.put(
            ASRResult(text=text, is_final=is_final, start_time=now - 1, end_time=now)
        )
