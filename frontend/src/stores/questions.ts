import { create } from "zustand";
import type { AnswerType, QuestionSource } from "@/api/types";
import type {
  AnswerChunkData,
  AnswerCompleteData,
  AnswerGeneratingData,
  QuestionDetectedData,
} from "@/ws/messages";

export interface DetectedQuestion {
  id: string;
  text: string;
  source: QuestionSource;
  confidence: number;
  contextText: string | null;
  detectedAt: number;
  answerType: AnswerType | null;
  answerStreaming: boolean;
  answerContent: string;
}

interface QuestionsState {
  items: DetectedQuestion[];
  selectedId: string | null;
  appendDetected: (data: QuestionDetectedData) => void;
  startAnswer: (data: AnswerGeneratingData) => void;
  appendAnswerChunk: (data: AnswerChunkData) => void;
  completeAnswer: (data: AnswerCompleteData) => void;
  selectQuestion: (id: string | null) => void;
  reset: () => void;
}

export const useQuestionsStore = create<QuestionsState>((set) => ({
  items: [],
  selectedId: null,
  appendDetected: (data) =>
    set((state) => {
      const next: DetectedQuestion = {
        id: data.question_id,
        text: data.question_text,
        source: data.source,
        confidence: data.confidence,
        contextText: data.context_text,
        detectedAt: Date.now(),
        answerType: null,
        answerStreaming: false,
        answerContent: "",
      };
      const items = [next, ...state.items];
      return {
        items,
        selectedId: state.selectedId ?? data.question_id,
      };
    }),
  startAnswer: (data) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === data.question_id
          ? { ...item, answerType: data.answer_type, answerStreaming: true, answerContent: "" }
          : item,
      ),
    })),
  appendAnswerChunk: (data) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === data.question_id
          ? {
              ...item,
              answerType: data.answer_type,
              answerStreaming: true,
              answerContent: data.full_text,
            }
          : item,
      ),
    })),
  completeAnswer: (data) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === data.question_id
          ? {
              ...item,
              answerType: data.answer_type,
              answerStreaming: false,
              answerContent: data.content,
            }
          : item,
      ),
    })),
  selectQuestion: (id) => set({ selectedId: id }),
  reset: () => set({ items: [], selectedId: null }),
}));
