from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient

from class_copilot.application.session import ASRPipeline, _paragraph_context


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
        assert app.state.fake_asr.manual_turn_detection is False

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


def test_file_audio_uses_manual_turn_detection(app):
    app.state.config.debug_audio_file = True
    client = TestClient(app)
    course = client.post("/api/courses", json={"name": "调试"}).json()
    settings = client.patch(
        "/api/settings",
        json={"audio_source": "file", "audio_file_path": str(app.state.config.data_dir / "demo.mp3")},
    )
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
        assert app.state.fake_asr.manual_turn_detection is True


def test_paragraph_context_keeps_whole_recent_segments():
    paragraphs = ["第一段" * 120, "第二段", "第三段"]

    context = _paragraph_context(paragraphs, 20)

    assert context == "第二段\n第三段"


async def test_file_audio_segment_commit_waits_for_silence(app):
    await app.state.settings_service.update(
        {"audio_source": "file", "vad_max_segment_seconds": 0.01}
    )
    pipeline = ASRPipeline(
        session_id="test-session",
        asr=app.state.fake_asr,
        audio_queue=asyncio.Queue(),
        sessionmaker=app.state.sessionmaker,
        question_detector=app.state.session_service.question_detector,
        answer_generator=app.state.session_service.answer_generator,
        settings_service=app.state.settings_service,
        broadcast=app.state.connection_manager.broadcast,
        stop_callback=app.state.session_service.stop_listening,
    )

    speech = (1000).to_bytes(2, byteorder="little", signed=True) * 1600
    silence = b"\x00\x00" * 1600
    for _ in range(240):
        assert pipeline._should_commit_file_segment(speech) is False
    assert app.state.fake_asr.force_commit_count == 0
    for _ in range(3):
        assert pipeline._should_commit_file_segment(silence) is False
    assert pipeline._should_commit_file_segment(silence) is True


async def test_final_transcript_updates_asr_context(app):
    course = await app.state.session_service.start_listening(
        course_id=(await _create_course(app, "上下文")).id,
    )
    await app.state.fake_asr.push("第一段课堂内容。")

    for _ in range(20):
        if app.state.fake_asr.context_updates:
            break
        await asyncio.sleep(0.05)

    assert course.id
    assert app.state.fake_asr.context_updates[-1] == "第一段课堂内容。"


async def _create_course(app, name: str):
    from class_copilot.infrastructure.persistence.repositories import CourseRepository

    async with app.state.sessionmaker() as db:
        return await CourseRepository(db).create(name)
