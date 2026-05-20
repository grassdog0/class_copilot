import { create } from "zustand";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "cc.theme";

function readStoredMode(): ThemeMode {
  if (typeof localStorage === "undefined") return "system";
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

function prefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveDark(mode: ThemeMode): boolean {
  return mode === "dark" || (mode === "system" && prefersDark());
}

function applyDocumentTheme(isDark: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
}

interface ThemeState {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const initialMode = readStoredMode();
const initialDark = resolveDark(initialMode);
applyDocumentTheme(initialDark);

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: initialMode,
  isDark: initialDark,
  setMode: (mode) => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, mode);
    }
    const isDark = resolveDark(mode);
    applyDocumentTheme(isDark);
    set({ mode, isDark });
  },
  toggle: () => {
    const current = get().mode;
    // toggle cycles: system -> (opposite of current effective) -> system
    if (current === "system") {
      get().setMode(prefersDark() ? "light" : "dark");
    } else if (current === "light") {
      get().setMode("dark");
    } else {
      get().setMode("light");
    }
  },
}));

// Listen for OS-level changes when in "system" mode.
if (typeof window !== "undefined" && window.matchMedia) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const listener = () => {
    const { mode } = useThemeStore.getState();
    if (mode !== "system") return;
    const isDark = resolveDark("system");
    applyDocumentTheme(isDark);
    useThemeStore.setState({ isDark });
  };
  if (media.addEventListener) {
    media.addEventListener("change", listener);
  } else {
    // Older Safari
    media.addListener(listener);
  }
}
