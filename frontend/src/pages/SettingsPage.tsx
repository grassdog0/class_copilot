import { useEffect, useState } from "react";
import { ApiKeySection } from "@/components/settings/ApiKeySection";
import { ModelSection } from "@/components/settings/ModelSection";
import { AsrParamsSection } from "@/components/settings/AsrParamsSection";
import { QuestionParamsSection } from "@/components/settings/QuestionParamsSection";
import { AudioSection } from "@/components/settings/AudioSection";
import { CourseManageSection } from "@/components/settings/CourseManageSection";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { useSettingsStore } from "@/stores/settings";
import { useI18n } from "@/i18n";
import { ChevronDown, ChevronRight, Loader2, SlidersHorizontal } from "lucide-react";

export function SettingsPage() {
  const settings = useSettingsStore((state) => state.settings);
  const load = useSettingsStore((state) => state.load);
  const { t } = useI18n();
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
      <AudioSection />
      <ModelSection />
      <CourseManageSection />
      <ApiKeySection />
      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <SlidersHorizontal size={14} />
              {t.settings_advanced_title}
            </span>
          }
          description={t.settings_advanced_desc}
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAdvancedOpen((value) => !value)}
              aria-expanded={advancedOpen}
            >
              {advancedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {advancedOpen ? t.settings_advanced_hide : t.settings_advanced_show}
            </Button>
          }
        />
      </Card>
      {advancedOpen ? (
        <>
          <AsrParamsSection />
          <QuestionParamsSection />
        </>
      ) : null}
    </div>
  );
}
