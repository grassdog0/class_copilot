import { useEffect, useRef } from "react";
import { useTranscriptsStore } from "@/stores/transcripts";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import { formatEpoch } from "@/lib/time";
import { useI18n } from "@/i18n";

interface Props {
  isListening: boolean;
}

export function TranscriptStream({ isListening }: Props) {
  const finals = useTranscriptsStore((state) => state.finals);
  const interim = useTranscriptsStore((state) => state.interim);
  const containerRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [finals.length, interim?.text]);

  return (
    <div className="card flex h-full min-h-[24rem] flex-col">
      <div className="card-header">
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t.transcript_title}</span>
        <span className="text-xs text-slate-500 dark:text-slate-400">{finals.length} {t.transcript_count}</span>
      </div>
      <div ref={containerRef} className="card-body flex-1 overflow-y-auto">
        {finals.length === 0 && !interim ? (
          <EmptyState
            title={isListening ? t.transcript_waiting : t.transcript_idle}
            description={isListening ? t.transcript_waitingDesc : t.transcript_idleDesc}
            className="border-none p-0"
          />
        ) : (
          <div className="space-y-2 font-mono text-[13px] leading-relaxed">
            {finals.map((line) => (
              <div
                key={line.id}
                className="grid grid-cols-[auto_1fr] gap-3 rounded-sm px-1 py-0.5 hover:bg-slate-50 dark:hover:bg-slate-700/50"
              >
                <span className="select-none text-slate-400">
                  {formatEpoch(line.startTime)}
                </span>
                <span className="text-slate-800 dark:text-slate-200">{line.text}</span>
              </div>
            ))}
            {interim ? (
              <div
                className={cn(
                  "grid grid-cols-[auto_1fr] gap-3 rounded-sm px-1 py-0.5",
                  "bg-brand-50/60 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300",
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
