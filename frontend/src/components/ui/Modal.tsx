import { useEffect } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/i18n";

interface ModalProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

export function Modal({ open, title, description, onClose, footer, children }: ModalProps) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 dark:bg-black/60"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md animate-fade-in"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="card-header">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
            {description ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p> : null}
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            onClick={onClose}
            aria-label={t.common_close}
          >
            <X size={16} />
          </button>
        </div>
        <div className="card-body">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
