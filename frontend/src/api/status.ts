import { apiRequest } from "./client";
import type { StatusEventData } from "@/ws/messages";

export function getStatus(): Promise<StatusEventData> {
  return apiRequest<StatusEventData>("/status");
}
