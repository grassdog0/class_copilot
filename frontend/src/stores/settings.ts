import { create } from "zustand";
import type { RuntimeSettings } from "@/api/types";
import { getSettings, patchSettings } from "@/api/settings";
import type { SettingsPatch } from "@/api/types";
import { ApiError } from "@/api/client";
import { useUiStore } from "./ui";

interface SettingsState {
  settings: RuntimeSettings | null;
  loading: boolean;
  error: string | null;
  load: () => Promise<RuntimeSettings | null>;
  update: (partial: SettingsPatch) => Promise<void>;
  patchLocal: (partial: Partial<RuntimeSettings>) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  loading: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      const settings = await getSettings();
      set({ settings, loading: false });
      return settings;
    } catch (err) {
      const message = err instanceof Error ? err.message : "加载设置失败";
      set({ loading: false, error: message });
      useUiStore.getState().pushToast({ level: "error", message });
      return null;
    }
  },
  update: async (partial) => {
    const previous = get().settings;
    // optimistic update for immediate UI feedback
    if (previous) {
      const next = { ...previous, ...partial } as RuntimeSettings;
      set({ settings: next });
    }
    try {
      const settings = await patchSettings(partial);
      set({ settings });
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : err instanceof Error ? err.message : "更新设置失败";
      if (previous) set({ settings: previous });
      useUiStore.getState().pushToast({ level: "error", message: detail });
      throw err;
    }
  },
  patchLocal: (partial) =>
    set((state) =>
      state.settings ? { settings: { ...state.settings, ...partial } as RuntimeSettings } : state,
    ),
}));
