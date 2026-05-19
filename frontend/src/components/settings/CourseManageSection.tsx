import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useCoursesStore } from "@/stores/courses";
import { useUiStore } from "@/stores/ui";
import type { Course, SessionListItem } from "@/api/types";
import { listSessions } from "@/api/sessions";
import { ApiError } from "@/api/client";
import { BookOpen, Pencil, Trash2 } from "lucide-react";
import { formatLocalDate } from "@/lib/time";

export function CourseManageSection() {
  const courses = useCoursesStore((state) => state.items);
  const refresh = useCoursesStore((state) => state.load);
  const rename = useCoursesStore((state) => state.rename);
  const remove = useCoursesStore((state) => state.remove);
  const pushToast = useUiStore((state) => state.pushToast);

  const [renameTarget, setRenameTarget] = useState<Course | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Lazy-fetch session counts for delete UX
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sessions = await listSessions();
        if (cancelled) return;
        const map: Record<string, number> = {};
        for (const session of sessions as SessionListItem[]) {
          map[session.course_id] = (map[session.course_id] ?? 0) + 1;
        }
        setCounts(map);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courses.length]);

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <BookOpen size={14} />
            课程管理
          </span>
        }
        description="可在监听主页内联新建课程；这里管理已有课程。"
      />
      <CardBody>
        {courses.length === 0 ? (
          <p className="text-sm text-slate-500">暂无课程，请先在监听主页新建。</p>
        ) : (
          <div className="overflow-hidden rounded-md border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">课程名</th>
                  <th className="px-3 py-2 text-left font-medium">会话数</th>
                  <th className="px-3 py-2 text-left font-medium">创建时间</th>
                  <th className="px-3 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-sm">
                {courses.map((course) => {
                  const sessionsCount = counts[course.id] ?? 0;
                  return (
                    <tr key={course.id}>
                      <td className="px-3 py-2 text-slate-800">{course.name}</td>
                      <td className="px-3 py-2 text-slate-600">{sessionsCount}</td>
                      <td className="px-3 py-2 text-slate-500">
                        {formatLocalDate(course.created_at)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRenameTarget(course)}
                          >
                            <Pencil size={12} />
                            重命名
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={sessionsCount > 0}
                            title={sessionsCount > 0 ? "课程下还有会话" : ""}
                            onClick={() => setDeleteTarget(course)}
                          >
                            <Trash2 size={12} />
                            删除
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>

      <RenameCourseModal
        target={renameTarget}
        onClose={() => setRenameTarget(null)}
        onSaved={async (name) => {
          if (!renameTarget) return;
          try {
            await rename(renameTarget.id, name);
            pushToast({ level: "success", message: "已更新课程名" });
            setRenameTarget(null);
          } catch {
            // toast handled
          }
        }}
      />

      <Modal
        open={!!deleteTarget}
        title="删除课程"
        description="此操作不可恢复。"
        onClose={() => setDeleteTarget(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!deleteTarget) return;
                try {
                  await remove(deleteTarget.id);
                  pushToast({ level: "success", message: "已删除课程" });
                  setDeleteTarget(null);
                  await refresh();
                } catch (err) {
                  if (err instanceof ApiError) {
                    pushToast({ level: "error", message: err.detail });
                  }
                }
              }}
            >
              确认删除
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">确认删除课程「{deleteTarget?.name}」？</p>
      </Modal>
    </Card>
  );
}

function RenameCourseModal({
  target,
  onClose,
  onSaved,
}: {
  target: Course | null;
  onClose: () => void;
  onSaved: (name: string) => void | Promise<void>;
}) {
  const [name, setName] = useState(target?.name ?? "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setName(target?.name ?? "");
  }, [target?.id, target?.name]);

  if (!target) return null;

  return (
    <Modal
      open
      title="重命名课程"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            onClick={async () => {
              if (!name.trim()) return;
              setSubmitting(true);
              await onSaved(name.trim());
              setSubmitting(false);
            }}
            disabled={submitting || !name.trim()}
          >
            保存
          </Button>
        </>
      }
    >
      <Input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="课程名"
      />
    </Modal>
  );
}
