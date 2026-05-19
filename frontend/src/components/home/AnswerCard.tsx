import { Loader2 } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { Badge } from "@/components/ui/Badge";
import { useQuestionsStore } from "@/stores/questions";
import { EmptyState } from "@/components/ui/EmptyState";

export function AnswerCard() {
  const items = useQuestionsStore((state) => state.items);
  const selectedId = useQuestionsStore((state) => state.selectedId);
  const selected = items.find((item) => item.id === selectedId) ?? null;

  if (!selected) {
    return (
      <div className="card flex h-full min-h-[12rem] flex-col">
        <div className="card-header">
          <span className="text-sm font-semibold text-slate-900">参考答案</span>
        </div>
        <div className="card-body flex-1">
          <EmptyState
            title="选择一个问题查看答案"
            description="自动检测的问题会自动选中并展示流式答案"
            className="border-none p-0"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="card flex h-full min-h-[12rem] flex-col">
      <div className="card-header">
        <div>
          <p className="text-sm font-semibold text-slate-900">{selected.text}</p>
          <div className="mt-1 flex items-center gap-2">
            <Badge tone={selected.source === "manual" ? "info" : "neutral"}>
              {selected.source === "manual" ? "手动" : "自动"}
            </Badge>
            {selected.answerType ? (
              <Badge tone="info">{selected.answerType === "brief" ? "简要" : "详细"}</Badge>
            ) : null}
            {selected.answerStreaming ? (
              <span className="inline-flex items-center gap-1 text-xs text-brand-600">
                <Loader2 size={12} className="animate-spin" />
                生成中…
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="card-body flex-1 overflow-y-auto">
        {selected.answerContent ? (
          <Markdown content={selected.answerContent} />
        ) : (
          <p className="text-sm text-slate-500">等待生成答案…</p>
        )}
      </div>
    </div>
  );
}
