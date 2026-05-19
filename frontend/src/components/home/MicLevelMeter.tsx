import { useMemo } from "react";
import { useMicMonitor } from "@/hooks/useMicMonitor";
import { Mic } from "lucide-react";
import { cn } from "@/lib/cn";

interface Props {
  active: boolean;
}

export function MicLevelMeter({ active }: Props) {
  const snapshot = useMicMonitor(active);

  const dbDisplay = Number.isFinite(snapshot.db) ? snapshot.db : -120;
  const clampedDb = Math.max(-80, Math.min(0, dbDisplay));
  const level = useMemo(() => {
    const normalized = (clampedDb + 80) / 80;
    return Math.max(0, Math.min(1, Math.max(snapshot.peak, normalized)));
  }, [clampedDb, snapshot.peak]);

  return (
    <div className="flex w-full max-w-[22rem] items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 sm:w-[22rem]">
      <div className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-slate-600">
        <Mic size={13} />
        <span>麦克风</span>
      </div>
      <div className="h-2 min-w-20 flex-1 overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn(
            "h-full rounded-full transition-[width,background-color]",
            snapshot.clipping
              ? "bg-rose-500"
              : level > 0.75
                ? "bg-amber-500"
                : "bg-emerald-500",
          )}
          style={{ width: active ? `${Math.max(2, level * 100)}%` : "0%" }}
        />
      </div>
      <div
        className={cn(
          "w-16 shrink-0 text-right text-xs font-medium tabular-nums",
          snapshot.clipping ? "text-rose-600" : "text-slate-500",
        )}
      >
        {active ? (snapshot.clipping ? "削波" : `${clampedDb.toFixed(1)} dBFS`) : "未监听"}
      </div>
    </div>
  );
}
