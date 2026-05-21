from __future__ import annotations

from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession

from class_copilot.application.settings import RuntimeSettings
from class_copilot.domain.ports import ChatMessage, LLMPort
from class_copilot.infrastructure.persistence.repositories import ChatRepository, SessionRepository

CHAT_CONTEXT_MAX_CHARS = 32000


class ChatService:
    def __init__(
        self,
        *,
        sessionmaker: async_sessionmaker[AsyncSession],
        llm: LLMPort,
        settings_provider,
    ) -> None:  # noqa: ANN001
        self._sessionmaker = sessionmaker
        self._llm = llm
        self._settings_provider = settings_provider

    async def ask(
        self,
        *,
        session_id: str,
        question: str,
        model_choice: str | None,
        enable_thinking: bool,
        broadcast,
    ) -> str:
        settings: RuntimeSettings = self._settings_provider()
        model = settings.chat_model_fast if model_choice == "fast" else settings.chat_model_default
        async with self._sessionmaker() as db:
            repo = ChatRepository(db)
            await repo.create(session_id=session_id, role="user", content=question)
            history = await repo.all(session_id)
            messages = [ChatMessage(role=item.role, content=item.content) for item in history]
            session = await SessionRepository(db).detail(session_id)
            context_text = _build_chat_context(session.transcriptions, session.questions, messages)
        full_text = ""
        async for chunk in self._llm.chat(
            messages=messages,
            model=model,
            language=settings.chat_language,
            enable_thinking=enable_thinking,
            context=context_text,
        ):
            full_text += chunk
            await broadcast({"type": "chat_chunk", "data": {"chunk": chunk, "full_text": full_text}})
        async with self._sessionmaker() as db:
            await ChatRepository(db).create(
                session_id=session_id,
                role="assistant",
                content=full_text,
                model_used=model,
            )
        await broadcast(
            {"type": "chat_complete", "data": {"content": full_text, "model_used": model}}
        )
        return full_text


def _build_chat_context(transcriptions, questions, messages) -> str:  # noqa: ANN001
    parts: list[str] = []
    for item in transcriptions:
        parts.append(item.text)
    for question in questions:
        parts.append(question.question_text)
        for answer in question.answers:
            parts.append(answer.content)
    for message in messages:
        parts.append(f"{message.role}: {message.content}")
    return _trim_context_by_paragraph("\n".join(parts), CHAT_CONTEXT_MAX_CHARS)


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
