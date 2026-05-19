import { create } from "zustand";
import type { ServerStatus, StatusEventData } from "@/ws/messages";

interface SessionState {
  status: ServerStatus;
  sessionId: string | null;
  courseId: string | null;
  courseName: string | null;
  isListening: boolean;
  autoStopRemaining: number;
  applyStatus: (data: StatusEventData) => void;
  applyAutoStopTick: (remaining: number) => void;
  reset: () => void;
}

const INITIAL: Pick<
  SessionState,
  "status" | "sessionId" | "courseId" | "courseName" | "isListening" | "autoStopRemaining"
> = {
  status: "ready",
  sessionId: null,
  courseId: null,
  courseName: null,
  isListening: false,
  autoStopRemaining: 0,
};

export const useSessionStore = create<SessionState>((set) => ({
  ...INITIAL,
  applyStatus: (data) =>
    set({
      status: data.status,
      sessionId: data.session_id,
      courseId: data.course_id,
      courseName: data.course_name,
      isListening: data.is_listening,
      autoStopRemaining: data.auto_stop_remaining,
    }),
  applyAutoStopTick: (remaining) => set({ autoStopRemaining: remaining }),
  reset: () => set({ ...INITIAL }),
}));
