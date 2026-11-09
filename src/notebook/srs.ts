/**
 * Spaced repetition for the Mistake Notebook: a small scheduler inspired by SM-2, adapted to chess positions.
 *
 * Pure, deterministic and tested: the same schedule, grade and time always give the same result. Nothing here reads the clock;
 * callers pass `now` (epoch milliseconds).
 *
 * Grades (decided by `gradeFor` from what actually happened in a practice attempt):
 *   failed - a wrong move was the final answer, or the solution had to be shown. Back soon, ease falls.
 *   hard   - solved, but only with a lot of help (the direct hint, or several wrong tries). Short interval.
 *   good   - solved with a small hint, or on the second try. Moderate interval.
 *   easy   - solved on the first try with no help. Longer interval.
 */
import { HISTORY_LIMIT, type Grade, type NotebookEntry, type NotebookStatus, type Schedule } from './types';

export const DAY_MS = 86_400_000;
export const MINUTE_MS = 60_000;
export const START_EASE = 2.5;
export const MIN_EASE = 1.3;
export const MAX_EASE = 3.0;
export const MAX_INTERVAL_DAYS = 365;
/** A failed position comes back after this long: inside the same session, but not immediately. */
export const RELEARN_MS = 10 * MINUTE_MS;
/** A position counts as retained once it has been recalled three times in a row and is spaced at least this far out. */
export const RETAINED_DAYS = 21;
export const RETAINED_REPS = 3;

export function newSchedule(now: number): Schedule {
  return { reps: 0, lapses: 0, ease: START_EASE, intervalDays: 0, due: now, lastReviewed: null, attempts: 0, lastGrade: null, history: [] };
}

const clampEase = (e: number): number => Math.min(MAX_EASE, Math.max(MIN_EASE, Math.round(e * 100) / 100));
const clampDays = (d: number): number => Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(d)));

export interface Attempt {
  /** Wrong moves tried before the right one (or before giving up). */
  wrong: number;
  /** Highest hint level used: 0 (none) to 3 (the direct clue). */
  hints: 0 | 1 | 2 | 3;
  solved: boolean;
  /** The solution was revealed. */
  revealed: boolean;
}

export function gradeFor(a: Attempt): Grade {
  if (!a.solved || a.revealed) return 'failed';
  if (a.hints >= 3 || a.wrong >= 3 || (a.hints >= 2 && a.wrong >= 1)) return 'hard';
  if (a.hints >= 1 || a.wrong >= 1) return 'good';
  return 'easy';
}

/** The next schedule after a review. Does not change `s`. */
export function reschedule(s: Schedule, grade: Grade, now: number): Schedule {
  let { reps, lapses, ease, intervalDays } = s;
  let due: number;
  if (grade === 'failed') {
    if (reps > 0 || s.attempts > 0) lapses += 1;
    reps = 0;
    ease = clampEase(ease - 0.2);
    intervalDays = 0;
    due = now + RELEARN_MS;
  } else {
    const prev = intervalDays;
    if (grade === 'hard') {
      intervalDays = reps === 0 ? 1 : clampDays(Math.max(1, prev) * 1.2);
      ease = clampEase(ease - 0.15);
    } else if (grade === 'good') {
      intervalDays = reps === 0 ? 1 : reps === 1 ? 3 : clampDays(prev * ease);
    } else {
      intervalDays = reps === 0 ? 3 : reps === 1 ? 7 : clampDays(prev * ease * 1.3);
      ease = clampEase(ease + 0.1);
    }
    reps += 1;
    due = now + intervalDays * DAY_MS;
  }
  const history = [...s.history, { at: now, grade }].slice(-HISTORY_LIMIT);
  return { reps, lapses, ease, intervalDays, due, lastReviewed: now, attempts: s.attempts + 1, lastGrade: grade, history };
}

/** End of the local calendar day containing `now`. */
export function endOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export const isDue = (e: Pick<NotebookEntry, 'srs'>, now: number): boolean => e.srs.due <= now;
/** Due at any point today (so it can be reviewed in today's session). */
export const isDueToday = (e: Pick<NotebookEntry, 'srs'>, now: number): boolean => e.srs.due <= endOfDay(now);

/**
 * Where an entry stands:
 *   new            never practised
 *   needs-practice failed last time, or failed repeatedly and still on short intervals
 *   due            scheduled for today or earlier
 *   retained       recalled several times in a row, with a long interval
 *   learning       being recalled, interval still short
 *   upcoming       scheduled for a later day
 * An entry that is both due and needs practice shows as needs-practice, because that is the more useful thing to say.
 */
export function statusOf(e: Pick<NotebookEntry, 'srs'>, now: number): NotebookStatus {
  const s = e.srs;
  if (s.attempts === 0) return isDueToday(e, now) ? 'new' : 'upcoming';
  if (s.lastGrade === 'failed' || (s.lapses >= 2 && s.intervalDays < 14)) return 'needs-practice';
  if (isDueToday(e, now)) return 'due';
  if (s.reps >= RETAINED_REPS && s.intervalDays >= RETAINED_DAYS) return 'retained';
  if (s.intervalDays >= 1 && s.reps >= 1 && s.intervalDays < 7) return 'learning';
  return 'upcoming';
}

/** Entries for a focused session: everything due today, hardest first (failed, then most overdue), at most `limit`. */
export function sessionQueue(entries: readonly NotebookEntry[], now: number, limit = 10): NotebookEntry[] {
  return entries
    .filter((e) => isDueToday(e, now))
    .sort((a, b) => {
      const fa = a.srs.lastGrade === 'failed' ? 0 : 1;
      const fb = b.srs.lastGrade === 'failed' ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return a.srs.due - b.srs.due || a.savedAt - b.savedAt || a.id.localeCompare(b.id);
    })
    .slice(0, limit);
}

/** Days from `now` until the entry is due, rounded up (0 = today or overdue). */
export const daysUntilDue = (e: Pick<NotebookEntry, 'srs'>, now: number): number => (e.srs.due <= endOfDay(now) ? 0 : Math.ceil((e.srs.due - endOfDay(now)) / DAY_MS));
