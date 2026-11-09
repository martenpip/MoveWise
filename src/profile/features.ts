import { ACADEMY_SECTIONS as SECTIONS, ACADEMY_SHAPE_DATA as SHAPE } from '../academy/curriculum';

/**
 * Which learning features actually exist in this build. Achievements that depend on a feature stay inactive
 * (and are shown as "Not available yet") until its flag is true, so nothing can be unlocked by records that no
 * real feature produced. When puzzles, lessons or Game Review are built, flip the flag here and write their
 * records with `store.addActivity`; their achievements (already registered) switch on without other changes.
 */
export type Feature = 'puzzles' | 'lessons' | 'review';
export type FeatureFlags = Record<Feature, boolean>;

export const FEATURES: FeatureFlags = { puzzles: true, lessons: true, review: true };

export const FEATURE_NAMES: Record<Feature, string> = { puzzles: 'Puzzles', lessons: 'Lessons', review: 'Game Review' };

/**
 * Lesson ids grouped by curriculum section, for "complete an entire section". Empty until lessons exist.
 * Example: { 'Basic tactics': ['fork-1', 'fork-2', 'pin-1'] }.
 */
export type Curriculum = Record<string, string[]>;

/** What the chapter and course achievements need to know about the Academy. Built from the real content in src/academy. */
export interface AcademyShape {
  /** Chapter id -> its lesson ids. */
  chapters: Record<string, string[]>;
  /** Every course id (each has an assessment). */
  courses: string[];
  /** The course a first-time learner starts with. */
  beginnerCourse: string;
}

export const CURRICULUM: Curriculum = SECTIONS;
export const ACADEMY_SHAPE: AcademyShape = SHAPE;
