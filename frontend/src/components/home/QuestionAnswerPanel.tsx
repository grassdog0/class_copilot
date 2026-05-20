import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Markdown } from "@/components/Markdown";
import { useQuestionsStore } from "@/stores/questions";
import { useSessionStore } from "@/stores/session";
import { useWsSend } from "@/ws/useWebSocket";
import { cn } from "@/lib/cn";
import { formatConfidence } from "@/lib/format";
import { useI18n } from "@/i18n";

export function QuestionAnswerPanel() {
  const questions = useQuestionsStore((state) => state.items);
  const selectedId = useQuestionsStore((state) => state.selectedId);
  const select = useQuestionsStore((state) => state.selectQuestion);
  const isListening = useSessionStore((state) => state.isListening);
  const send = useWsSend();
  const selected = questions.find((item) => item.id === selectedId) ?? null;
  const { t } = useI18n();

  return (
    <div className="card flex min-h-[22rem] flex-col">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-brand-500" />
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t.qa_panel_title}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">{questions.length}</span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!isListening}
          onClick={() => send("force_answer", {})}
        >
          <Wand2 size={12} />
          {t.qa_force}
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
        <div className="min-h-0 border-b border-slate-200 dark:border-slate-700 lg:border-b-0 lg:border-r">
          {questions.length === 0 ? (
            <div className="h-full p-4">
              <EmptyState
                title={isListening ? t.qa_empty_listening : t.qa_empty_idle}
                description={isListening ? t.qa_empty_listening_desc : ""}
                className="h-full border-none p-0"
              />
            </div>
          ) : (
            <ul className="flex max-h-[24rem] flex-col gap-2 overflow-y-auto p-4">
              {questions.map((question) => (
                <li key={question.id}>
                  <button
                    type="button"
                    onClick={() => select(question.id)}
                    className={cn(
                      "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors",
                      selectedId === question.id
                        ? "border-brand-300 bg-brand-50 dark:border-brand-600 dark:bg-brand-900/30"
                        : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-slate-500",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={question.source === "manual" ? "info" : "neutral"}>
                        {question.source === "manual" ? t.qa_source_manual : t.qa_source_auto}
                      </Badge>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {t.qa_confidence} {formatConfidence(question.confidence)}
                      </span>
                      {question.answerStreaming ? (
                        <span className="inline-flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400">
                          <Loader2 size={11} className="animate-spin" />
                          {t.qa_generating}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-3 text-slate-800 dark:text-slate-200">{question.text}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-h-0 p-4">
          {selected ? (
            <div className="flex h-full min-h-[12rem] flex-col">
              <div className="border-b border-slate-100 pb-3 dark:border-slate-700">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{selected.text}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone={selected.source === "manual" ? "info" : "neutral"}>
                    {selected.source === "manual" ? t.qa_source_manual : t.qa_source_auto}
                  </Badge>
                  {selected.answerType ? (
                    <Badge tone="info">{selected.answerType === "brief" ? t.qa_answerType_brief : t.qa_answerType_detailed}</Badge>
                  ) : null}
                  {selected.answerStreaming ? (
                    <span className="inline-flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400">
                      <Loader2 size={12} className="animate-spin" />
                      {t.qa_generating}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pt-3">
                {selected.answerContent ? (
                  <Markdown content={selected.answerContent} />
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">{t.qa_waiting_answer}</p>
                )}
              </div>
            </div>
          ) : (
            <EmptyState
              title={t.qa_select_title}
              description={t.qa_select_desc}
              className="h-full min-h-[12rem] border-none p-0"
            />
          )}
        </div>
      </div>
    </div>
  );
}
