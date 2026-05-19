import { Sparkles, Hand } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { useQuestionsStore } from "@/stores/questions";
import { useSessionStore } from "@/stores/session";
import { useWsSend } from "@/ws/useWebSocket";
import { cn } from "@/lib/cn";
import { formatConfidence } from "@/lib/format";

export function QuestionList() {
  const questions = useQuestionsStore((state) => state.items);
  const selectedId = useQuestionsStore((state) => state.selectedId);
  const select = useQuestionsStore((state) => state.selectQuestion);
  const isListening = useSessionStore((state) => state.isListening);
  const send = useWsSend();

  return (
    <div className="card flex h-full flex-col">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-brand-500" />
          <span className="text-sm font-semibold text-slate-900">检测到的问题</span>
          <span className="text-xs text-slate-500">{questions.length}</span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!isListening}
          onClick={() => send("manual_detect", {})}
        >
          <Hand size={12} />
          手动检测
        </Button>
      </div>
      <div className="card-body flex-1 overflow-y-auto">
        {questions.length === 0 ? (
          <EmptyState
            title={isListening ? "尚未检测到问题" : "尚未开始监听"}
            description={isListening ? "AI 检测到老师提问后会出现在这里" : ""}
            className="border-none p-0"
          />
        ) : (
          <ul className="flex flex-col gap-2">
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
                  <div className="flex items-center gap-2">
                    <Badge tone={question.source === "manual" ? "info" : "neutral"}>
                      {question.source === "manual" ? "手动" : "自动"}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      置信度 {formatConfidence(question.confidence)}
                    </span>
                    {question.answerStreaming ? (
                      <span className="text-xs text-brand-600">生成中…</span>
                    ) : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-slate-800">{question.text}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
