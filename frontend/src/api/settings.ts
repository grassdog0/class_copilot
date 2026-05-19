import { apiRequest } from "./client";
import type { RuntimeSettings, SettingsPatch } from "./types";

export function getSettings(): Promise<RuntimeSettings> {
  return apiRequest<RuntimeSettings>("/settings");
}

export function patchSettings(partial: SettingsPatch): Promise<RuntimeSettings> {
  return apiRequest<RuntimeSettings>("/settings", { method: "PATCH", body: partial });
}
