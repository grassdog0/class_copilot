from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Awaitable

from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession

from class_copilot.application.question import (
    AnswerGenerator,
    QuestionDetector,
    store_detected_question,
)
from class_copilot.application.settings import SettingsService
from class_copilot.config import AppConfig
from class_copilot.domain.exceptions import (
    ASRConnectionError,
    ASRPermanentError,
    AudioDeviceError,
    ConfigurationError,
)
from class_copilot.domain.ports import ASRResult, RealtimeASRPort
from class_copilot.infrastructure.asr.qwen_omni import QwenOmniRealtimeASR
from class_copilot.infrastructure.audio.capture import AudioCapture
from class_copilot.infrastructure.persistence.repositories import (
    CourseRepository,
    QuestionRepository,
    SessionRepository,
    TranscriptionRepository,
)
from class_copilot.infrastructure.persistence.orm import Session as SessionModel


Broadcast = Callable[[dict], Awaitable[None]]


@dataclass(slots=True)
class ListeningState:
    session_id: str | None = None
    course_id: str | None = None
    course_name: str | None = None
    is_listening: bool = False
    auto_stop_remaining: int = 0


class ASRPipeline:
    def __init__(
        self,
        *,
        session_id: str,
        asr: RealtimeASRPort,
        audio_queue: asyncio.Queue[bytes],
        sessionmaker: async_sessionmaker[AsyncSession],
        question_detector: QuestionDetector,
        answer_generator: AnswerGenerator,
        settings_service: SettingsService,
        broadcast: Broadcast,
        stop_callback: Callable[[str], Awaitable[None]],
    ) -> None:
        self.session_id = session_id
        self.asr = asr
        self.audio_queue = audio_queue
        self.sessionmaker = sessionmaker
        self.question_detector = question_detector
        self.answer_generator = answer_generator
        self.settings_service = settings_service
        self.broadcast = broadcast
        self.stop_callback = stop_callback
        self.is_listening = True
        self._tasks: list[asyncio.Task] = []

    def start(self) -> None:
        self._tasks = [
            asyncio.create_task(self._feed_audio()),
            asyncio.create_task(self._process_results()),
            asyncio.create_task(self._supervise_asr()),
        ]

    async def stop(self) -> None:
        self.is_listening = False
        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            try:
                await task
            except asyncio.CancelledError:
                pass
        await self.asr.stop()

    async def _feed_audio(self) -> None:
        while self.is_listening:
            pcm = await self.audio_queue.get()
            if pcm:
                await self.asr.send_audio(pcm)

    async def _process_results(self) -> None:
        while self.is_listening:
            result: ASRResult = await self.asr.result_queue.get()
            if result.is_final:
                async with self.sessionmaker() as db:
                    tx_repo = TranscriptionRepository(db)
                    sequence = await tx_repo.next_sequence(self.session_id)
                    await tx_repo.create(
                        session_id=self.session_id,
                        sequence=sequence,
                        start_time=result.start_time,
                        end_time=result.end_time,
                        text=result.text,
                        is_final=True,
                    )
                    context = await tx_repo.recent_text(self.session_id)
                await self.broadcast(
                    {
                        "type": "transcription",
                        "data": {
                            "session_id": self.session_id,
                            "text": result.text,
                            "is_final": True,
                            "start_time": result.start_time,
                            "end_time": result.end_time,
                            "sequence": sequence,
                        },
                    }
                )
                await self._maybe_detect_question(context=context, source="auto")
            else:
                await self.broadcast(
                    {
                        "type": "transcription",
                        "data": {
                            "session_id": self.session_id,
                            "text": result.text,
                            "is_final": False,
                            "start_time": result.start_time,
                            "end_time": result.end_time,
                            "sequence": 0,
                        },
                    }
                )

    async def manual_detect(self) -> None:
        async with self.sessionmaker() as db:
            context = await TranscriptionRepository(db).recent_text(self.session_id, limit=20)
        await self._maybe_detect_question(context=context, source="manual")

    async def force_answer(self) -> None:
        async with self.sessionmaker() as db:
            context = await TranscriptionRepository(db).recent_text(self.session_id, limit=20)
            question_text = "请根据当前课堂内容生成参考答案"
            question = await QuestionRepository(db).create(
                session_id=self.session_id,
                question_text=question_text,
                source="manual",
                confidence=1.0,
                context_text=context,
            )
            await self.broadcast(
                {
                    "type": "question_detected",
                    "data": {
                        "question_id": question.id,
                        "question_text": question.question_text,
                        "source": question.source,
                        "confidence": question.confidence,
                        "context_text": question.context_text,
                    },
                }
            )
            await self.answer_generator.generate_and_store(
                db=db,
                question_id=question.id,
                question_text=question.question_text,
                context_text=question.context_text,
                broadcast=self.broadcast,
            )

    async def _maybe_detect_question(self, *, context: str, source: str) -> None:
        detected = await self.question_detector.detect(context=context, source=source)
        if detected is None:
            return
        async with self.sessionmaker() as db:
            question = await store_detected_question(
                db=db,
                session_id=self.session_id,
                detected=detected,
                source=source,
            )
            await self.broadcast(
                {
                    "type": "question_detected",
                    "data": {
                        "question_id": question.id,
                        "question_text": question.question_text,
                        "source": question.source,
                        "confidence": question.confidence,
                        "context_text": question.context_text,
                    },
                }
            )
            await self.answer_generator.generate_and_store(
                db=db,
                question_id=question.id,
                question_text=question.question_text,
                context_text=question.context_text,
                broadcast=self.broadcast,
            )

    async def _supervise_asr(self) -> None:
        while self.is_listening:
            if self.asr.is_permanent_error:
                await self._broadcast_error("asr_permanent", "API Key 无效，请检查配置")
                await self.stop_callback("interrupted")
                return
            if self.asr.is_disconnected:
                ok = await self._reconnect_once()
                if ok:
                    await self._notification("info", "ASR 已自动重连")
                else:
                    await self._notification("error", "ASR 重连失败")
                    await self._broadcast_error("asr_unavailable", "ASR 连接失败，请稍后重试")
                    await self.stop_callback("interrupted")
                    return
            if self.asr.needs_rotation:
                await self._notification("info", "正在刷新语音连接...")
                await self.asr.rotate_session()
            settings = self.settings_service.runtime
            if (
                settings.vad_max_segment_seconds > 0
                and self.asr.last_text_activity_elapsed >= settings.vad_max_segment_seconds
            ):
                await self.asr.force_commit()
            await asyncio.sleep(0.5)

    async def _reconnect_once(self) -> bool:
        try:
            await self.asr.stop()
            await asyncio.sleep(0.2)
            await self.asr.start(language=self.settings_service.runtime.asr_language)
            return True
        except (ASRConnectionError, ASRPermanentError):
            return False

    async def _notification(self, level: str, message: str) -> None:
        await self.broadcast({"type": "notification", "data": {"level": level, "message": message}})

    async def _broadcast_error(self, code: str, message: str) -> None:
        await self.broadcast({"type": "error", "data": {"code": code, "message": message}})


