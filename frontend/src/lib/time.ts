import { format, formatDistanceStrict, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";

export function parseUtc(value: string | null | undefined): Date | null {
  if (!value) return null;
  try {
    return parseISO(value);
  } catch {
    return null;
  }
}

export function formatLocalDateTime(value: string | null | undefined): string {
  const date = parseUtc(value);
  if (!date) return "—";
  return format(date, "yyyy-MM-dd HH:mm");
}

export function formatLocalTime(value: string | null | undefined): string {
  const date = parseUtc(value);
  if (!date) return "—";
  return format(date, "HH:mm");
}

export function formatLocalDate(value: string | null | undefined): string {
  const date = parseUtc(value);
  if (!date) return "—";
  return format(date, "yyyy-MM-dd");
}

export function formatDateGroup(value: string | null | undefined): string {
  const date = parseUtc(value);
  if (!date) return "—";
  return format(date, "yyyy-MM-dd EEEE", { locale: zhCN });
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

export function formatRelative(value: string | null | undefined): string {
  const date = parseUtc(value);
  if (!date) return "—";
  return formatDistanceStrict(date, new Date(), { addSuffix: true, locale: zhCN });
}

export function formatRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const startStr = formatLocalTime(start);
  const endStr = end ? formatLocalTime(end) : "—";
  return `${startStr} – ${endStr}`;
}

export function formatEpoch(seconds: number): string {
  if (!seconds) return "";
  return format(new Date(seconds * 1000), "HH:mm:ss");
}

export function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}
