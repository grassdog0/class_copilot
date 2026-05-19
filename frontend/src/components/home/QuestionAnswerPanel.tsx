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

export function QuestionAnswerPanel() {
  const questions = useQuestionsStore((state) => state.items);
  const selectedId = useQuestionsStore((state) => state.selectedId);
  const select = useQuestionsStore((state) => state.selectQuestion);
  const isListening = useSessionStore((state) => state.isListening);
  const send = useWsSend();
  const selected = questions.find((item) => item.id === selectedId) ?? null;

  return (
    <div className="card flex min-h-[22rem] flex-col">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-brand-500" />
          <span className="text-sm font-semibold text-slate-900">问题与参考答案</span>
          <span className="text-xs text-slate-500">{questions.length}</span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!isListening}
          onClick={() => send("force_answer", {})}
        >
          <Wand2 size={12} />
          强制回答
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
        <div className="min-h-0 border-b border-slate-200 lg:border-b-0 lg:border-r">
          {questions.length === 0 ? (
            <div className="h-full p-4">
              <EmptyState
                title={isListening ? "尚未检测到问题" : "尚未开始监听"}
                description={isListening ? "检测到课堂问题后，参考答案会在这里一起显示。" : ""}
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
                        ? "border-brand-300 bg-brand-50"
                        : "border-slate-200 bg-white hover:border-slate-300",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={question.source === "manual" ? "info" : "neutral"}>
                        {question.source === "manual" ? "手动" : "自动"}
                      </Badge>
                      <span className="text-xs text-slate-500">
                        置信度 {formatConfidence(question.confidence)}
                      </span>
                      {question.answerStreaming ? (
                        <span className="inline-flex items-center gap-1 text-xs text-brand-600">
                          <Loader2 size={11} className="animate-spin" />
                          生成中
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-3 text-slate-800">{question.text}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-h-0 p-4">
          {selected ? (
            <div className="flex h-full min-h-[12rem] flex-col">
              <div className="border-b border-slate-100 pb-3">
                <p className="text-sm font-semibold text-slate-900">{selected.text}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone={selected.source === "manual" ? "info" : "neutral"}>
                    {selected.source === "manual" ? "手动" : "自动"}
                  </Badge>
                  {selected.answerType ? (
                    <Badge tone="info">{selected.answerType === "brief" ? "简要" : "详细"}</Badge>
                  ) : null}
                  {selected.answerStreaming ? (
                    <span className="inline-flex items-center gap-1 text-xs text-brand-600">
                      <Loader2 size={12} className="animate-spin" />
                      生成中
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pt-3">
                {selected.answerContent ? (
                  <Markdown content={selected.answerContent} />
                ) : (
                  <p className="text-sm text-slate-500">等待生成答案...</p>
                )}
              </div>
            </div>
          ) : (
            <EmptyState
              title="选择一个问题查看答案"
              description="问题和参考答案会在同一个区域里联动显示。"
              className="h-full min-h-[12rem] border-none p-0"
            />
          )}
        </div>
      </div>
    </div>
  );
}
