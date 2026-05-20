from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import FileResponse, PlainTextResponse

from class_copilot.api.schemas import CourseCreate, CoursePatch, SessionPatch, SettingsPatch
from class_copilot.infrastructure.audio.monitor import list_audio_devices
from class_copilot.infrastructure.persistence.repositories import (
    CourseRepository,
    RepositoryConflictError,
    RepositoryNotFoundError,
    SessionRepository,
    delete_file_if_exists,
)

router = APIRouter(prefix="/api")


@router.get("/courses")
async def list_courses(request: Request):
    async with request.app.state.sessionmaker() as db:
        courses = await CourseRepository(db).list()
    return [course_to_dict(item) for item in courses]


@router.post("/courses", status_code=201)
async def create_course(payload: CourseCreate, request: Request):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    async with request.app.state.sessionmaker() as db:
        try:
            course = await CourseRepository(db).create(name)
        except RepositoryConflictError as exc:
            raise HTTPException(status_code=409, detail="course already exists") from exc
    return course_to_dict(course)


@router.patch("/courses/{course_id}")
async def patch_course(course_id: str, payload: CoursePatch, request: Request):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    async with request.app.state.sessionmaker() as db:
        repo = CourseRepository(db)
        try:
            course = await repo.rename(course_id, name)
        except RepositoryNotFoundError as exc:
            raise HTTPException(status_code=404, detail="course not found") from exc
        except RepositoryConflictError as exc:
            raise HTTPException(status_code=409, detail="course already exists") from exc
    return course_to_dict(course)


@router.delete("/courses/{course_id}", status_code=204)
async def delete_course(course_id: str, request: Request):
    async with request.app.state.sessionmaker() as db:
        try:
            await CourseRepository(db).delete_if_empty(course_id)
        except RepositoryNotFoundError as exc:
            raise HTTPException(status_code=404, detail="course not found") from exc
        except RepositoryConflictError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
    return Response(status_code=204)


@router.get("/sessions")
async def list_sessions(
    request: Request,
    date_from: str | None = None,
    date_to: str | None = None,
    course_id: str | None = None,
):
    async with request.app.state.sessionmaker() as db:
        sessions = await SessionRepository(db).list(
            date_from=date_from,
            date_to=date_to,
            course_id=course_id,
        )
    return [session_list_to_dict(item) for item in sessions]


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, request: Request):
    async with request.app.state.sessionmaker() as db:
        try:
            detail = await SessionRepository(db).detail(session_id)
        except RepositoryNotFoundError as exc:
            raise HTTPException(status_code=404, detail="session not found") from exc
    return session_detail_to_dict(detail)


@router.patch("/sessions/{session_id}")
async def patch_session(session_id: str, payload: SessionPatch, request: Request):
    async with request.app.state.sessionmaker() as db:
        try:
            session = await SessionRepository(db).update_custom_name(
                session_id, payload.custom_name
            )
        except RepositoryNotFoundError as exc:
            raise HTTPException(status_code=404, detail="session not found") from exc
    return session_list_to_dict(session)


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(session_id: str, request: Request):
    async with request.app.state.sessionmaker() as db:
        try:
            session = await SessionRepository(db).delete(session_id)
        except RepositoryNotFoundError as exc:
            raise HTTPException(status_code=404, detail="session not found") from exc
    delete_file_if_exists(session.recording_path)
    return Response(status_code=204)


@router.get("/sessions/{session_id}/export.md")
async def export_session(session_id: str, request: Request):
    async with request.app.state.sessionmaker() as db:
        try:
            detail = await SessionRepository(db).detail(session_id)
        except RepositoryNotFoundError as exc:
            raise HTTPException(status_code=404, detail="session not found") from exc
    content = build_markdown_export(
        detail, request.app.state.settings_service.runtime.auto_answer_type
    )
    session = detail.session
    name = safe_filename(session.course.name if session.course else session.id)
    filename = f"{session.date}_{name}.md"
    return PlainTextResponse(
        content,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": content_disposition(filename)},
    )


@router.get("/sessions/{session_id}/recording")
async def get_recording(session_id: str, request: Request):
    async with request.app.state.sessionmaker() as db:
        try:
            session = await SessionRepository(db).detail(session_id)
        except RepositoryNotFoundError as exc:
            raise HTTPException(status_code=404, detail="session not found") from exc
    path = Path(session.session.recording_path or "")
    if not path.exists():
        raise HTTPException(status_code=404, detail="recording file not found")
    name = safe_filename(session.session.course.name if session.session.course else session_id)
    filename = f"{session.session.date}_{name}.mp3"
    return FileResponse(
        path,
        media_type="audio/mpeg",
        filename=filename,
    )


@router.get("/settings")
async def get_settings(request: Request):
    return settings_to_response(request)


@router.get("/status")
async def get_status(request: Request):
    return request.app.state.session_service.status_event()["data"]


