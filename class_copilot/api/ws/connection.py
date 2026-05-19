from __future__ import annotations

import asyncio

from starlette.websockets import WebSocket, WebSocketDisconnect


class ConnectionManager:
    def __init__(self) -> None:
        self._active: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._active.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self._active.discard(websocket)

    async def send(self, websocket: WebSocket, message: dict) -> None:
        try:
            await websocket.send_json(message)
        except (WebSocketDisconnect, RuntimeError):
            self.disconnect(websocket)

    async def broadcast(self, message: dict) -> None:
        if not self._active:
            return
        results = await asyncio.gather(
            *(self._safe_send(ws, message) for ws in list(self._active)),
            return_exceptions=True,
        )
        for ws, result in zip(list(self._active), results, strict=False):
            if isinstance(result, Exception):
                self.disconnect(ws)

    async def _safe_send(self, websocket: WebSocket, message: dict) -> None:
        await websocket.send_json(message)
