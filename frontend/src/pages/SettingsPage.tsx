import { useEffect } from "react";
import { ApiKeySection } from "@/components/settings/ApiKeySection";
import { ModelSection } from "@/components/settings/ModelSection";
import { AsrParamsSection } from "@/components/settings/AsrParamsSection";
import { QuestionParamsSection } from "@/components/settings/QuestionParamsSection";
import { AudioSection } from "@/components/settings/AudioSection";
import { CourseManageSection } from "@/components/settings/CourseManageSection";
import { useSettingsStore } from "@/stores/settings";
import { useI18n } from "@/i18n";
import { Loader2 } from "lucide-react";

export function SettingsPage() {
  const settings = useSettingsStore((state) => state.settings);
  const load = useSettingsStore((state) => state.load);
  const { t } = useI18n();

  useEffect(() => {
    if (!settings) void load();
  }, [load, settings]);

  if (!settings) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 size={20} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t.settings_title}</h1>
      <ApiKeySection />
      <ModelSection />
      <AsrParamsSection />
      <QuestionParamsSection />
      <AudioSection />
      <CourseManageSection />
    </div>
  );
}
