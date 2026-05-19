from __future__ import annotations

from collections.abc import AsyncIterator, Sequence

from class_copilot.domain.ports import ChatMessage, DetectedQuestion


class FakeLLM:
    def __init__(self) -> None:
        self.api_key = None
        self.detected = DetectedQuestion(
            question_text="什么是向量空间？",
            confidence=0.91,
            context_text="课堂上下文",
        )

    def set_api_key(self, api_key: str | None) -> None:
        self.api_key = api_key

    async def detect_question(self, *, context: str, language: str) -> DetectedQuestion | None:
        if "?" in context or "？" in context or "什么" in context:
            return self.detected
        return None

    async def generate_answer(
        self,
        *,
        question: str,
        context: str | None,
        answer_type: str,
        language: str,
    ) -> AsyncIterator[str]:
        yield "向量空间是"
        yield "满足线性运算封闭的集合。"

    async def chat(
        self,
        *,
        messages: Sequence[ChatMessage],
        model: str,
        language: str,
    ) -> AsyncIterator[str]:
        yield "这是主动回答。"
