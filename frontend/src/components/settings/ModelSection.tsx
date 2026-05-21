import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useSettingsStore } from "@/stores/settings";
import type { AnswerModel, AnswerType, AsrModel, OutputLanguage } from "@/api/types";
import { Sparkles } from "lucide-react";
import { useI18n } from "@/i18n";

export function ModelSection() {
  const settings = useSettingsStore((state) => state.settings);
  const update = useSettingsStore((state) => state.update);
  const { t } = useI18n();
  if (!settings) return null;

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Sparkles size={14} />
            {t.model_title}
          </span>
        }
        description={t.model_desc}
      />
      <CardBody>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={t.model_field_asrModel}>
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
          <Field label={t.model_field_asrLanguage}>
            <Select
              value={settings.asr_language}
              onChange={(event) => {
                void update({ asr_language: event.target.value as OutputLanguage });
              }}
            >
              <option value="zh">{t.model_lang_zh}</option>
              <option value="en">{t.model_lang_en}</option>
              <option value="bilingual">{t.model_lang_bilingual}</option>
            </Select>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t.model_asrLanguage_hint}
            </p>
          </Field>
          <Field label={t.model_field_autoAnswerType}>
            <Select
              value={settings.auto_answer_type}
              onChange={(event) => {
                void update({ auto_answer_type: event.target.value as AnswerType });
              }}
            >
              <option value="brief">{t.model_answer_brief}</option>
              <option value="detailed">{t.model_answer_detailed}</option>
            </Select>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t.model_autoAnswerType_hint}
            </p>
          </Field>
          <Field label={t.model_field_autoAnswerLanguage}>
            <Select
              value={settings.auto_answer_language}
              onChange={(event) => {
                void update({ auto_answer_language: event.target.value as OutputLanguage });
              }}
            >
              <option value="zh">{t.model_lang_zh}</option>
              <option value="en">{t.model_lang_en}</option>
              <option value="bilingual">{t.model_lang_bilingual}</option>
            </Select>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t.model_autoAnswerLanguage_hint}
            </p>
          </Field>
          <Field label={t.model_field_autoAnswerModel}>
            <Select
              value={settings.auto_answer_model}
              onChange={(event) => {
                void update({ auto_answer_model: event.target.value as AnswerModel });
              }}
            >
              <option value="qwen3.5-flash">qwen3.5-flash</option>
              <option value="qwen3.5-plus">qwen3.5-plus</option>
            </Select>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t.model_autoAnswerModel_hint}
            </p>
          </Field>
          <Field label={t.model_field_chatLanguage}>
            <Select
              value={settings.chat_language}
              onChange={(event) => {
                void update({ chat_language: event.target.value as OutputLanguage });
              }}
            >
              <option value="zh">{t.model_lang_zh}</option>
              <option value="en">{t.model_lang_en}</option>
              <option value="bilingual">{t.model_lang_bilingual}</option>
            </Select>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t.model_chatLanguage_hint}
            </p>
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
