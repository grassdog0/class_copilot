import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import type { Course, SessionListItem } from "@/api/types";
import { listSessions } from "@/api/sessions";
import { listCourses } from "@/api/courses";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { useUiStore } from "@/stores/ui";
import { SessionListGrouped } from "@/components/sessions/SessionListGrouped";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { useI18n } from "@/i18n";

export function SessionsPage() {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterCourseId, setFilterCourseId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const { t } = useI18n();

  const pushToast = useUiStore((state) => state.pushToast);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [sessionsRes, coursesRes] = await Promise.all([
        listSessions(filterCourseId ? { course_id: filterCourseId } : {}),
        listCourses(),
      ]);
      setSessions(sessionsRes);
      setCourses(coursesRes);
    } catch (err) {
      pushToast({
        level: "error",
        message: err instanceof Error ? err.message : t.sessions_loadFailed,
      });
    } finally {
      setLoading(false);
    }
  }, [filterCourseId, pushToast, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateSearch = useDebouncedCallback((value: string) => {
    setDebouncedSearch(value);
  }, 250);

  const filtered = useMemo(() => {
    if (!debouncedSearch.trim()) return sessions;
    const needle = debouncedSearch.trim().toLowerCase();
    return sessions.filter((session) =>
      [
        session.custom_name ?? "",
        session.course_name ?? "",
        session.date,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [sessions, debouncedSearch]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t.sessions_title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <Input
              placeholder={t.sessions_search}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                updateSearch(event.target.value);
              }}
              className="w-56 pl-7"
            />
          </div>
          <Select
            value={filterCourseId}
            onChange={(event) => setFilterCourseId(event.target.value)}
            className="w-44"
          >
            <option value="">{t.sessions_allCourses}</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </Select>
          <Button variant="secondary" onClick={() => void refresh()}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : t.common_refresh}
          </Button>
        </div>
      </div>

      {loading && sessions.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2 size={20} className="animate-spin text-slate-400" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={t.sessions_empty_title}
          description={t.sessions_empty_desc}
        />
      ) : (
        <SessionListGrouped sessions={filtered} onChanged={() => void refresh()} />
      )}
    </div>
  );
}
