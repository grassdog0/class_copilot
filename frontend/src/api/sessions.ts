import { apiRequest } from "./client";
import type { SessionDetail, SessionListItem } from "./types";

export interface SessionFilters {
  date_from?: string;
  date_to?: string;
  course_id?: string;
}

export function listSessions(filters: SessionFilters = {}): Promise<SessionListItem[]> {
  return apiRequest<SessionListItem[]>("/sessions", {
    query: { ...filters },
  });
}

export function getSession(id: string): Promise<SessionDetail> {
  return apiRequest<SessionDetail>(`/sessions/${id}`);
}

export function renameSession(id: string, customName: string | null): Promise<SessionListItem> {
  return apiRequest<SessionListItem>(`/sessions/${id}`, {
    method: "PATCH",
    body: { custom_name: customName },
  });
}

export function deleteSession(id: string): Promise<void> {
  return apiRequest<void>(`/sessions/${id}`, { method: "DELETE" });
}

export function exportMarkdownUrl(id: string): string {
  return `/api/sessions/${id}/export.md`;
}

export function recordingUrl(id: string): string {
  return `/api/sessions/${id}/recording`;
}
