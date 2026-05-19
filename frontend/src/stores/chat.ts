import { create } from "zustand";

export interface ChatBubble {
  id: string;
  role: "user" | "assistant";
  content: string;
  modelUsed?: string | null;
  streaming?: boolean;
  createdAt: number;
}

interface ChatState {
  messages: ChatBubble[];
  pendingAssistant: ChatBubble | null;
  appendUser: (content: string) => void;
  appendAssistantChunk: (fullText: string) => void;
  completeAssistant: (content: string, modelUsed: string) => void;
  reset: () => void;
}

let counter = 0;
const nextId = () => `chat-${Date.now()}-${counter++}`;

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  pendingAssistant: null,
  appendUser: (content) =>
    set((state) => ({
      messages: [
        ...state.messages,
        { id: nextId(), role: "user", content, createdAt: Date.now() },
      ],
    })),
  appendAssistantChunk: (fullText) =>
    set((state) => {
      if (state.pendingAssistant) {
        const updated = { ...state.pendingAssistant, content: fullText };
        return {
          pendingAssistant: updated,
          messages: state.messages.map((message) =>
            message.id === updated.id ? updated : message,
          ),
        };
      }
      const created: ChatBubble = {
        id: nextId(),
        role: "assistant",
        content: fullText,
        streaming: true,
        createdAt: Date.now(),
      };
      return {
        pendingAssistant: created,
        messages: [...state.messages, created],
      };
    }),
  completeAssistant: (content, modelUsed) =>
    set((state) => {
      if (state.pendingAssistant) {
        const finalized: ChatBubble = {
          ...state.pendingAssistant,
          content,
          modelUsed,
          streaming: false,
        };
        return {
          pendingAssistant: null,
          messages: state.messages.map((message) =>
            message.id === finalized.id ? finalized : message,
          ),
        };
      }
      const created: ChatBubble = {
        id: nextId(),
        role: "assistant",
        content,
        modelUsed,
        streaming: false,
        createdAt: Date.now(),
      };
      return {
        pendingAssistant: null,
        messages: [...state.messages, created],
      };
    }),
  reset: () => set({ messages: [], pendingAssistant: null }),
}));
