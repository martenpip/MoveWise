/**
 * Lesson recommendations, always with the reason and the evidence behind them. A recommendation needs enough data:
 * a theme needs at least 5 puzzles (the same bar the puzzle trainer uses for a weak theme), a Game Review weakness
 * needs to show in at least 3 reviewed games. With less than that, nothing is suggested from performance.
 */
import type { PuzzleEvent, ReviewEvent } from '../profile/types';
import { MIN_ATTEMPTS, themeSkills } from '../puzzles/skills';
import { themeLabel } from '../puzzles/themes';
import { TAG_LABEL } from '../review/explain';
import type { Tag } from '../review/types';
import {
  courseAccess, courseState, lessonState, type Curriculum, type Evidence,
} from './progress';
import type { Path } from './types';

export type RecKind = 'continue' | 'next' | 'weak-theme' | 'game-weakness' | 'game-phase' | 'review';

export interface Recommendation {
  kind: RecKind;
  lessonId: string;
  title: string;
  /** Why, in plain words. */
  reason: string;
  /** The numbers behind it, when there are some. */
  evidence?: string;
}

/** A weakness must appear in this many reviewed games before it is mentioned. */
export const MIN_REVIEW_GAMES = 3;
export const MIN_PHASE_GAMES = 3;

export interface Inputs {
  reviews: readonly ReviewEvent[];
  /** Puzzle attempts from the trainer; own-game exercises are excluded here. */
  puzzles: readonly PuzzleEvent[];
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export const REVIEW_WEAKNESS_WORDS: Record<string, string> = {
  'hung-piece': 'leaving pieces to be captured',
  'lost-material': 'losing material',
  'missed-capture': 'missing material you could win',
  'missed-mate': 'missing a forced checkmate',
  'allowed-mate': 'allowing a forced checkmate',
  'threw-away-advantage': 'letting a winning position slip',
};

/** Lessons backed by evidence from the player's own results. */
export function evidenceRecommendations(cur: Curriculum, ev: Evidence, inputs: Inputs): Recommendation[] {
  const out: Recommendation[] = [];
  const seen = new Set<string>();
  const add = (r: Recommendation) => {
    if (seen.has(r.lessonId)) return;
    const loc = cur.lessons.get(r.lessonId);
    if (!loc) return;
    const st = lessonState(loc, ev, cur).status;
    if (st === 'mastered') return;
    seen.add(r.lessonId);
    out.push(r);
  };

  // Puzzle themes that keep going wrong.
  const puzzles = inputs.puzzles.filter((p) => !p.puzzleId.startsWith('game:'));
  const skills = themeSkills(puzzles);
  for (const s of [...skills.values()].filter((x) => x.level === 'weak' && x.attempts >= MIN_ATTEMPTS).sort((a, b) => a.weighted - b.weighted)) {
    for (const loc of cur.order.filter((l) => l.lesson.puzzleThemes?.includes(s.theme))) {
      add({
        kind: 'weak-theme', lessonId: loc.lesson.id, title: loc.lesson.title,
        reason: `${themeLabel(s.theme)} puzzles keep going wrong, and this lesson teaches the idea behind them.`,
        evidence: `${s.clean} of ${s.attempts} ${themeLabel(s.theme).toLowerCase()} puzzles solved cleanly.`,
      });
      break;
    }
  }

  // Weaknesses that recur across reviewed games.
  const counts = new Map<string, number>();
  for (const r of inputs.reviews) for (const t of r.weaknesses) counts.set(t, (counts.get(t) ?? 0) + 1);
  for (const [tag, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    if (n < MIN_REVIEW_GAMES) continue;
    for (const loc of cur.order.filter((l) => l.lesson.reviewTags?.includes(tag as Tag))) {
      add({
        kind: 'game-weakness', lessonId: loc.lesson.id, title: loc.lesson.title,
        reason: `Game Review found you ${REVIEW_WEAKNESS_WORDS[tag] ?? (TAG_LABEL[tag as Tag] ?? tag).toLowerCase()} again and again. This lesson is about avoiding it.`,
        evidence: `It showed up in ${n} of your ${inputs.reviews.length} reviewed games.`,
      });
      break;
    }
  }

  // A phase of the game that is much weaker than the rest.
  const ph = (k: 'opening' | 'middlegame' | 'endgame') => inputs.reviews.map((r) => r.phaseAcpl[k]).filter((x): x is number => x !== null);
  const end = ph('endgame');
  const rest = mean([...ph('opening'), ...ph('middlegame')]);
  const endAvg = mean(end);
  if (end.length >= MIN_PHASE_GAMES && endAvg !== null && rest !== null && endAvg >= Math.max(40, rest * 1.5)) {
    const loc = cur.order.find((l) => l.lesson.reviewPhases?.includes('endgame'));
    if (loc) {
      add({
        kind: 'game-phase', lessonId: loc.lesson.id, title: loc.lesson.title,
        reason: 'Your endgames lose much more than the rest of your games, so endgame fundamentals should pay off.',
        evidence: `Average centipawn loss in the endgame: ${Math.round(endAvg)}, against ${Math.round(rest)} earlier (${end.length} reviewed games).`,
      });
    }
  }
  return out;
}

export interface Plan {
  /** A lesson the learner started and has not finished. */
  continue: Recommendation | null;
  /** The next lesson on the learner's path. */
  next: Recommendation | null;
  /** Lessons to revisit because later results were poor. */
  review: Recommendation[];
  /** Lessons backed by puzzle or Game Review evidence. */
  evidence: Recommendation[];
}

export function currentPath(paths: readonly Path[], cur: Curriculum, ev: Evidence): Path | null {
  // The first path with unfinished courses; the learner's stated level picks where to look first.
  const done = (courseId: string) => {
    const c = cur.courseById.get(courseId);
    if (!c) return true;
    const st = courseState(c, ev, cur).status;
    return st === 'completed' || st === 'mastered';
  };
  const first = ev.meta?.level === 'advanced' ? 'advanced' : ev.meta?.level === 'regular' ? 'tactician' : null;
  const ordered = first ? [...paths].sort((a, b) => Number(b.id === first) - Number(a.id === first)) : paths;
  return ordered.find((p) => !p.courses.every(done)) ?? paths[0] ?? null;
}

export function plan(cur: Curriculum, paths: readonly Path[], ev: Evidence, inputs: Inputs): Plan {
  const rec = (kind: RecKind, lessonId: string, reason: string, evidence?: string): Recommendation => ({ kind, lessonId, title: cur.lessons.get(lessonId)!.lesson.title, reason, evidence });
  let cont: Recommendation | null = null;
  const inProgress = [...ev.lessonRecords.values()].filter((r) => r.completedAt === undefined && cur.lessons.has(r.lessonId)).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (inProgress) cont = rec('continue', inProgress.lessonId, 'You started this lesson and have not finished it.');

  const review: Recommendation[] = [];
  for (const loc of cur.order) {
    const st = lessonState(loc, ev, cur);
    if (st.status === 'needs-review') review.push(rec('review', loc.lesson.id, st.notes[0] ?? 'Recent results suggest a refresher.'));
  }

  let next: Recommendation | null = null;
  const path = currentPath(paths, cur, ev);
  const courses = (path?.courses ?? []).map((id) => cur.courseById.get(id)!).filter(Boolean);
  outer: for (const course of courses) {
    const access = courseAccess(course, ev, cur);
    if (!access.open) continue;
    for (const ch of course.chapters) for (const lesson of ch.lessons) {
      const st = lessonState(cur.lessons.get(lesson.id)!, ev, cur).status;
      if (st === 'not-started' || st === 'in-progress') {
        if (cont && cont.lessonId === lesson.id) continue;
        next = rec('next', lesson.id, `The next lesson in ${course.title}.`);
        break outer;
      }
    }
  }
  return { continue: cont, next, review, evidence: evidenceRecommendations(cur, ev, inputs) };
}

/** Where a new learner should begin, from what they said and, if they said nothing, what their own results show. */
export interface StartAdvice {
  path: string;
  /** Course placement checks worth offering. */
  placement: string[];
  why: string;
}
export function startAdvice(ev: Evidence, puzzleRating: { rating: number; attempts: number } | null, playing: { rating: number; confident: boolean } | null): StartAdvice {
  const lvl = ev.meta?.level;
  if (lvl === 'advanced') return { path: 'advanced', placement: ['beginner', 'tactics', 'positional'], why: 'You said you are an advanced player. Take the placement checks to skip what you already know.' };
  if (lvl === 'regular') return { path: 'tactician', placement: ['beginner'], why: 'You said you play regularly. A short placement check can skip the basics.' };
  if (lvl === 'rules') return { path: 'beginner', placement: ['beginner'], why: 'You know the rules. Try the placement check to skip what you already know, or start with the principles chapter.' };
  if (lvl === 'new') return { path: 'beginner', placement: [], why: 'Start at the beginning. Nothing is assumed.' };
  if (puzzleRating && puzzleRating.attempts >= 10 && puzzleRating.rating >= 1300) return { path: 'tactician', placement: ['beginner'], why: `Your puzzle rating is about ${Math.round(puzzleRating.rating)}, so you may already know the basics. A placement check can confirm it.` };
  if (playing && playing.confident && playing.rating >= 1000) return { path: 'tactician', placement: ['beginner'], why: 'Your results suggest you know the basics. A placement check can confirm it.' };
  return { path: 'beginner', placement: [], why: 'Start with the beginner path, or tell the Academy how much you already know.' };
}
