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

  const groups = useMemo(() => groupByDate(sessions), [sessions]);

  return (
    <>
      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <section key={group.key} className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {group.label}
            </h2>
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {group.items.map((session) => (
                <li
                  key={session.id}
                  className="card relative px-4 py-3 transition-colors hover:border-slate-300"
                >
                  <Link
                    to={`/sessions/${session.id}`}
                    className="flex flex-col gap-2 outline-none"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-1 items-center gap-2 truncate pr-8">
                        <span className="truncate text-sm font-semibold text-slate-900">
                          {session.custom_name ?? session.course_name ?? "未命名会话"}
                        </span>
                        <SessionStatusBadge status={session.status} />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>{session.course_name ?? "—"}</span>
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
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label="更多操作"
                    >
                      <MoreHorizontal size={14} />
                    </button>
                    {openMenuId === session.id ? (
                      <div className="absolute right-0 top-7 z-20 w-32 rounded-md border border-slate-200 bg-white py-1 shadow-md">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                          onClick={() => {
                            setRenameTarget({
                              id: session.id,
                              name: session.custom_name ?? "",
                            });
                            setOpenMenuId(null);
                          }}
                        >
                          <Pencil size={12} />
                          重命名
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-rose-600 hover:bg-rose-50"
                          onClick={() => {
                            setDeleteTarget(session);
                            setOpenMenuId(null);
                          }}
                        >
                          <Trash2 size={12} />
                          删除
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
  if (status === "active") return <Badge tone="info">进行中</Badge>;
  if (status === "interrupted") return <Badge tone="warning">中断</Badge>;
  return <Badge tone="neutral">已停止</Badge>;
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
      const detail = err instanceof ApiError ? err.detail : "重命名失败";
      pushToast({ level: "error", message: detail });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      title="重命名会话"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={submitting}>
            保存
          </Button>
        </>
      }
    >
      <Input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="输入会话名称"
      />
      <p className="mt-2 text-xs text-slate-500">留空恢复使用课程名作为会话名。</p>
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
  if (!target) return null;

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await deleteSession(target.id);
      pushToast({ level: "success", message: "已删除会话" });
      onDeleted();
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : "删除失败";
      pushToast({ level: "error", message: detail });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      title="删除会话"
      description="此操作不可恢复，将连同录音文件一起删除。"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={submitting}>
            确认删除
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-700">
        将删除会话「{target.custom_name ?? target.course_name ?? target.id}」。
      </p>
    </Modal>
  );
}
