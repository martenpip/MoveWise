/** The bundled curriculum, indexed once. Content lives in ./content; nothing here is fetched. */
import type { AcademyShape, Curriculum as Sections } from '../profile/features';
import { indexCurriculum } from './progress';
import { CONTENT_COURSES, CONTENT_PATHS } from './content';

export const COURSES = CONTENT_COURSES;
export const PATHS = CONTENT_PATHS;
export const CURRICULUM_INDEX = indexCurriculum(COURSES);

/** Course -> its lesson ids (used by the "Chess Scholar" achievement). */
export const ACADEMY_SECTIONS: Sections = Object.fromEntries(COURSES.map((c) => [c.title, c.chapters.flatMap((ch) => ch.lessons.map((l) => l.id))]));

export const ACADEMY_SHAPE_DATA: AcademyShape = {
  chapters: Object.fromEntries(COURSES.flatMap((c) => c.chapters.map((ch) => [ch.id, ch.lessons.map((l) => l.id)]))),
  courses: COURSES.map((c) => c.id),
  beginnerCourse: 'beginner',
};

export const TOTAL_LESSONS = CURRICULUM_INDEX.lessons.size;
