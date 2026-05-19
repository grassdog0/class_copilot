import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useSettingsStore } from "@/stores/settings";
import { getAudioDevices } from "@/api/audio";
import type { AudioDevicesResponse, AudioSource, SettingsPatch } from "@/api/types";
import { useUiStore } from "@/stores/ui";
import { Loader2, Volume2, RefreshCcw } from "lucide-react";
import { useMicMonitor } from "@/hooks/useMicMonitor";
import { cn } from "@/lib/cn";

export function AudioSection() {
  const settings = useSettingsStore((state) => state.settings);
  const update = useSettingsStore((state) => state.update);
  const pushToast = useUiStore((state) => state.pushToast);
  const [devices, setDevices] = useState<AudioDevicesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const result = await getAudioDevices();
      setDevices(result);
    } catch (err) {
      pushToast({
        level: "error",
        message: err instanceof Error ? err.message : "加载音频设备失败",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  // Stop testing automatically after 5 seconds
  useEffect(() => {
    if (!testing) return;
    const timer = window.setTimeout(() => setTesting(false), 5000);
    return () => window.clearTimeout(timer);
  }, [testing]);

  if (!settings) return null;

  const updateField = async (partial: SettingsPatch) => {
    try {
      await update(partial);
    } catch {
      // toast handled in store
    }
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Volume2 size={14} />
            音频设备
          </span>
        }
        description="麦克风或系统回环；变更下次会话生效。"
        actions={
          <Button variant="ghost" size="sm" onClick={() => void refresh()}>
            <RefreshCcw size={12} />
            刷新
          </Button>
        }
      />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="音源">
            <Select
              value={settings.audio_source}
              onChange={(event) =>
                void updateField({
                  audio_source: event.target.value as AudioSource,
                  audio_device_id: null,
                })
              }
            >
              <option value="microphone">麦克风</option>
              <option value="loopback" disabled={!devices?.loopback.available}>
                系统回环{devices && !devices.loopback.available ? "（不可用）" : ""}
              </option>
            </Select>
          </Field>
          <Field label="设备">
            {loading && !devices ? (
              <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                <Loader2 size={12} className="animate-spin" />
                加载中
              </div>
            ) : settings.audio_source === "microphone" ? (
              <Select
                value={settings.audio_device_id == null ? "" : String(settings.audio_device_id)}
                onChange={(event) =>
                  void updateField({
                    audio_device_id: event.target.value === "" ? null : Number(event.target.value),
                  })
                }
              >
                <option value="">系统默认</option>
                {devices?.microphone.devices.map((device) => (
                  <option key={device.index} value={device.index}>
                    {device.name}
                    {device.is_default ? "（默认）" : ""}
                  </option>
                ))}
              </Select>
            ) : (
              <Select
                value={settings.audio_device_id == null ? "" : String(settings.audio_device_id)}
                disabled={!devices?.loopback.available}
                onChange={(event) =>
                  void updateField({
                    audio_device_id: event.target.value === "" ? null : event.target.value,
                  })
                }
              >
                <option value="">系统默认</option>
                {devices?.loopback.devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name}
                    {device.is_default ? "（默认）" : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <MicTest active={testing} onToggle={() => setTesting((v) => !v)} />
      </CardBody>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function MicTest({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  const snapshot = useMicMonitor(active);
  const segments = Math.max(0, Math.min(20, Math.round(snapshot.peak * 20)));
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-800">测试麦克风</p>
          <p className="text-xs text-slate-500">点击后说话 5 秒，观察电平条。</p>
        </div>
        <Button variant={active ? "secondary" : "primary"} onClick={onToggle}>
          {active ? "停止测试" : "开始测试"}
        </Button>
      </div>
      <div className="mt-3 flex h-3 gap-0.5">
        {Array.from({ length: 20 }, (_, idx) => (
          <div
            key={idx}
            className={cn(
              "flex-1 rounded-sm transition-colors",
              idx < segments
                ? idx > 16
                  ? "bg-rose-500"
                  : idx > 13
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                : "bg-slate-200",
            )}
          />
        ))}
      </div>
    </div>
  );
}
