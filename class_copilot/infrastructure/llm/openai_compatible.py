from __future__ import annotations

import json
from collections.abc import AsyncIterator, Sequence

from openai import AsyncOpenAI

from class_copilot.domain.exceptions import ConfigurationError
from class_copilot.domain.ports import ChatMessage, DetectedQuestion

DASHSCOPE_COMPATIBLE_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"


class DashScopeCompatibleLLM:
    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or ""
        self._client: AsyncOpenAI | None = None
        if self._api_key:
            self._client = AsyncOpenAI(
                api_key=self._api_key,
                base_url=DASHSCOPE_COMPATIBLE_BASE_URL,
            )

    def set_api_key(self, api_key: str | None) -> None:
        self._api_key = api_key or ""
        self._client = (
            AsyncOpenAI(api_key=self._api_key, base_url=DASHSCOPE_COMPATIBLE_BASE_URL)
            if self._api_key
            else None
        )

    def _require_client(self) -> AsyncOpenAI:
        if self._client is None:
            raise ConfigurationError("DashScope API Key 未设置")
        return self._client

    async def detect_question(self, *, context: str, language: str) -> DetectedQuestion | None:
        client = self._require_client()
        prompt = (
            "你是课堂实时助手。判断下面课堂转写中是否出现了一个明确的问题。"
            "只输出 JSON："
            '{"has_question": boolean, "question_text": string, "confidence": number, '
            '"context_text": string}。没有问题时 has_question=false。'
            if language == "zh"
            else "You detect whether the transcript contains a clear classroom question. "
            "Return only JSON with has_question, question_text, confidence, context_text."
        )
        response = await client.chat.completions.create(
            model="qwen3.5-flash",
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": context[-6000:]},
            ],
            temperature=0,
            extra_body={"enable_thinking": False},
        )
        text = response.choices[0].message.content or ""
        try:
            data = json.loads(_extract_json(text))
        except json.JSONDecodeError:
            return None
        if not data.get("has_question"):
            return None
        question_text = str(data.get("question_text") or "").strip()
        if not question_text:
            return None
        return DetectedQuestion(
            question_text=question_text,
            confidence=float(data.get("confidence") or 0),
            context_text=str(data.get("context_text") or context[-2000:]),
        )

    async def generate_answer(
        self,
        *,
        question: str,
        context: str | None,
        answer_type: str,
        language: str,
    ) -> AsyncIterator[str]:
        style = "简洁回答，适合课堂上快速参考。" if answer_type == "brief" else "详细解释，包含步骤和要点。"
        if language == "en":
            style = "Answer briefly for quick classroom reference." if answer_type == "brief" else (
                "Answer in detail with steps and key points."
            )
        messages = [
            {"role": "system", "content": f"你是听课助手。{style}不要编造课堂上下文之外的信息。"},
            {"role": "user", "content": f"课堂上下文：\n{context or ''}\n\n问题：{question}"},
        ]
        async for chunk in self._stream(model="qwen3.5-flash", messages=messages):
            yield chunk

    async def chat(
        self,
        *,
        messages: Sequence[ChatMessage],
        model: str,
        language: str,
    ) -> AsyncIterator[str]:
        system = "你是听课助手，回答要结合当前课堂记录，无法确定时说明不确定。"
        if language == "en":
            system = "You are a class copilot. Use the lecture context and say when uncertain."
        payload = [{"role": "system", "content": system}] + [
            {"role": item.role, "content": item.content} for item in messages
        ]
        async for chunk in self._stream(model=model, messages=payload):
            yield chunk

    async def _stream(self, *, model: str, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        client = self._require_client()
        stream = await client.chat.completions.create(
            model=model,
            messages=messages,
            stream=True,
            temperature=0.2,
            extra_body={"enable_thinking": False},
        )
        async for event in stream:
            if not event.choices:
                continue
            delta = event.choices[0].delta.content
            if delta:
                yield delta


def _extract_json(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped.startswith("json"):
            stripped = stripped[4:]
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start >= 0 and end >= start:
        return stripped[start : end + 1]
    return stripped
