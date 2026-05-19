import { useMemo } from "react";
import { useMicMonitor } from "@/hooks/useMicMonitor";
import { Mic } from "lucide-react";
import { cn } from "@/lib/cn";

interface Props {
  active: boolean;
}

export function MicLevelMeter({ active }: Props) {
  const snapshot = useMicMonitor(active);
  const segments = useMemo(() => buildSegments(snapshot.peak), [snapshot.peak]);

  const dbDisplay = Number.isFinite(snapshot.db) ? snapshot.db : -120;
  const clampedDb = Math.max(-80, Math.min(0, dbDisplay));

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <Mic size={14} className="text-slate-500" />
          <span className="text-sm font-semibold text-slate-900">麦克风电平</span>
        </div>
        <div
          className={cn(
            "text-xs font-medium",
            snapshot.clipping ? "text-rose-600" : "text-slate-500",
          )}
        >
          {snapshot.clipping ? "削波！" : `${clampedDb.toFixed(1)} dBFS`}
        </div>
      </div>
      <div className="card-body">
        <div className="flex h-3 gap-0.5">
          {segments.map((segment, idx) => (
            <div
              key={idx}
              className={cn(
                "flex-1 rounded-sm transition-colors",
                segment.active ? segment.color : "bg-slate-100",
              )}
            />
          ))}
        </div>
        {!active ? (
          <p className="mt-2 text-xs text-slate-500">监听停止时不显示电平</p>
        ) : null}
      </div>
    </div>
  );
}

function buildSegments(peak: number): { active: boolean; color: string }[] {
  const SEGMENT_COUNT = 24;
  const safePeak = Math.max(0, Math.min(1, peak));
  const filled = Math.round(safePeak * SEGMENT_COUNT);
  return Array.from({ length: SEGMENT_COUNT }, (_, idx) => {
    const ratio = (idx + 1) / SEGMENT_COUNT;
    let color = "bg-emerald-500";
    if (ratio > 0.85) color = "bg-rose-500";
    else if (ratio > 0.7) color = "bg-amber-500";
    return { active: idx < filled, color };
  });
}
