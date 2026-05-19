import { useEffect, useRef, useState } from "react";
import { startMicMonitor, stopMicMonitor } from "@/api/audio";
import { wsClient } from "@/ws/client";
import type { MicLevelData } from "@/ws/messages";
import { useUiStore } from "@/stores/ui";
import { ApiError } from "@/api/client";

export interface MicLevelSnapshot {
  db: number;
  peak: number;
  clipping: boolean;
  receivedAt: number;
}

const INITIAL: MicLevelSnapshot = {
  db: -120,
  peak: 0,
  clipping: false,
  receivedAt: 0,
};

let activeMonitorCount = 0;

export function useMicMonitor(active: boolean): MicLevelSnapshot {
  const [snapshot, setSnapshot] = useState<MicLevelSnapshot>(INITIAL);
  const lastEventRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    activeMonitorCount += 1;

    const off = wsClient.on("mic_level", (data: MicLevelData) => {
      if (cancelled) return;
      lastEventRef.current = Date.now();
      setSnapshot({
        db: data.db,
        peak: data.peak,
        clipping: data.clipping,
        receivedAt: lastEventRef.current,
      });
    });

    startMicMonitor().catch((err: unknown) => {
      const message =
        err instanceof ApiError ? err.detail : err instanceof Error ? err.message : "无法启动麦克风监听";
      useUiStore.getState().pushToast({ level: "error", message });
    });

    // Decay if no event arrives for 500ms (visual smoothness when silent)
    const interval = window.setInterval(() => {
      if (Date.now() - lastEventRef.current > 500) {
        setSnapshot((prev) => ({ ...prev, db: -120, peak: 0, clipping: false }));
      }
    }, 250);

    return () => {
      cancelled = true;
      off();
      window.clearInterval(interval);
      activeMonitorCount = Math.max(0, activeMonitorCount - 1);
      if (activeMonitorCount === 0) {
        stopMicMonitor().catch(() => {
          /* ignore stop errors */
        });
      }
    };
  }, [active]);

  return snapshot;
}
