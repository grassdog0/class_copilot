import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useSettingsStore } from "@/stores/settings";
import type { AnswerType, AsrModel, Language } from "@/api/types";
import { Sparkles } from "lucide-react";

export function ModelSection() {
  const settings = useSettingsStore((state) => state.settings);
  const update = useSettingsStore((state) => state.update);
  if (!settings) return null;

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Sparkles size={14} />
            模型与回答
          </span>
        }
        description="实时 ASR 模型仅在下次会话生效；自动参考答案输出风格与语言立即生效。"
      />
      <CardBody>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="实时 ASR 模型">
            <Select
              value={settings.asr_model}
              onChange={(event) => {
                void update({ asr_model: event.target.value as AsrModel });
              }}
            >
              <option value="qwen3.5-omni-flash-realtime">qwen3.5-omni-flash-realtime</option>
              <option value="qwen3.5-omni-plus-realtime">qwen3.5-omni-plus-realtime</option>
            </Select>
          </Field>
          <Field label="自动参考答案输出风格">
            <Select
              value={settings.auto_answer_type}
              onChange={(event) => {
                void update({ auto_answer_type: event.target.value as AnswerType });
              }}
            >
              <option value="brief">简要输出</option>
              <option value="detailed">详细输出</option>
            </Select>
            <p className="text-xs text-slate-500">
              作为提示词注入到自动参考答案生成模型，控制检测到课堂问题后的回答详略；不影响主动提问聊天。
            </p>
          </Field>
          <Field label="语言">
            <Select
              value={settings.language}
              onChange={(event) => {
                void update({ language: event.target.value as Language });
              }}
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
            </Select>
          </Field>
        </div>
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
