import { create } from "zustand";

export type ToastLevel = "info" | "warning" | "error" | "success";

export interface Toast {
  id: number;
  level: ToastLevel;
  message: string;
  createdAt: number;
}

interface UiState {
  toasts: Toast[];
  fatalError: { code: string; message: string } | null;
  pushToast: (input: Omit<Toast, "id" | "createdAt">) => number;
  dismissToast: (id: number) => void;
  setFatalError: (info: { code: string; message: string } | null) => void;
}

let toastCounter = 0;

export const useUiStore = create<UiState>((set) => ({
  toasts: [],
  fatalError: null,
  pushToast: (input) => {
    const id = ++toastCounter;
    const toast: Toast = { ...input, id, createdAt: Date.now() };
    set((state) => ({ toasts: [...state.toasts, toast] }));
    return id;
  },
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  setFatalError: (info) => set({ fatalError: info }),
}));
