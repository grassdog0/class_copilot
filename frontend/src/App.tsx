import { useCallback, useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { ToastViewport } from "@/components/Toast";
import { HomePage } from "@/pages/HomePage";
import { QAPage } from "@/pages/QAPage";
import { ChatPage } from "@/pages/ChatPage";
import { SessionsPage } from "@/pages/SessionsPage";
import { SessionDetailPage } from "@/pages/SessionDetailPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { wsClient } from "@/ws/client";
import { useWsEvent } from "@/ws/useWebSocket";
import { useSessionStore } from "@/stores/session";
import { useTranscriptsStore } from "@/stores/transcripts";
import { useQuestionsStore } from "@/stores/questions";
import { useChatStore } from "@/stores/chat";
import { useSettingsStore } from "@/stores/settings";
import { useCoursesStore } from "@/stores/courses";
import { useUiStore } from "@/stores/ui";

function GlobalWsBridge() {
  const applyStatus = useSessionStore((state) => state.applyStatus);
  const applyAutoStopTick = useSessionStore((state) => state.applyAutoStopTick);
  const applyTranscription = useTranscriptsStore((state) => state.apply);
  const resetTranscripts = useTranscriptsStore((state) => state.reset);
  const resetQuestions = useQuestionsStore((state) => state.reset);
  const resetChat = useChatStore((state) => state.reset);
  const appendDetected = useQuestionsStore((state) => state.appendDetected);
  const startAnswer = useQuestionsStore((state) => state.startAnswer);
  const appendAnswerChunk = useQuestionsStore((state) => state.appendAnswerChunk);
  const completeAnswer = useQuestionsStore((state) => state.completeAnswer);
  const appendAssistantChunk = useChatStore((state) => state.appendAssistantChunk);
  const completeAssistant = useChatStore((state) => state.completeAssistant);
  const pushToast = useUiStore((state) => state.pushToast);
  const setFatalError = useUiStore((state) => state.setFatalError);

  useWsEvent(
    "status",
    useCallback(
      (data) => {
        const previouslyListening = useSessionStore.getState().isListening;
        applyStatus(data);
        if (data.is_listening && !previouslyListening) {
          // entering a new listening session
          resetTranscripts();
          resetQuestions();
          resetChat();
        }
      },
      [applyStatus, resetTranscripts, resetQuestions, resetChat],
    ),
  );

  useWsEvent("transcription", useCallback((data) => applyTranscription(data), [applyTranscription]));
  useWsEvent(
    "question_detected",
    useCallback((data) => appendDetected(data), [appendDetected]),
  );
  useWsEvent("answer_generating", useCallback((data) => startAnswer(data), [startAnswer]));
  useWsEvent("answer_chunk", useCallback((data) => appendAnswerChunk(data), [appendAnswerChunk]));
  useWsEvent("answer_complete", useCallback((data) => completeAnswer(data), [completeAnswer]));
  useWsEvent(
    "chat_chunk",
    useCallback((data) => appendAssistantChunk(data.full_text), [appendAssistantChunk]),
  );
  useWsEvent(
    "chat_complete",
    useCallback(
      (data) => completeAssistant(data.content, data.model_used),
      [completeAssistant],
    ),
  );
  useWsEvent(
    "auto_stop_tick",
    useCallback((data) => applyAutoStopTick(data.remaining), [applyAutoStopTick]),
  );

  useWsEvent(
    "notification",
    useCallback(
      (data) => {
        pushToast({ level: data.level, message: data.message });
      },
      [pushToast],
    ),
  );

  useWsEvent(
    "error",
    useCallback(
      (data) => {
        pushToast({ level: "error", message: data.message });
        if (data.code === "asr_permanent" || data.code === "config_missing") {
          setFatalError({ code: data.code, message: data.message });
        }
      },
      [pushToast, setFatalError],
    ),
  );

  return null;
}

export default function App() {
  const loadSettings = useSettingsStore((state) => state.load);
  const loadCourses = useCoursesStore((state) => state.load);

  useEffect(() => {
    wsClient.connect();
    void loadSettings();
    void loadCourses();
    return () => {
      wsClient.disconnect();
    };
  }, [loadCourses, loadSettings]);

  return (
    <>
      <GlobalWsBridge />
      <ToastViewport />
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="qa" element={<QAPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="sessions" element={<SessionsPage />} />
          <Route path="sessions/:id" element={<SessionDetailPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<HomePage />} />
        </Route>
      </Routes>
    </>
  );
}
