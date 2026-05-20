from __future__ import annotations

import asyncio
import difflib
import re
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
PCM16_BYTES_PER_SECOND = 16000 * 2
FILE_SEGMENT_MIN_SECONDS = 24
FILE_SEGMENT_MAX_SECONDS = 58
FILE_SEGMENT_SILENCE_SECONDS = 0.4
FILE_SEGMENT_MIN_SILENCE_RMS = 250.0
FILE_SEGMENT_MAX_SILENCE_RMS = 700.0
ASR_CONTEXT_MAX_CHARS = 1000


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
        self._recent_final_transcripts: list[str] = []
        self._recent_context_transcripts: list[str] = []
        self._file_segment_bytes = 0
        self._file_silence_bytes = 0
        self._file_peak_rms = 0.0

    def start(self) -> None:
        self._tasks = [
            asyncio.create_task(self._feed_audio()),
            asyncio.create_task(self._process_results()),
            asyncio.create_task(self._supervise_asr()),
        ]

    async def stop(self) -> None:
        self.is_listening = False
        current_task = asyncio.current_task()
        for task in self._tasks:
            if task is not current_task:
                task.cancel()
        for task in self._tasks:
            if task is current_task:
                continue
            try:
                await task
            except asyncio.CancelledError:
                pass
        await self.asr.stop()

    async def _feed_audio(self) -> None:
        while self.is_listening:
            pcm = await self.audio_queue.get()
            if not pcm:
                if self.settings_service.runtime.audio_source == "file":
                    if self._file_segment_bytes > 0:
                        await self.asr.force_commit()
                        self._reset_file_segment_state()
                    await self.asr.finish_session()
                    asyncio.create_task(self._stop_after_file_flush())
                    return
                continue
            await self.asr.send_audio(pcm)
            if self.settings_service.runtime.audio_source == "file":
                if self._should_commit_file_segment(pcm):
                    await self.asr.force_commit()
                    self._reset_file_segment_state()

    def _should_commit_file_segment(self, pcm: bytes) -> bool:
        self._file_segment_bytes += len(pcm)
        rms = _pcm16_rms(pcm)
        self._file_peak_rms = max(self._file_peak_rms, rms)
        silence_threshold = max(
            FILE_SEGMENT_MIN_SILENCE_RMS,
            min(FILE_SEGMENT_MAX_SILENCE_RMS, self._file_peak_rms * 0.12),
        )
        if rms <= silence_threshold:
            self._file_silence_bytes += len(pcm)
        else:
            self._file_silence_bytes = 0

        if self._file_segment_bytes >= PCM16_BYTES_PER_SECOND * FILE_SEGMENT_MAX_SECONDS:
            return True
        return (
            self._file_segment_bytes >= PCM16_BYTES_PER_SECOND * FILE_SEGMENT_MIN_SECONDS
            and self._file_silence_bytes
            >= int(PCM16_BYTES_PER_SECOND * FILE_SEGMENT_SILENCE_SECONDS)
        )

    def _reset_file_segment_state(self) -> None:
        self._file_segment_bytes = 0
        self._file_silence_bytes = 0
        self._file_peak_rms = 0.0

    async def _stop_after_file_flush(self) -> None:
        await asyncio.sleep(8)
        if self.is_listening:
            await self.stop_callback("stopped")

    async def _process_results(self) -> None:
        while self.is_listening:
            result: ASRResult = await self.asr.result_queue.get()
            if result.is_final:
                if self._is_duplicate_transcript(result.text):
                    continue
                self._remember_transcript(result.text)
                asr_context = self._rolling_asr_context()
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
                await self.asr.update_context(asr_context)
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

    def _is_duplicate_transcript(self, text: str) -> bool:
        normalized = _normalize_transcript(text)
        if len(normalized) < 12:
            return False
        for previous in self._recent_final_transcripts[-4:]:
            if normalized in previous or previous in normalized:
                return True
            if difflib.SequenceMatcher(a=previous, b=normalized).ratio() >= 0.82:
                return True
        return False

    def _remember_transcript(self, text: str) -> None:
        normalized = _normalize_transcript(text)
        if not normalized:
            return
        self._recent_final_transcripts.append(normalized)
        self._recent_final_transcripts = self._recent_final_transcripts[-8:]
        self._recent_context_transcripts.append(text.strip())
        self._recent_context_transcripts = self._recent_context_transcripts[-8:]

    def _rolling_asr_context(self) -> str:
        return _paragraph_context(self._recent_context_transcripts, ASR_CONTEXT_MAX_CHARS)

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
                settings.audio_source != "file"
                and settings.vad_max_segment_seconds > 0
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
        settings = self.settings_service.runtime
        if settings.audio_source == "file" and not self.config.debug_audio_file:
            raise ConfigurationError("本地音频文件音源仅在调试模式开放")
        if settings.audio_source == "file" and not settings.audio_file_path.strip():
            raise ConfigurationError("请先在设置中填写本地音频文件路径")
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
            await asr.start(
                language=settings.asr_language,
                manual_turn_detection=settings.audio_source == "file",
            )
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
            audio_source=settings.audio_source,
            audio_device_id=settings.audio_device_id,
            audio_file_path=settings.audio_file_path,
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


def _normalize_transcript(text: str) -> str:
    return re.sub(r"\W+", "", text, flags=re.UNICODE).lower()


def _paragraph_context(paragraphs: list[str], max_chars: int) -> str:
    selected: list[str] = []
    total = 0
    for paragraph in reversed([p.strip() for p in paragraphs if p.strip()]):
        if len(paragraph) > max_chars:
            break
        extra = len(paragraph) + (1 if selected else 0)
        if total + extra > max_chars:
            break
        selected.append(paragraph)
        total += extra
    return "\n".join(reversed(selected))


def _pcm16_rms(pcm: bytes) -> float:
    if len(pcm) < 2:
        return 0.0
    sample_count = len(pcm) // 2
    total = 0
    for index in range(0, sample_count * 2, 2):
        sample = int.from_bytes(pcm[index : index + 2], byteorder="little", signed=True)
        total += sample * sample
    return (total / sample_count) ** 0.5
