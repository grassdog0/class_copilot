from __future__ import annotations

from fastapi import APIRouter, WebSocket
from pydantic import ValidationError
from starlette.websockets import WebSocketDisconnect

from class_copilot.api.schemas import WSMessage
from class_copilot.domain.exceptions import AudioDeviceError, ConfigurationError

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    manager = websocket.app.state.connection_manager
    session_service = websocket.app.state.session_service
    chat_service = websocket.app.state.chat_service
    await manager.connect(websocket)
    await manager.send(websocket, session_service.status_event())
    try:
        while True:
            payload = await websocket.receive_json()
            try:
                message = WSMessage.model_validate(payload)
                await dispatch_ws_message(message, session_service, chat_service, manager)
            except ValidationError:
                await manager.send(
                    websocket,
                    {"type": "error", "data": {"code": "bad_request", "message": "消息格式错误"}},
                )
    except WebSocketDisconnect:
        manager.disconnect(websocket)


async def dispatch_ws_message(message, session_service, chat_service, manager) -> None:  # noqa: ANN001
    data = message.data
    try:
        if message.type == "start_listening":
            await session_service.start_listening(
                course_id=str(data.get("course_id") or ""),
                auto_stop_seconds=int(data.get("auto_stop_seconds") or 0),
                auto_stop_label=str(data.get("auto_stop_label") or ""),
            )
        elif message.type == "stop_listening":
            await session_service.stop_listening("stopped")
        elif message.type == "manual_detect":
            await session_service.manual_detect()
        elif message.type == "force_answer":
            await session_service.force_answer()
        elif message.type == "chat":
            if not session_service.state.session_id:
                raise ConfigurationError("当前没有进行中的会话")
            question = str(data.get("question") or "").strip()
            if not question:
                raise ConfigurationError("question is required")
            await chat_service.ask(
                session_id=session_service.state.session_id,
                question=question,
                model_choice=data.get("model"),
                enable_thinking=bool(data.get("enable_thinking")),
                broadcast=manager.broadcast,
            )
        elif message.type == "update_auto_stop":
            session_service.update_auto_stop(
                seconds=int(data.get("seconds") or 0),
                label=str(data.get("label") or ""),
            )
            await manager.broadcast(session_service.status_event())
        else:
            await manager.broadcast(
                {"type": "error", "data": {"code": "bad_request", "message": "未知消息类型"}}
            )
    except AudioDeviceError as exc:
        await manager.broadcast(
            {"type": "error", "data": {"code": "audio_device", "message": str(exc)}}
        )
    except ConfigurationError as exc:
        await manager.broadcast(
            {"type": "error", "data": {"code": "config_missing", "message": str(exc)}}
        )
    except Exception:
        await manager.broadcast(
            {"type": "error", "data": {"code": "internal", "message": "服务端内部错误"}}
        )
