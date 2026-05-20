import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { SessionListItem } from "@/api/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { renameSession, deleteSession } from "@/api/sessions";
import { ApiError } from "@/api/client";
import { useUiStore } from "@/stores/ui";
import { useI18n } from "@/i18n";
import {
  formatDateGroup,
  formatLocalTime,
  parseUtc,
} from "@/lib/time";

interface Props {
  sessions: SessionListItem[];
  onChanged: () => void;
}

interface RenameTarget {
  id: string;
  name: string;
}

export function SessionListGrouped({ sessions, onChanged }: Props) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SessionListItem | null>(null);
  const { t } = useI18n();

  const groups = useMemo(() => groupByDate(sessions), [sessions]);

  return (
    <>
      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <section key={group.key} className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {group.label}
            </h2>
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {group.items.map((session) => (
                <li
                  key={session.id}
                  className="card relative px-4 py-3 transition-colors hover:border-slate-300 dark:hover:border-slate-500"
                >
                  <Link
                    to={`/sessions/${session.id}`}
                    className="flex flex-col gap-2 outline-none"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-1 items-center gap-2 truncate pr-8">
                        <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {session.custom_name ?? session.course_name ?? t.common_unnamed}
                        </span>
                        <SessionStatusBadge status={session.status} />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span>{session.course_name ?? t.common_dash}</span>
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {formatLocalTime(session.started_at)} – {formatLocalTime(session.ended_at)}
                      </span>
                    </div>
                  </Link>
                  <div className="absolute right-2 top-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setOpenMenuId(openMenuId === session.id ? null : session.id);
                      }}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                      aria-label={t.sessions_more}
                    >
                      <MoreHorizontal size={14} />
                    </button>
                    {openMenuId === session.id ? (
                      <div className="absolute right-0 top-7 z-20 w-32 rounded-md border border-slate-200 bg-white py-1 shadow-md dark:border-slate-600 dark:bg-slate-800">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
                          onClick={() => {
                            setRenameTarget({
                              id: session.id,
                              name: session.custom_name ?? "",
                            });
                            setOpenMenuId(null);
                          }}
                        >
                          <Pencil size={12} />
                          {t.common_rename}
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/30"
                          onClick={() => {
                            setDeleteTarget(session);
                            setOpenMenuId(null);
                          }}
                        >
                          <Trash2 size={12} />
                          {t.common_delete}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <RenameModal
        target={renameTarget}
        onClose={() => setRenameTarget(null)}
        onSaved={() => {
          setRenameTarget(null);
          onChanged();
        }}
      />

      <DeleteModal
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => {
          setDeleteTarget(null);
          onChanged();
        }}
      />
    </>
  );
}

function SessionStatusBadge({ status }: { status: SessionListItem["status"] }) {
  const { t } = useI18n();
  if (status === "active") return <Badge tone="info">{t.sessions_status_active}</Badge>;
  if (status === "interrupted") return <Badge tone="warning">{t.sessions_status_interrupted}</Badge>;
  return <Badge tone="neutral">{t.sessions_status_stopped}</Badge>;
}

interface DateGroup {
  key: string;
  label: string;
  items: SessionListItem[];
}

function groupByDate(sessions: SessionListItem[]): DateGroup[] {
  const map = new Map<string, SessionListItem[]>();
  for (const session of sessions) {
    const date = parseUtc(session.started_at);
    const key = date ? date.toLocaleDateString("zh-CN") : session.date;
    const list = map.get(key) ?? [];
    list.push(session);
    map.set(key, list);
  }
  return Array.from(map.entries()).map(([key, items]) => ({
    key,
    label: formatDateGroup(items[0]!.started_at),
    items,
  }));
}

function RenameModal({
  target,
  onClose,
  onSaved,
}: {
  target: RenameTarget | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(target?.name ?? "");
  const [submitting, setSubmitting] = useState(false);
  const pushToast = useUiStore((state) => state.pushToast);
  const { t } = useI18n();

  useEffect(() => {
    setName(target?.name ?? "");
  }, [target?.id, target?.name]);

  if (!target) return null;

  const handleSave = async () => {
    setSubmitting(true);
    try {
      await renameSession(target.id, name.trim() || null);
      onSaved();
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : t.sessions_renameFailed;
      pushToast({ level: "error", message: detail });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      title={t.sessions_renameTitle}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common_cancel}
          </Button>
          <Button onClick={handleSave} disabled={submitting}>
            {t.common_save}
          </Button>
        </>
      }
    >
      <Input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={t.sessions_renameInputPlaceholder}
      />
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t.sessions_renameHint}</p>
    </Modal>
  );
}

function DeleteModal({
  target,
  onClose,
  onDeleted,
}: {
  target: SessionListItem | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const pushToast = useUiStore((state) => state.pushToast);
  const { t } = useI18n();
  if (!target) return null;

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await deleteSession(target.id);
      pushToast({ level: "success", message: t.sessions_deleted });
      onDeleted();
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : t.sessions_deleteFailed;
      pushToast({ level: "error", message: detail });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      title={t.sessions_deleteTitle}
      description={t.sessions_deleteDesc}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common_cancel}
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={submitting}>
            {t.sessions_deleteConfirm}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-700 dark:text-slate-300">
        {t.sessions_deleteTitle}「{target.custom_name ?? target.course_name ?? target.id}」
      </p>
    </Modal>
  );
}
