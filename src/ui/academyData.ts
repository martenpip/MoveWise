/** Loading and saving Academy progress. Everything is stored on this device (IndexedDB). */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COURSES, CURRICULUM_INDEX, PATHS } from '../academy/curriculum';
import {
  COURSE_PASS, EMPTY_EVIDENCE, evidenceFrom, isPlaced, newAssessmentRecord, newLessonRecord, recordAssessment, recordCheck,
  assessState, type Evidence,
} from '../academy/progress';
import { plan, type Plan } from '../academy/recommend';
import { PASS_SCORE, type AcademyRecord, type AssessmentRecord, type CheckAttempt, type ExerciseRecord, type Lesson, type LessonRecord, type MetaRecord } from '../academy/types';
import { puzzles as puzzleEvents, reviews as reviewEvents } from '../profile/training';
import { ASSESS_PREFIX, type ReviewEvent } from '../profile/types';
import { useApp } from './app';

export interface AcademyData {
  loaded: boolean;
  records: AcademyRecord[];
  evidence: Evidence;
  plan: Plan;
  reviews: ReviewEvent[];
}

const EMPTY_PLAN: Plan = { continue: null, next: null, review: [], evidence: [] };

export function useAcademyData(): AcademyData {
  const { store, dataVersion } = useApp();
  const [state, setState] = useState<{ loaded: boolean; records: AcademyRecord[]; puzzles: ReturnType<typeof puzzleEvents>; reviews: ReviewEvent[] }>({ loaded: false, records: [], puzzles: [], reviews: [] });
  useEffect(() => {
    let live = true;
    (async () => {
      const [records, activity] = await Promise.all([store.listAcademy(), store.listActivity()]);
      if (live) setState({ loaded: true, records, puzzles: puzzleEvents(activity), reviews: reviewEvents(activity) });
    })().catch(() => live && setState((s) => ({ ...s, loaded: true })));
    return () => {
      live = false;
    };
  }, [store, dataVersion]);
  return useMemo(() => {
    const evidence = state.loaded ? evidenceFrom(state.records, state.puzzles) : EMPTY_EVIDENCE;
    const p = state.loaded ? plan(CURRICULUM_INDEX, PATHS, evidence, { reviews: state.reviews, puzzles: state.puzzles }) : EMPTY_PLAN;
    return { loaded: state.loaded, records: state.records, evidence, plan: p, reviews: state.reviews };
  }, [state]);
}

export interface AcademyActions {
  /** Saves the furthest step and exercise results of a lesson in progress. */
  saveLessonProgress: (lesson: Lesson, step: number, exercise?: { id: string; rec: ExerciseRecord }) => Promise<LessonRecord>;
  /** Records a finished lesson check. */
  finishLessonCheck: (lesson: Lesson, topic: string, attempt: CheckAttempt) => Promise<LessonRecord>;
  /** Records a finished chapter check or course assessment (or placement check). */
  finishAssessment: (id: string, scope: 'chapter' | 'course', title: string, attempt: CheckAttempt, placement: boolean) => Promise<AssessmentRecord>;
  setMeta: (patch: Partial<Omit<MetaRecord, 'id' | 'kind' | 'updatedAt'>>) => Promise<void>;
}

export function useAcademyActions(data: AcademyData): AcademyActions {
  const { store, notifyDataChanged, checkAchievements } = useApp();
  const { evidence } = data;
  // Writes made in quick succession must build on each other, not on the last loaded copy.
  const fresh = useRef(new Map<string, LessonRecord | AssessmentRecord>());
  const lessonBase = (id: string): LessonRecord | undefined => {
    const a = evidence.lessonRecords.get(id);
    const b = fresh.current.get(`lesson:${id}`) as LessonRecord | undefined;
    return b && (!a || b.updatedAt >= a.updatedAt) ? b : a;
  };
  const assessBase = (id: string): AssessmentRecord | undefined => {
    const a = evidence.assessments.get(id);
    const b = fresh.current.get(`assess:${id}`) as AssessmentRecord | undefined;
    return b && (!a || b.updatedAt >= a.updatedAt) ? b : a;
  };
  const done = useCallback(() => {
    notifyDataChanged();
    void checkAchievements();
  }, [notifyDataChanged, checkAchievements]);
  return useMemo<AcademyActions>(
    () => ({
      async saveLessonProgress(lesson, step, exercise) {
        const now = Date.now();
        const base = lessonBase(lesson.id) ?? newLessonRecord(lesson.id, now);
        const rec: LessonRecord = {
          ...base, updatedAt: now, step: Math.max(base.step, step),
          exercises: exercise ? { ...base.exercises, [exercise.id]: exercise.rec } : base.exercises,
        };
        fresh.current.set(rec.id, rec);
        await store.putAcademy(rec);
        const meta = evidence.meta;
        await store.putAcademy({ id: 'meta', kind: 'meta', updatedAt: now, opened: meta?.opened ?? [], level: meta?.level, lastLessonId: lesson.id });
        notifyDataChanged();
        return rec;
      },
      async finishLessonCheck(lesson, topic, attempt) {
        const base = lessonBase(lesson.id) ?? newLessonRecord(lesson.id, attempt.at);
        const rec = recordCheck(lesson, base, attempt);
        fresh.current.set(rec.id, rec);
        await store.putAcademy(rec);
        if (rec.completedAt !== undefined) {
          // One event per lesson, kept up to date as the learner retakes the check.
          await store.addActivity({ id: `lesson:${lesson.id}`, kind: 'lesson', at: rec.completedAt, lessonId: lesson.id, topic, completed: true, score: Math.max(...rec.checks.map((c) => c.score)) });
        }
        done();
        return rec;
      },
      async finishAssessment(id, scope, title, attempt, placement) {
        const base = assessBase(id) ?? newAssessmentRecord(id, scope, attempt.at);
        const course = scope === 'course' ? id : (CURRICULUM_INDEX.chapters.get(id)?.course.id ?? id);
        const hasWork = [...CURRICULUM_INDEX.order].some((l) => l.course.id === course && evidence.lessonRecords.has(l.lesson.id)) || [...evidence.assessments.keys()].some((k) => k !== id && CURRICULUM_INDEX.chapters.get(k)?.course.id === course);
        const pass = scope === 'course' ? COURSE_PASS : PASS_SCORE;
        const rec = recordAssessment(base, attempt, pass, placement, hasWork);
        fresh.current.set(rec.id, rec);
        await store.putAcademy(rec);
        const placedNow = placement && rec.placed === true;
        if (attempt.score >= pass && !placedNow) {
          await store.addActivity({ id: `${ASSESS_PREFIX}${id}`, kind: 'lesson', at: attempt.at, lessonId: `${ASSESS_PREFIX}${id}`, topic: title, completed: true, score: attempt.score, assessment: scope, passed: true });
        }
        done();
        return rec;
      },
      async setMeta(patch) {
        const meta = evidence.meta;
        await store.putAcademy({ id: 'meta', kind: 'meta', updatedAt: Date.now(), opened: meta?.opened ?? [], level: meta?.level, lastLessonId: meta?.lastLessonId, ...patch });
        notifyDataChanged();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, evidence, done, notifyDataChanged],
  );
}

export { COURSES, CURRICULUM_INDEX, PATHS, assessState, isPlaced };
