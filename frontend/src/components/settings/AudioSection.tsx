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
import { useI18n } from "@/i18n";

export function AudioSection() {
  const settings = useSettingsStore((state) => state.settings);
  const update = useSettingsStore((state) => state.update);
  const pushToast = useUiStore((state) => state.pushToast);
  const [devices, setDevices] = useState<AudioDevicesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const { t } = useI18n();

  const refresh = async () => {
    setLoading(true);
    try {
      const result = await getAudioDevices();
      setDevices(result);
    } catch (err) {
      pushToast({
        level: "error",
        message: err instanceof Error ? err.message : t.audio_loadFailed,
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
            {t.audio_title}
          </span>
        }
        description={t.audio_desc}
        actions={
          <Button variant="ghost" size="sm" onClick={() => void refresh()}>
            <RefreshCcw size={12} />
            {t.common_refresh}
          </Button>
        }
      />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={t.audio_source}>
            <Select
              value={settings.audio_source}
              onChange={(event) =>
                void updateField({
                  audio_source: event.target.value as AudioSource,
                  audio_device_id: null,
                })
              }
            >
              <option value="microphone">{t.audio_source_microphone}</option>
              <option value="loopback" disabled={!devices?.loopback.available}>
                {t.audio_source_loopback}{devices && !devices.loopback.available ? t.audio_source_loopback_unavailable : ""}
              </option>
            </Select>
          </Field>
          <Field label={t.audio_device}>
            {loading && !devices ? (
              <div className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <Loader2 size={12} className="animate-spin" />
                {t.common_loading}
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
                <option value="">{t.audio_device_default}</option>
                {devices?.microphone.devices.map((device) => (
                  <option key={device.index} value={device.index}>
                    {device.name}
                    {device.is_default ? ` (${t.common_default})` : ""}
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
                <option value="">{t.audio_device_default}</option>
                {devices?.loopback.devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name}
                    {device.is_default ? ` (${t.common_default})` : ""}
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
  const { t } = useI18n();
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-700">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{t.audio_test_title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t.audio_test_desc}</p>
        </div>
        <Button variant={active ? "secondary" : "primary"} onClick={onToggle}>
          {active ? t.audio_test_stop : t.audio_test_start}
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
                : "bg-slate-200 dark:bg-slate-600",
            )}
          />
        ))}
      </div>
    </div>
  );
}
