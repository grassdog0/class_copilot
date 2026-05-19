from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from class_copilot.infrastructure.persistence import orm


class RepositoryConflictError(Exception):
    pass


class RepositoryNotFoundError(Exception):
    pass


@dataclass(slots=True)
class SessionDetail:
    session: orm.Session
    transcriptions: list[orm.Transcription]
    questions: list[orm.Question]
    chat_messages: list[orm.ChatMessageModel]


class CourseRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list(self) -> list[orm.Course]:
        result = await self.db.execute(select(orm.Course).order_by(orm.Course.updated_at.desc()))
        return list(result.scalars().all())

    async def get(self, course_id: str) -> orm.Course:
        course = await self.db.get(orm.Course, course_id)
        if course is None:
            raise RepositoryNotFoundError("course not found")
        return course

    async def create(self, name: str) -> orm.Course:
        course = orm.Course(name=name)
        self.db.add(course)
        try:
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise RepositoryConflictError("course already exists") from exc
        await self.db.refresh(course)
        return course

    async def rename(self, course_id: str, name: str) -> orm.Course:
        course = await self.get(course_id)
        course.name = name
        try:
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise RepositoryConflictError("course already exists") from exc
        await self.db.refresh(course)
        return course

    async def delete_if_empty(self, course_id: str) -> None:
        await self.get(course_id)
        count = await self.db.scalar(
            select(func.count()).select_from(orm.Session).where(orm.Session.course_id == course_id)
        )
        if count:
            raise RepositoryConflictError("course has sessions, cannot delete")
        await self.db.execute(delete(orm.Course).where(orm.Course.id == course_id))
        await self.db.commit()


class SessionRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        *,
        course_id: str,
        date: str,
        recording_path: str | None = None,
    ) -> orm.Session:
        session = orm.Session(course_id=course_id, date=date, recording_path=recording_path)
        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)
        return session

    async def get(self, session_id: str) -> orm.Session:
        session = await self.db.get(orm.Session, session_id)
        if session is None:
            raise RepositoryNotFoundError("session not found")
        return session

    async def list(
        self,
        *,
        date_from: str | None = None,
        date_to: str | None = None,
        course_id: str | None = None,
    ) -> list[orm.Session]:
        stmt = (
            select(orm.Session)
            .options(selectinload(orm.Session.course))
            .order_by(orm.Session.started_at.desc())
        )
        if date_from:
            stmt = stmt.where(orm.Session.date >= date_from)
        if date_to:
            stmt = stmt.where(orm.Session.date <= date_to)
        if course_id:
            stmt = stmt.where(orm.Session.course_id == course_id)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def detail(self, session_id: str) -> SessionDetail:
        stmt = (
            select(orm.Session)
            .where(orm.Session.id == session_id)
            .options(
                selectinload(orm.Session.course),
                selectinload(orm.Session.transcriptions),
                selectinload(orm.Session.questions).selectinload(orm.Question.answers),
                selectinload(orm.Session.chat_messages),
            )
        )
        result = await self.db.execute(stmt)
        session = result.scalar_one_or_none()
        if session is None:
            raise RepositoryNotFoundError("session not found")
        return SessionDetail(
            session=session,
            transcriptions=sorted(session.transcriptions, key=lambda item: item.sequence),
            questions=sorted(session.questions, key=lambda item: item.created_at),
            chat_messages=sorted(session.chat_messages, key=lambda item: item.created_at),
        )

    async def update_custom_name(self, session_id: str, custom_name: str | None) -> orm.Session:
        session = await self.get(session_id)
        session.custom_name = custom_name
        await self.db.commit()
        await self.db.refresh(session, ["course"])
        return session

    async def finish(
        self,
        session_id: str,
        *,
        status: str,
        ended_at,
        recording_duration_seconds: float | None = None,
        recording_file_size_bytes: int | None = None,
    ) -> orm.Session:
        session = await self.get(session_id)
        session.status = status
        session.ended_at = ended_at
        session.recording_duration_seconds = recording_duration_seconds
        session.recording_file_size_bytes = recording_file_size_bytes
        await self.db.commit()
        await self.db.refresh(session)
        return session

    async def mark_active_interrupted(self) -> None:
        await self.db.execute(
            update(orm.Session).where(orm.Session.status == "active").values(status="interrupted")
        )
        await self.db.commit()

    async def delete(self, session_id: str) -> orm.Session:
        session = await self.get(session_id)
        await self.db.delete(session)
        await self.db.commit()
        return session


class TranscriptionRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def next_sequence(self, session_id: str) -> int:
        current = await self.db.scalar(
            select(func.max(orm.Transcription.sequence)).where(
                orm.Transcription.session_id == session_id
            )
        )
        return int(current or 0) + 1

    async def create(
        self,
        *,
        session_id: str,
        sequence: int,
        start_time: float,
        end_time: float,
        text: str,
        is_final: bool,
    ) -> orm.Transcription:
        item = orm.Transcription(
            session_id=session_id,
            sequence=sequence,
            start_time=start_time,
            end_time=end_time,
            text=text,
            is_final=is_final,
        )
        self.db.add(item)
        await self.db.commit()
        await self.db.refresh(item)
        return item

    async def recent_text(self, session_id: str, *, limit: int = 12) -> str:
        stmt = (
            select(orm.Transcription)
            .where(orm.Transcription.session_id == session_id, orm.Transcription.is_final.is_(True))
            .order_by(orm.Transcription.sequence.desc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        rows = list(reversed(result.scalars().all()))
        return "\n".join(row.text for row in rows)


class QuestionRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        *,
        session_id: str,
        question_text: str,
        source: str,
        confidence: float,
        context_text: str | None,
    ) -> orm.Question:
        question = orm.Question(
            session_id=session_id,
            question_text=question_text,
            source=source,
            confidence=confidence,
            context_text=context_text,
        )
        self.db.add(question)
        await self.db.commit()
        await self.db.refresh(question)
        return question

    async def recent(self, session_id: str, *, limit: int = 20) -> list[orm.Question]:
        stmt = (
            select(orm.Question)
            .where(orm.Question.session_id == session_id)
            .order_by(orm.Question.created_at.desc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())


class AnswerRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def upsert(self, *, question_id: str, answer_type: str, content: str) -> orm.Answer:
        stmt = select(orm.Answer).where(
            orm.Answer.question_id == question_id, orm.Answer.answer_type == answer_type
        )
        result = await self.db.execute(stmt)
        answer = result.scalar_one_or_none()
        if answer is None:
            answer = orm.Answer(question_id=question_id, answer_type=answer_type, content=content)
            self.db.add(answer)
        else:
            answer.content = content
        await self.db.commit()
        await self.db.refresh(answer)
        return answer


class ChatRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        *,
        session_id: str,
        role: str,
        content: str,
        model_used: str | None = None,
    ) -> orm.ChatMessageModel:
        message = orm.ChatMessageModel(
            session_id=session_id,
            role=role,
            content=content,
            model_used=model_used,
        )
        self.db.add(message)
        await self.db.commit()
        await self.db.refresh(message)
        return message

    async def recent(self, session_id: str, *, limit: int = 20) -> list[orm.ChatMessageModel]:
        stmt = (
            select(orm.ChatMessageModel)
            .where(orm.ChatMessageModel.session_id == session_id)
            .order_by(orm.ChatMessageModel.created_at.desc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(reversed(result.scalars().all()))


class SettingsRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_all(self) -> dict[str, orm.Setting]:
        result = await self.db.execute(select(orm.Setting))
        return {item.key: item for item in result.scalars().all()}

    async def set(self, *, key: str, value: str, is_encrypted: bool) -> orm.Setting:
        setting = await self.db.get(orm.Setting, key)
        if setting is None:
            setting = orm.Setting(key=key, value=value, is_encrypted=is_encrypted)
            self.db.add(setting)
        else:
            setting.value = value
            setting.is_encrypted = is_encrypted
            setting.updated_at = orm.utc_now()
        await self.db.commit()
        await self.db.refresh(setting)
        return setting


def delete_file_if_exists(path: str | None) -> None:
    if not path:
        return
    candidate = Path(path)
    if candidate.exists() and candidate.is_file():
        candidate.unlink()
