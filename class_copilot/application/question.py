from __future__ import annotations

import difflib
import time

from sqlalchemy.ext.asyncio import AsyncSession

from class_copilot.application.settings import RuntimeSettings
from class_copilot.domain.ports import DetectedQuestion, LLMPort
from class_copilot.infrastructure.persistence.repositories import (
    AnswerRepository,
    QuestionRepository,
)


class QuestionDetector:
    def __init__(self, llm: LLMPort, settings_provider) -> None:  # noqa: ANN001
        self._llm = llm
        self._settings_provider = settings_provider
        self._last_detected_at = 0.0
        self._recent_questions: list[str] = []

    async def detect(self, *, context: str, source: str) -> DetectedQuestion | None:
        settings: RuntimeSettings = self._settings_provider()
        if source == "auto":
            elapsed = time.monotonic() - self._last_detected_at
            if elapsed < settings.question_cooldown_seconds:
                return None
        detected = await self._llm.detect_question(context=context)
        if detected is None:
            return None
        if detected.confidence < settings.question_confidence_threshold:
            return None
        if self._is_duplicate(detected.question_text, settings.question_similarity_threshold):
            return None
        self._last_detected_at = time.monotonic()
        self._recent_questions.append(detected.question_text)
        self._recent_questions = self._recent_questions[-20:]
        return detected

    def _is_duplicate(self, text: str, threshold: float) -> bool:
        for existing in self._recent_questions:
            if difflib.SequenceMatcher(a=existing, b=text).ratio() >= threshold:
                return True
        return False


class AnswerGenerator:
    def __init__(self, llm: LLMPort, settings_provider) -> None:  # noqa: ANN001
        self._llm = llm
        self._settings_provider = settings_provider

    async def generate_and_store(
        self,
        *,
        db: AsyncSession,
        question_id: str,
        question_text: str,
        context_text: str | None,
        broadcast,
    ) -> str:
        settings: RuntimeSettings = self._settings_provider()
        answer_type = settings.auto_answer_type
        await broadcast(
            {
                "type": "answer_generating",
                "data": {"question_id": question_id, "answer_type": answer_type},
            }
        )
        full_text = ""
        async for chunk in self._llm.generate_answer(
            question=question_text,
            context=context_text,
            answer_type=answer_type,
            language=settings.auto_answer_language,
        ):
            full_text += chunk
            await broadcast(
                {
                    "type": "answer_chunk",
                    "data": {
                        "question_id": question_id,
                        "answer_type": answer_type,
                        "chunk": chunk,
                        "full_text": full_text,
                    },
                }
            )
        await AnswerRepository(db).upsert(
            question_id=question_id, answer_type=answer_type, content=full_text
        )
        await broadcast(
            {
                "type": "answer_complete",
                "data": {
                    "question_id": question_id,
                    "answer_type": answer_type,
                    "content": full_text,
                },
            }
        )
        return full_text


async def store_detected_question(
    *,
    db: AsyncSession,
    session_id: str,
    detected: DetectedQuestion,
    source: str,
):
    return await QuestionRepository(db).create(
        session_id=session_id,
        question_text=detected.question_text,
        source=source,
        confidence=detected.confidence,
        context_text=detected.context_text,
    )
