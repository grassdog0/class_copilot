import { useEffect } from "react";
import { useUiStore } from "@/stores/ui";
import { cn } from "@/lib/cn";
import type { ToastLevel } from "@/stores/ui";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

const ICONS: Record<ToastLevel, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
};

const STYLES: Record<ToastLevel, string> = {
  info: "border-brand-200 bg-brand-50 text-brand-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-rose-200 bg-rose-50 text-rose-900",
};

const TOAST_TTL = 6000;

export function ToastViewport() {
  const toasts = useUiStore((state) => state.toasts);
  const dismiss = useUiStore((state) => state.dismissToast);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((toast) =>
      window.setTimeout(() => dismiss(toast.id), TOAST_TTL),
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [toasts, dismiss]);

  return (
    <div
      role="alert"
      aria-live="polite"
      className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 max-w-full flex-col gap-2"
    >
      {toasts.map((toast) => {
        const Icon = ICONS[toast.level];
        return (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex animate-fade-in items-start gap-2 rounded-md border px-3 py-2 shadow-sm",
              STYLES[toast.level],
            )}
          >
            <Icon size={16} className="mt-0.5 shrink-0" />
            <div className="flex-1 text-sm leading-snug">{toast.message}</div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="rounded p-0.5 text-current opacity-70 hover:opacity-100"
              aria-label="关闭通知"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
