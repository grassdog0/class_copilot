import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Slider } from "@/components/ui/Slider";
import { Input } from "@/components/ui/Input";
import { useSettingsStore } from "@/stores/settings";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { Brain } from "lucide-react";
import type { SettingsPatch } from "@/api/types";
import { formatPercent } from "@/lib/format";

export function QuestionParamsSection() {
  const settings = useSettingsStore((state) => state.settings);
  const patchLocal = useSettingsStore((state) => state.patchLocal);
  const update = useSettingsStore((state) => state.update);

  const debouncedUpdate = useDebouncedCallback((partial: SettingsPatch) => {
    void update(partial);
  }, 500);

  if (!settings) return null;

  const onChange = <K extends keyof SettingsPatch>(key: K, value: SettingsPatch[K]) => {
    patchLocal({ [key]: value } as never);
    debouncedUpdate({ [key]: value } as SettingsPatch);
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Brain size={14} />
            问题检测参数
          </span>
        }
        description="影响 AI 自动检测问题的灵敏度与去重。"
      />
      <CardBody className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field
          label="置信度阈值"
          hint={`当前：${formatPercent(settings.question_confidence_threshold, 0)}`}
        >
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={settings.question_confidence_threshold}
            onChange={(value) =>
              onChange("question_confidence_threshold", Number(value.toFixed(2)))
            }
          />
        </Field>
        <Field
          label="去重相似度"
          hint={`当前：${formatPercent(settings.question_similarity_threshold, 0)}`}
        >
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={settings.question_similarity_threshold}
            onChange={(value) =>
              onChange("question_similarity_threshold", Number(value.toFixed(2)))
            }
          />
        </Field>
        <Field label="冷却秒数">
          <Input
            type="number"
            min={0}
            value={settings.question_cooldown_seconds}
            onChange={(event) =>
              onChange("question_cooldown_seconds", Math.max(0, Number(event.target.value)))
            }
          />
        </Field>
      </CardBody>
    </Card>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="label">{label}</label>
      {children}
      {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
    </div>
  );
}
