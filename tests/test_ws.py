from __future__ import annotations

from fastapi.testclient import TestClient


def test_websocket_status_and_chat_flow(app):
    client = TestClient(app)
    course = client.post("/api/courses", json={"name": "物理"}).json()
    settings = client.patch(
        "/api/settings",
        json={"asr_language": "bilingual", "auto_answer_language": "en", "chat_language": "bilingual"},
    )
    assert settings.status_code == 200
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
        assert app.state.fake_asr.started_languages[-1] == "bilingual"

        ws.send_json({"type": "chat", "data": {"question": "解释一下", "model": "fast"}})
        seen_complete = False
        for _ in range(5):
            message = ws.receive_json()
            if message["type"] == "chat_complete":
                seen_complete = True
                break
        assert seen_complete
        assert app.state.fake_llm.chat_languages[-1] == "bilingual"

        ws.send_json({"type": "stop_listening", "data": {}})
        stopped = ws.receive_json()
        assert stopped["type"] == "status"


def test_force_answer_skips_question_detection(app):
    client = TestClient(app)
    course = client.post("/api/courses", json={"name": "数学"}).json()
    settings = client.patch("/api/settings", json={"auto_answer_language": "bilingual"})
    assert settings.status_code == 200
    with client.websocket_connect("/ws") as ws:
        ws.receive_json()
        ws.send_json(
            {
                "type": "start_listening",
                "data": {"course_id": course["id"], "auto_stop_seconds": 0},
            }
        )
        assert ws.receive_json()["type"] == "status"
        app.state.fake_llm.detect_calls = 0

        ws.send_json({"type": "force_answer", "data": {}})
        seen_question = False
        seen_answer = False
        for _ in range(8):
            message = ws.receive_json()
            if message["type"] == "question_detected":
                seen_question = True
                assert message["data"]["question_text"] == "请根据当前课堂内容生成参考答案"
                assert message["data"]["confidence"] == 1.0
            if message["type"] == "answer_complete":
                seen_answer = True
                break
        assert seen_question
        assert seen_answer
        assert app.state.fake_llm.detect_calls == 0
        assert app.state.fake_llm.answer_languages[-1] == "bilingual"
