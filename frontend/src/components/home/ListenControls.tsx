import { useState } from "react";
import { Loader2, Pause, Play, Timer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { useSessionStore } from "@/stores/session";
import { useCoursesStore } from "@/stores/courses";
import { useSettingsStore } from "@/stores/settings";
import { useUiStore } from "@/stores/ui";
import { useWsConnectionState, useWsSend } from "@/ws/useWebSocket";
import { useNavigate } from "react-router-dom";
import { formatCountdown } from "@/lib/time";
import { useI18n } from "@/i18n";

export function ListenControls() {
  const send = useWsSend();
  const navigate = useNavigate();
  const wsState = useWsConnectionState();
  const isListening = useSessionStore((state) => state.isListening);
  const status = useSessionStore((state) => state.status);
  const autoStopRemaining = useSessionStore((state) => state.autoStopRemaining);
  const courseId = useCoursesStore((state) => state.selectedId);
  const apiKeySet = useSettingsStore((state) => state.settings?.dashscope_api_key_set ?? false);
  const pushToast = useUiStore((state) => state.pushToast);
  const { t } = useI18n();

  const [presetMinutes, setPresetMinutes] = useState<number>(0);
  const [customMinutes, setCustomMinutes] = useState<string>("");

  const ready = wsState === "open";
  const canStart = ready && !isListening && !!courseId && apiKeySet;

  const minutesToUse = presetMinutes === -1 ? Number(customMinutes || 0) : presetMinutes;

  const PRESETS: { label: string; minutes: number }[] = [
    { label: t.listen_autoStop_none, minutes: 0 },
    { label: t.listen_autoStop_30, minutes: 30 },
    { label: t.listen_autoStop_60, minutes: 60 },
    { label: t.listen_autoStop_90, minutes: 90 },
  ];

  const handleStart = () => {
    if (!courseId) {
      pushToast({ level: "warning", message: t.listen_warn_chooseCourse });
      return;
    }
    if (!apiKeySet) {
      pushToast({ level: "warning", message: t.listen_warn_apiKey });
      navigate("/settings");
      return;
    }
    send("start_listening", {
      course_id: courseId,
      auto_stop_seconds: Math.max(0, Math.round(minutesToUse * 60)),
      auto_stop_label: presetMinutes === -1 ? `${minutesToUse} ${t.common_minutes}` : "",
    });
  };

  const handleStop = () => send("stop_listening", {});

  const handleAutoStopChange = (value: number) => {
    setPresetMinutes(value);
    if (value !== -1 && isListening) {
      send("update_auto_stop", { seconds: Math.max(0, value * 60) });
    }
  };

  const handleApplyCustom = () => {
    const n = Number(customMinutes);
    if (Number.isNaN(n) || n < 0) return;
    if (isListening) {
      send("update_auto_stop", { seconds: Math.round(n * 60), label: `${n} ${t.common_minutes}` });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {!isListening ? (
        <Button size="lg" onClick={handleStart} disabled={!canStart}>
          {wsState !== "open" ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Play size={16} />
          )}
          {t.listen_start}
        </Button>
      ) : (
        <Button size="lg" variant="danger" onClick={handleStop}>
          <Pause size={16} />
          {t.listen_stop}
        </Button>
      )}

      <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-700">
        <Timer size={14} className="text-slate-500 dark:text-slate-400" />
        <Select
          value={presetMinutes}
          onChange={(event) => handleAutoStopChange(Number(event.target.value))}
          className="border-0 px-1 py-1 text-sm focus:ring-0"
        >
          {PRESETS.map((preset) => (
            <option key={preset.minutes} value={preset.minutes}>
              {preset.label}
            </option>
          ))}
          <option value={-1}>{t.listen_autoStop_custom}</option>
        </Select>
        {presetMinutes === -1 ? (
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={1}
              value={customMinutes}
              onChange={(event) => setCustomMinutes(event.target.value)}
              className="w-20 px-2 py-1 text-sm"
              placeholder={t.listen_minutesPlaceholder}
            />
            {isListening ? (
              <Button variant="secondary" size="sm" onClick={handleApplyCustom}>
                {t.common_apply}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <StatusBadge status={status} isListening={isListening} />

      {isListening && autoStopRemaining > 0 ? (
        <Badge tone={autoStopRemaining <= 30 ? "warning" : "info"}>
          {t.listen_remaining} {formatCountdown(autoStopRemaining)}
        </Badge>
      ) : null}
    </div>
  );
}

function StatusBadge({
  status,
  isListening,
}: {
  status: string;
  isListening: boolean;
}) {
  const { t } = useI18n();
  if (status === "error") return <Badge tone="danger">{t.listen_status_error}</Badge>;
  if (isListening) return <Badge tone="success">{t.listen_status_listening}</Badge>;
  if (status === "stopped") return <Badge tone="neutral">{t.listen_status_stopped}</Badge>;
  return <Badge tone="info">{t.listen_status_ready}</Badge>;
}
