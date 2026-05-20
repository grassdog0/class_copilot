from __future__ import annotations

from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession

from class_copilot.application.settings import RuntimeSettings
from class_copilot.domain.ports import ChatMessage, LLMPort
from class_copilot.infrastructure.persistence.repositories import ChatRepository


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

    async def ask(self, *, session_id: str, question: str, model_choice: str | None, broadcast) -> str:
        settings: RuntimeSettings = self._settings_provider()
        model = settings.chat_model_fast if model_choice == "fast" else settings.chat_model_default
        async with self._sessionmaker() as db:
            repo = ChatRepository(db)
            await repo.create(session_id=session_id, role="user", content=question)
            recent = await repo.recent(session_id, limit=20)
            messages = [ChatMessage(role=item.role, content=item.content) for item in recent]
        full_text = ""
        async for chunk in self._llm.chat(
            messages=messages,
            model=model,
            language=settings.chat_language,
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
