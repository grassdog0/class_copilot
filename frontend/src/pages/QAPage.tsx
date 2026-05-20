import { AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { QuestionAnswerPanel } from "@/components/home/QuestionAnswerPanel";
import { useSessionStore } from "@/stores/session";
import { useI18n } from "@/i18n";

export function QAPage() {
  const isListening = useSessionStore((state) => state.isListening);
  const { t } = useI18n();

  return (
    <div className="flex min-h-[calc(100vh-6.5rem)] flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t.qa_title}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t.qa_subtitle}
        </p>
      </div>

      {!isListening ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">{t.qa_noSession_title}</p>
            <p className="mt-0.5 text-xs">
              {t.qa_noSession_prefix}
              <Link to="/" className="mx-1 font-medium text-amber-900 underline dark:text-amber-200">
                {t.qa_noSession_link}
              </Link>
              {t.qa_noSession_suffix}
            </p>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <QuestionAnswerPanel />
      </div>
    </div>
  );
}
