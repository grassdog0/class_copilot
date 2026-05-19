from __future__ import annotations

from fastapi.testclient import TestClient


def test_websocket_status_and_chat_flow(app):
    client = TestClient(app)
    course = client.post("/api/courses", json={"name": "物理"}).json()
    with client.websocket_connect("/ws") as ws:
        first = ws.receive_json()
        assert first["type"] == "status"

        ws.send_json(
            {
                "type": "start_listening",
                "data": {
                    "course_id": course["id"],
                    "auto_stop_seconds": 0,
                    "auto_stop_label": "",
                },
            }
        )
        status = ws.receive_json()
        assert status["type"] == "status"
        assert status["data"]["status"] == "listening"

        ws.send_json({"type": "chat", "data": {"question": "解释一下", "model": "fast"}})
        seen_complete = False
        for _ in range(5):
            message = ws.receive_json()
            if message["type"] == "chat_complete":
                seen_complete = True
                break
        assert seen_complete

        ws.send_json({"type": "stop_listening", "data": {}})
        stopped = ws.receive_json()
        assert stopped["type"] == "status"
