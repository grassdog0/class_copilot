import { apiRequest } from "./client";
import type { AudioDevicesResponse } from "./types";

export function getAudioDevices(): Promise<AudioDevicesResponse> {
  return apiRequest<AudioDevicesResponse>("/audio/devices");
}

export function startMicMonitor(): Promise<{ status: string }> {
  return apiRequest<{ status: string }>("/audio/mic-monitor/start", { method: "POST" });
}

export function stopMicMonitor(): Promise<{ status: string }> {
  return apiRequest<{ status: string }>("/audio/mic-monitor/stop", { method: "POST" });
}
