import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useCoursesStore } from "@/stores/courses";

interface CourseSelectProps {
  disabled?: boolean;
}

export function CourseSelect({ disabled }: CourseSelectProps) {
  const courses = useCoursesStore((state) => state.items);
  const selectedId = useCoursesStore((state) => state.selectedId);
  const select = useCoursesStore((state) => state.select);
  const create = useCoursesStore((state) => state.create);

  const [adding, setAdding] = useState(courses.length === 0);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    const created = await create(trimmed);
    setSubmitting(false);
    if (created) {
      setName("");
      setAdding(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="label">课程</label>
      {!adding ? (
        <div className="flex items-center gap-2">
          <Select
            disabled={disabled}
            value={selectedId ?? ""}
            onChange={(event) => select(event.target.value || null)}
            className="min-w-48"
          >
            {courses.length === 0 ? (
              <option value="">暂无课程</option>
            ) : (
              <>
                <option value="" disabled>
                  请选择课程
                </option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </>
            )}
          </Select>
          <Button variant="secondary" onClick={() => setAdding(true)} disabled={disabled}>
            <Plus size={14} />
            新建
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            placeholder="新课程名"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleCreate();
              if (event.key === "Escape") setAdding(courses.length === 0);
            }}
            className="min-w-48"
          />
          <Button className="min-w-14" onClick={() => void handleCreate()} disabled={submitting}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : "添加"}
          </Button>
          {courses.length > 0 ? (
            <Button variant="ghost" onClick={() => setAdding(false)}>
              取消
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
