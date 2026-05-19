import { useEffect, useRef } from "react";
import { useTranscriptsStore } from "@/stores/transcripts";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import { formatEpoch } from "@/lib/time";

interface Props {
  isListening: boolean;
}

export function TranscriptStream({ isListening }: Props) {
  const finals = useTranscriptsStore((state) => state.finals);
  const interim = useTranscriptsStore((state) => state.interim);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [finals.length, interim?.text]);

  return (
    <div className="card flex h-full min-h-[24rem] flex-col">
      <div className="card-header">
        <span className="text-sm font-semibold text-slate-900">实时转写</span>
        <span className="text-xs text-slate-500">{finals.length} 段</span>
      </div>
      <div ref={containerRef} className="card-body flex-1 overflow-y-auto">
        {finals.length === 0 && !interim ? (
          <EmptyState
            title={isListening ? "正在等待语音..." : "尚未开始监听"}
            description={isListening ? "说话后这里会出现实时转写" : "点击「开始监听」启动转写"}
            className="border-none p-0"
          />
        ) : (
          <div className="space-y-2 font-mono text-[13px] leading-relaxed">
            {finals.map((line) => (
              <div
                key={line.id}
                className="grid grid-cols-[auto_1fr] gap-3 rounded-sm px-1 py-0.5 hover:bg-slate-50"
              >
                <span className="select-none text-slate-400">
                  {formatEpoch(line.startTime)}
                </span>
                <span className="text-slate-800">{line.text}</span>
              </div>
            ))}
            {interim ? (
              <div
                className={cn(
                  "grid grid-cols-[auto_1fr] gap-3 rounded-sm px-1 py-0.5",
                  "bg-brand-50/60 text-brand-700",
                )}
              >
                <span className="select-none text-brand-400">…</span>
                <span>{interim.text}</span>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
