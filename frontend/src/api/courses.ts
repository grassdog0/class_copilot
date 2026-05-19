import { apiRequest } from "./client";
import type { Course } from "./types";

export function listCourses(): Promise<Course[]> {
  return apiRequest<Course[]>("/courses");
}

export function createCourse(name: string): Promise<Course> {
  return apiRequest<Course>("/courses", { method: "POST", body: { name } });
}

export function renameCourse(id: string, name: string): Promise<Course> {
  return apiRequest<Course>(`/courses/${id}`, { method: "PATCH", body: { name } });
}

export function deleteCourse(id: string): Promise<void> {
  return apiRequest<void>(`/courses/${id}`, { method: "DELETE" });
}
