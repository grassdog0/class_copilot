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

const PRESETS: { label: string; minutes: number }[] = [
  { label: "不自动停止", minutes: 0 },
  { label: "30 分钟", minutes: 30 },
  { label: "60 分钟", minutes: 60 },
  { label: "90 分钟", minutes: 90 },
];

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

  const [presetMinutes, setPresetMinutes] = useState<number>(0);
  const [customMinutes, setCustomMinutes] = useState<string>("");

  const ready = wsState === "open";
  const canStart = ready && !isListening && !!courseId && apiKeySet;

  const minutesToUse = presetMinutes === -1 ? Number(customMinutes || 0) : presetMinutes;

  const handleStart = () => {
    if (!courseId) {
      pushToast({ level: "warning", message: "请先选择课程" });
      return;
    }
    if (!apiKeySet) {
      pushToast({ level: "warning", message: "请先在设置中填写 DashScope API Key" });
      navigate("/settings");
      return;
    }
    send("start_listening", {
      course_id: courseId,
      auto_stop_seconds: Math.max(0, Math.round(minutesToUse * 60)),
      auto_stop_label: presetMinutes === -1 ? `${minutesToUse} 分钟` : "",
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
      send("update_auto_stop", { seconds: Math.round(n * 60), label: `${n} 分钟` });
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
          开始监听
        </Button>
      ) : (
        <Button size="lg" variant="danger" onClick={handleStop}>
          <Pause size={16} />
          停止监听
        </Button>
      )}

      <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1">
        <Timer size={14} className="text-slate-500" />
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
          <option value={-1}>自定义...</option>
        </Select>
        {presetMinutes === -1 ? (
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={1}
              value={customMinutes}
              onChange={(event) => setCustomMinutes(event.target.value)}
              className="w-20 px-2 py-1 text-sm"
              placeholder="分钟"
            />
            {isListening ? (
              <Button variant="secondary" size="sm" onClick={handleApplyCustom}>
                应用
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <StatusBadge status={status} isListening={isListening} />

      {isListening && autoStopRemaining > 0 ? (
        <Badge tone={autoStopRemaining <= 30 ? "warning" : "info"}>
          剩余 {formatCountdown(autoStopRemaining)}
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
  if (status === "error") return <Badge tone="danger">错误</Badge>;
  if (isListening) return <Badge tone="success">监听中</Badge>;
  if (status === "stopped") return <Badge tone="neutral">已停止</Badge>;
  return <Badge tone="info">就绪</Badge>;
}
