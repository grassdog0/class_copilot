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
import { useI18n, tpl } from "@/i18n";

export function CourseManageSection() {
  const courses = useCoursesStore((state) => state.items);
  const refresh = useCoursesStore((state) => state.load);
  const rename = useCoursesStore((state) => state.rename);
  const remove = useCoursesStore((state) => state.remove);
  const pushToast = useUiStore((state) => state.pushToast);
  const { t } = useI18n();

  const [renameTarget, setRenameTarget] = useState<Course | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

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
            {t.cm_title}
          </span>
        }
        description={t.cm_desc}
      />
      <CardBody>
        {courses.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t.cm_empty}</p>
        ) : (
          <div className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">{t.cm_col_name}</th>
                  <th className="px-3 py-2 text-left font-medium">{t.cm_col_count}</th>
                  <th className="px-3 py-2 text-left font-medium">{t.cm_col_created}</th>
                  <th className="px-3 py-2 text-right font-medium">{t.cm_col_actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-sm dark:divide-slate-700 dark:bg-slate-800">
                {courses.map((course) => {
                  const sessionsCount = counts[course.id] ?? 0;
                  return (
                    <tr key={course.id}>
                      <td className="px-3 py-2 text-slate-800 dark:text-slate-200">{course.name}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{sessionsCount}</td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
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
                            {t.common_rename}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={sessionsCount > 0}
                            title={sessionsCount > 0 ? t.cm_hasSessions : ""}
                            onClick={() => setDeleteTarget(course)}
                          >
                            <Trash2 size={12} />
                            {t.common_delete}
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
            pushToast({ level: "success", message: t.cm_renamed });
            setRenameTarget(null);
          } catch {
            // toast handled
          }
        }}
      />

      <Modal
        open={!!deleteTarget}
        title={t.cm_deleteTitle}
        description={t.cm_deleteIrreversible}
        onClose={() => setDeleteTarget(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              {t.common_cancel}
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!deleteTarget) return;
                try {
                  await remove(deleteTarget.id);
                  pushToast({ level: "success", message: t.cm_deleted });
                  setDeleteTarget(null);
                  await refresh();
                } catch (err) {
                  if (err instanceof ApiError) {
                    pushToast({ level: "error", message: err.detail });
                  }
                }
              }}
            >
              {t.sessions_deleteConfirm}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700 dark:text-slate-300">
          {tpl(t.cm_deleteConfirmText, { name: deleteTarget?.name ?? "" })}
        </p>
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
  const { t } = useI18n();

  useEffect(() => {
    setName(target?.name ?? "");
  }, [target?.id, target?.name]);

  if (!target) return null;

  return (
    <Modal
      open
      title={t.cm_renameTitle}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common_cancel}
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
            {t.common_save}
          </Button>
        </>
      }
    >
      <Input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={t.cm_renamePlaceholder}
      />
    </Modal>
  );
}
