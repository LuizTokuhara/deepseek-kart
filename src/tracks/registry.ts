import type { CourseDefinition } from "./course";
import { deepseekRaceway } from "./courses/deepseek-raceway";
import { meadowLoop } from "./courses/meadow-loop";
import { vanillaLake } from "./courses/vanilla-lake";

/** Register new course folders here; no changes to Game are needed. */
export const courses: readonly CourseDefinition[] = [
  deepseekRaceway,
  meadowLoop,
  vanillaLake,
];
export const defaultCourse = deepseekRaceway;

export function getCourse(id: string | null): CourseDefinition {
  return courses.find((course) => course.layout.id === id) ?? defaultCourse;
}
