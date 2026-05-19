import { create } from "zustand";
import type { Course } from "@/api/types";
import * as coursesApi from "@/api/courses";
import { ApiError } from "@/api/client";
import { useUiStore } from "./ui";

interface CoursesState {
  items: Course[];
  loading: boolean;
  selectedId: string | null;
  load: () => Promise<void>;
  create: (name: string) => Promise<Course | null>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  select: (id: string | null) => void;
}

export const useCoursesStore = create<CoursesState>((set, get) => ({
  items: [],
  loading: false,
  selectedId: null,
  load: async () => {
    set({ loading: true });
    try {
      const items = await coursesApi.listCourses();
      set({ items, loading: false });
      // keep selection if still present, otherwise select first
      const selectedId = get().selectedId;
      if (!selectedId || !items.some((c) => c.id === selectedId)) {
        set({ selectedId: items[0]?.id ?? null });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "加载课程失败";
      useUiStore.getState().pushToast({ level: "error", message });
      set({ loading: false });
    }
  },
  create: async (name) => {
    try {
      const course = await coursesApi.createCourse(name);
      set((state) => ({ items: [course, ...state.items], selectedId: course.id }));
      useUiStore.getState().pushToast({ level: "info", message: `已新建课程「${course.name}」` });
      return course;
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : err instanceof Error ? err.message : "新建课程失败";
      useUiStore.getState().pushToast({ level: "error", message: detail });
      return null;
    }
  },
  rename: async (id, name) => {
    try {
      const updated = await coursesApi.renameCourse(id, name);
      set((state) => ({
        items: state.items.map((c) => (c.id === id ? updated : c)),
      }));
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : err instanceof Error ? err.message : "重命名失败";
      useUiStore.getState().pushToast({ level: "error", message: detail });
      throw err;
    }
  },
  remove: async (id) => {
    try {
      await coursesApi.deleteCourse(id);
      set((state) => {
        const items = state.items.filter((c) => c.id !== id);
        const selectedId =
          state.selectedId === id ? (items[0]?.id ?? null) : state.selectedId;
        return { items, selectedId };
      });
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : err instanceof Error ? err.message : "删除课程失败";
      useUiStore.getState().pushToast({ level: "error", message: detail });
      throw err;
    }
  },
  select: (id) => set({ selectedId: id }),
}));
