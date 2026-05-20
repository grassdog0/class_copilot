import { Link } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { CourseSelect } from "@/components/home/CourseSelect";
import { ListenControls } from "@/components/home/ListenControls";
import { MicLevelMeter } from "@/components/home/MicLevelMeter";
import { TranscriptStream } from "@/components/home/TranscriptStream";
import { useI18n } from "@/i18n";

export function HomePage() {
  const isListening = useSessionStore((state) => state.isListening);
  const apiKeySet = useSettingsStore((state) => state.settings?.dashscope_api_key_set ?? false);
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-6">
      {!apiKeySet ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">{t.home_apiKeyMissing_title}</p>
            <p className="mt-0.5 text-xs">
              {t.home_apiKeyMissing_prefix}
              <Link to="/settings" className="mx-1 font-medium text-amber-900 underline dark:text-amber-200">
                {t.home_apiKeyMissing_link}
              </Link>
              {t.home_apiKeyMissing_suffix}
            </p>
          </div>
        </div>
      ) : null}

      <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-6">
            <CourseSelect disabled={isListening} />
            <ListenControls />
          </div>
          <MicLevelMeter active={isListening} />
        </div>
      </section>

      <TranscriptStream isListening={isListening} />
    </div>
  );
}