@router.patch("/settings")
async def patch_settings(payload: SettingsPatch, request: Request):
    partial = payload.model_dump(exclude_unset=True)
    if partial.get("audio_source") == "file" and not request.app.state.config.debug_audio_file:
        raise HTTPException(status_code=403, detail="本地音频文件音源仅在调试模式开放")
    settings = await request.app.state.settings_service.update(partial)
    request.app.state.llm.set_api_key(settings.dashscope_api_key)
    return settings_to_response(request)


@router.get("/audio/devices")
async def audio_devices(request: Request):
    return list_audio_devices(request.app.state.settings_service.runtime)


@router.post("/audio/mic-monitor/start")
async def start_mic_monitor(request: Request):
    settings = request.app.state.settings_service.runtime
    status = await request.app.state.mic_monitor.start(
        device_id=settings.audio_device_id if settings.audio_source == "microphone" else None
    )
    return {"status": status}


@router.post("/audio/mic-monitor/stop")
async def stop_mic_monitor(request: Request):
    status = await request.app.state.mic_monitor.stop()
    return {"status": status}


def course_to_dict(course) -> dict:  # noqa: ANN001
    return {
        "id": course.id,
        "name": course.name,
        "created_at": iso_z(course.created_at),
        "updated_at": iso_z(course.updated_at),
    }


def session_list_to_dict(session) -> dict:  # noqa: ANN001
    return {
        "id": session.id,
        "course_id": session.course_id,
        "course_name": session.course.name if getattr(session, "course", None) else None,
        "custom_name": session.custom_name,
        "date": session.date,
        "started_at": iso_z(session.started_at),
        "ended_at": iso_z(session.ended_at),
        "status": session.status,
    }


def session_detail_to_dict(detail) -> dict:  # noqa: ANN001
    session = detail.session
    return {
        "session": {
            **session_list_to_dict(session),
            "recording_path": session.recording_path,
            "recording_duration_seconds": session.recording_duration_seconds,
            "recording_file_size_bytes": session.recording_file_size_bytes,
        },
        "transcriptions": [
            {
                "id": item.id,
                "sequence": item.sequence,
                "start_time": item.start_time,
                "end_time": item.end_time,
                "text": item.text,
                "is_final": item.is_final,
                "created_at": iso_z(item.created_at),
            }
            for item in detail.transcriptions
        ],
        "questions": [
            {
                "id": question.id,
                "question_text": question.question_text,
                "source": question.source,
                "confidence": question.confidence,
                "context_text": question.context_text,
                "created_at": iso_z(question.created_at),
                "answers": [
                    {
                        "id": answer.id,
                        "answer_type": answer.answer_type,
                        "content": answer.content,
                        "created_at": iso_z(answer.created_at),
                        "updated_at": iso_z(answer.updated_at),
                    }
                    for answer in sorted(question.answers, key=lambda item: item.created_at)
                ],
            }
            for question in detail.questions
        ],
        "chat_messages": [
            {
                "id": item.id,
                "role": item.role,
                "content": item.content,
                "model_used": item.model_used,
                "created_at": iso_z(item.created_at),
            }
            for item in detail.chat_messages
        ],
    }


def build_markdown_export(detail, answer_type: str) -> str:  # noqa: ANN001
    session = detail.session
    title = session.custom_name or (session.course.name if session.course else session.id)
    lines = [
        f"# {title} - {session.date}",
        "",
        f"开始：{iso_z(session.started_at)}",
        f"结束：{iso_z(session.ended_at)}",
        "",
        "## 转写",
        "",
    ]
    lines.extend(item.text for item in detail.transcriptions)
    lines.extend(["", "## 问题与答案", ""])
    for question in detail.questions:
        lines.append(f"### {question.question_text}（{question.source}）")
        lines.append("")
        answer = next((item for item in question.answers if item.answer_type == answer_type), None)
        if answer:
            lines.append(answer.content)
            lines.append("")
    lines.extend(["## 主动提问", ""])
    pending_user = None
    for message in detail.chat_messages:
        if message.role == "user":
            pending_user = message.content
        elif message.role == "assistant" and pending_user is not None:
            lines.append(f"**Q:** {pending_user}")
            lines.append("")
            lines.append(f"**A:** {message.content}")
            lines.append("")
            pending_user = None
    return "\n".join(lines)


def iso_z(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def safe_filename(value: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\s]+', "_", value).strip("_")
    return cleaned or "session"


def content_disposition(filename: str) -> str:
    ascii_fallback = re.sub(r"[^A-Za-z0-9._-]+", "_", filename).strip("_") or "download"
    return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{quote(filename)}"


def settings_to_response(request: Request) -> dict:
    data = request.app.state.settings_service.public_dict()
    data["debug_audio_file"] = request.app.state.config.debug_audio_file
    if not request.app.state.config.debug_audio_file and data.get("audio_source") == "file":
        data["audio_source"] = "microphone"
    return data
