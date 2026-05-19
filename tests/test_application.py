from __future__ import annotations

from class_copilot.application.question import QuestionDetector
from class_copilot.application.settings import RuntimeSettings
from tests.fakes.llm import FakeLLM


async def test_question_detector_filters_duplicate_and_cooldown():
    settings = RuntimeSettings(question_cooldown_seconds=0, question_similarity_threshold=0.8)
    detector = QuestionDetector(FakeLLM(), lambda: settings)
    first = await detector.detect(context="什么是向量空间？", source="auto")
    second = await detector.detect(context="什么是向量空间？", source="auto")
    assert first is not None
    assert second is None