class AutoStop:
    def __init__(self, broadcast: Broadcast, stop_callback: Callable[[str], Awaitable[None]]) -> None:
        self._broadcast = broadcast
        self._stop_callback = stop_callback
        self._task: asyncio.Task | None = None
        self.remaining = 0
        self.label = ""

    def update(self, *, seconds: int, label: str = "") -> None:
        self.cancel()
        self.remaining = max(0, int(seconds))
        self.label = label
        if self.remaining > 0:
            self._task = asyncio.create_task(self._run())

    def cancel(self) -> None:
        if self._task:
            self._task.cancel()
        self._task = None
        self.remaining = 0

    async def _run(self) -> None:
        try:
            while self.remaining > 0:
                interval = 1 if self.remaining <= 60 else min(10, self.remaining)
                await asyncio.sleep(interval)
                self.remaining = max(0, self.remaining - interval)
                await self._broadcast(
                    {"type": "auto_stop_tick", "data": {"remaining": self.remaining}}
                )
            await self._stop_callback("stopped")
        except asyncio.CancelledError:
            raise


class SessionService:
    def __init__(
        self,
        *,
        config: AppConfig,
        sessionmaker: async_sessionmaker[AsyncSession],
        settings_service: SettingsService,
        question_detector: QuestionDetector,
        answer_generator: AnswerGenerator,
        broadcast: Broadcast,
        asr_factory: Callable[[str], RealtimeASRPort] | None = None,
        capture_factory=None,
    ) -> None:
        self.config = config
        self.sessionmaker = sessionmaker
        self.settings_service = settings_service
        self.question_detector = question_detector
        self.answer_generator = answer_generator
        self.broadcast = broadcast
        self.asr_factory = asr_factory or self._default_asr_factory
        self.capture_factory = capture_factory or AudioCapture
        self.state = ListeningState()
        self._pipeline: ASRPipeline | None = None
        self._capture: AudioCapture | None = None
        self._capture_cm = None
        self._auto_stop = AutoStop(broadcast, self.stop_listening)

    async def startup_recover(self) -> None:
        async with self.sessionmaker() as db:
            await SessionRepository(db).mark_active_interrupted()

    def status_event(self, status: str | None = None) -> dict:
        current = "listening" if self.state.is_listening else "ready"
        return {
            "type": "status",
            "data": {
                "status": status or current,
                "session_id": self.state.session_id,
                "course_id": self.state.course_id,
                "course_name": self.state.course_name,
                "is_listening": self.state.is_listening,
                "auto_stop_remaining": self._auto_stop.remaining,
            },
        }

    async def start_listening(
        self,
        *,
        course_id: str,
        auto_stop_seconds: int = 0,
        auto_stop_label: str = "",
    ) -> SessionModel:
        if self.state.is_listening:
            raise ConfigurationError("已有会话正在监听")
        api_key = self.settings_service.require_api_key()
        async with self.sessionmaker() as db:
            course = await CourseRepository(db).get(course_id)
            now = datetime.now(UTC)
            placeholder_path = self.config.recordings_dir / "pending.mp3"
            session = await SessionRepository(db).create(
                course_id=course_id,
                date=now.date().isoformat(),
                recording_path=str(placeholder_path),
            )
            recording_path = self.config.recordings_dir / f"{session.id}.mp3"
            session.recording_path = str(recording_path)
            await db.commit()
            course_name = course.name
        self.state = ListeningState(
            session_id=session.id,
            course_id=course_id,
            course_name=course_name,
            is_listening=True,
        )
        audio_queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=200)
        asr = self.asr_factory(api_key)
        try:
            await asr.start(language=self.settings_service.runtime.asr_language)
        except Exception:
            async with self.sessionmaker() as db:
                await SessionRepository(db).finish(
                    session.id,
                    status="interrupted",
                    ended_at=datetime.now(UTC),
                )
            self.state = ListeningState()
            raise
        self._capture = self.capture_factory(
            audio_source=self.settings_service.runtime.audio_source,
            audio_device_id=self.settings_service.runtime.audio_device_id,
            output_path=recording_path,
            audio_queue=audio_queue,
        )
        try:
            self._capture_cm = self._capture.__aenter__()
            await self._capture_cm
        except AudioDeviceError:
            await asr.stop()
            async with self.sessionmaker() as db:
                await SessionRepository(db).finish(
                    session.id,
                    status="interrupted",
                    ended_at=datetime.now(UTC),
                )
            self.state = ListeningState()
            raise
        self._pipeline = ASRPipeline(
            session_id=session.id,
            asr=asr,
            audio_queue=audio_queue,
            sessionmaker=self.sessionmaker,
            question_detector=self.question_detector,
            answer_generator=self.answer_generator,
            settings_service=self.settings_service,
            broadcast=self.broadcast,
            stop_callback=self.stop_listening,
        )
        self._pipeline.start()
        self._auto_stop.update(seconds=auto_stop_seconds, label=auto_stop_label)
        await self.broadcast(self.status_event("listening"))
        return session

    async def stop_listening(self, reason: str = "stopped") -> None:
        if not self.state.session_id:
            return
        session_id = self.state.session_id
        self._auto_stop.cancel()
        if self._pipeline:
            await self._pipeline.stop()
            self._pipeline = None
        duration = None
        size = None
        if self._capture is not None:
            duration = self._capture.duration_seconds
            await self._capture.__aexit__(None, None, None)
            size = self._capture.file_size_bytes
            self._capture = None
        async with self.sessionmaker() as db:
            await SessionRepository(db).finish(
                session_id,
                status=reason,
                ended_at=datetime.now(UTC),
                recording_duration_seconds=duration,
                recording_file_size_bytes=size,
            )
        self.state.is_listening = False
        await self.broadcast(self.status_event("stopped" if reason == "stopped" else "error"))
        self.state = ListeningState()

    async def manual_detect(self) -> None:
        if self._pipeline is None:
            return
        await self._pipeline.manual_detect()

    async def force_answer(self) -> None:
        if self._pipeline is None:
            return
        await self._pipeline.force_answer()

    def update_auto_stop(self, *, seconds: int, label: str = "") -> None:
        self._auto_stop.update(seconds=seconds, label=label)

    def _default_asr_factory(self, api_key: str) -> RealtimeASRPort:
        return QwenOmniRealtimeASR(
            api_key=api_key,
            settings=self.settings_service.runtime,
            prompt_provider=self._prompt_context,
        )

    async def _prompt_context(self) -> str:
        if not self.state.session_id:
            return ""
        async with self.sessionmaker() as db:
            return await TranscriptionRepository(db).recent_text(self.state.session_id, limit=20)
