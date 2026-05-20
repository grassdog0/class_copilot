import { create } from "zustand";
import type { TranscriptionEventData } from "@/ws/messages";

export interface TranscriptLine {
  id: string;
  sequence: number;
  text: string;
  isFinal: boolean;
  startTime: number;
  endTime: number;
}

interface TranscriptsState {
  finals: TranscriptLine[];
  interim: TranscriptLine | null;
  apply: (data: TranscriptionEventData) => void;
  reset: () => void;
}

export const useTranscriptsStore = create<TranscriptsState>((set) => ({
  finals: [],
  interim: null,
  apply: (data) => {
    if (data.is_final) {
      const line: TranscriptLine = {
        id: `${data.session_id}-${data.sequence}`,
        sequence: data.sequence,
        text: data.text,
        isFinal: true,
        startTime: data.start_time,
        endTime: data.end_time,
      };
      set((state) => ({
        finals: state.finals.some((item) => item.sequence === line.sequence)
          ? state.finals.map((item) => (item.sequence === line.sequence ? line : item))
          : [...state.finals, line],
        interim: null,
      }));
    } else {
      set({
        interim: {
          id: "interim",
          sequence: 0,
          text: data.text,
          isFinal: false,
          startTime: data.start_time,
          endTime: data.end_time,
        },
      });
    }
  },
  reset: () => set({ finals: [], interim: null }),
}));
