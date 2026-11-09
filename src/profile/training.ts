/**
 * Analytics over the activity records that puzzle training, lessons and Game Review will write.
 * Those features are NOT built yet, so in the app these functions currently receive empty lists and the
 * profile shows honest "not available yet" states. They exist (and are unit-tested with synthetic data in
 * tests/) so each future feature only has to write records; no redesign of the profile is needed.
 */
import { PUZZLE_START_RATING, puzzleRating, type PuzzleRatingPoint } from '../puzzles/rating';
import { isAssessmentId, type ActivityEvent, type LessonEvent, type PuzzleEvent, type ReviewEvent } from './types';

export const puzzles = (a: ActivityEvent[]): PuzzleEvent[] => a.filter((e): e is PuzzleEvent => e.kind === 'puzzle');
/** Lessons only. Academy assessments are stored as lesson events too, but they are not lessons and are returned by `assessments`. */
export const lessons = (a: ActivityEvent[]): LessonEvent[] => a.filter((e): e is LessonEvent => e.kind === 'lesson' && !isAssessmentId(e.lessonId));
export const assessments = (a: ActivityEvent[]): LessonEvent[] => a.filter((e): e is LessonEvent => e.kind === 'lesson' && isAssessmentId(e.lessonId));
export const reviews = (a: ActivityEvent[]): ReviewEvent[] => a.filter((e): e is ReviewEvent => e.kind === 'review');

/** Puzzle rating is a separate Glicko-2 track against the puzzles' own published ratings (see src/puzzles/rating.ts). It never mixes with the playing rating. */
export const PUZZLE_PROVISIONAL_ATTEMPTS = 20;
export { PUZZLE_START_RATING };
export type { PuzzleRatingPoint };

export interface PuzzleStats {
  /** Every recorded attempt (including practice and Rush). */
  attempts: number;
  solved: number;
  successRate: number | null;
  /** Mean time over SOLVED puzzles, ms. */
  avgSolveMs: number | null;
  rating: number | null;
  rd: number | null;
  /** Attempts that counted for the rating. */
  ratedAttempts: number;
  provisional: boolean;
  peak: number | null;
  history: PuzzleRatingPoint[];
  byTheme: Array<{ theme: string; attempts: number; solved: number; successRate: number }>;
  /** Themes with at least `minAttempts` attempts, sorted weakest first. */
  weakest: Array<{ theme: string; attempts: number; successRate: number }>;
  strongest: Array<{ theme: string; attempts: number; successRate: number }>;
}

export function puzzleStats(events: ActivityEvent[], minThemeAttempts = 5): PuzzleStats {
  // Positions taken from the player's own games are exercises, not puzzles: they stay out of puzzle statistics.
  const ps = puzzles(events).filter((p) => !p.puzzleId.startsWith('game:')).sort((a, b) => a.at - b.at);
  const pr = puzzleRating(ps);
  const solvedList = ps.filter((p) => p.solved);
  const themes = new Map<string, { attempts: number; solved: number }>();
  for (const p of ps) for (const t of new Set(p.themes)) {
    const row = themes.get(t) ?? { attempts: 0, solved: 0 };
    row.attempts++;
    if (p.solved) row.solved++;
    themes.set(t, row);
  }
  const byTheme = [...themes.entries()]
    .map(([theme, r]) => ({ theme, ...r, successRate: r.solved / r.attempts }))
    .sort((a, b) => b.attempts - a.attempts || a.theme.localeCompare(b.theme));
  const enough = byTheme.filter((t) => t.attempts >= minThemeAttempts);
  return {
    attempts: ps.length,
    solved: solvedList.length,
    successRate: ps.length ? solvedList.length / ps.length : null,
    avgSolveMs: solvedList.length ? solvedList.reduce((a, p) => a + p.timeMs, 0) / solvedList.length : null,
    rating: pr.attempts ? pr.rating : null,
    rd: pr.attempts ? pr.rd : null,
    ratedAttempts: pr.attempts,
    provisional: pr.attempts < PUZZLE_PROVISIONAL_ATTEMPTS || pr.provisional,
    peak: pr.peak,
    history: pr.history,
    byTheme,
    weakest: [...enough].sort((a, b) => a.successRate - b.successRate).slice(0, 3),
    strongest: [...enough].sort((a, b) => b.successRate - a.successRate).slice(0, 3),
  };
}

export interface LessonStats {
  completed: number;
  /** completed / totalLessons, or null when the number of available lessons is unknown or zero. */
  completionRate: number | null;
  topics: Array<{ topic: string; completed: number; avgScore: number | null; status: 'mastered' | 'practice' | 'learning' }>;
}

/**
 * Topic status: "mastered" needs ≥ 2 completed lessons with an average score ≥ 80%;
 * "practice" is an average score below 60%; everything else is "learning".
 */
export function lessonStats(events: ActivityEvent[], totalLessons: number): LessonStats {
  const done = lessons(events).filter((l) => l.completed);
  const unique = new Map<string, LessonEvent>();
  for (const l of done) unique.set(l.lessonId, l); // latest completion wins (events may arrive in any order)
  const byTopic = new Map<string, LessonEvent[]>();
  for (const l of unique.values()) (byTopic.get(l.topic) ?? byTopic.set(l.topic, []).get(l.topic)!).push(l);
  const topics = [...byTopic.entries()]
    .map(([topic, ls]) => {
      const scored = ls.filter((l) => l.score !== null);
      const avg = scored.length ? scored.reduce((a, l) => a + l.score!, 0) / scored.length : null;
      const status: 'mastered' | 'practice' | 'learning' =
        avg !== null && avg < 0.6 ? 'practice' : ls.length >= 2 && avg !== null && avg >= 0.8 ? 'mastered' : 'learning';
      return { topic, completed: ls.length, avgScore: avg, status };
    })
    .sort((a, b) => a.topic.localeCompare(b.topic));
  return { completed: unique.size, completionRate: totalLessons > 0 ? unique.size / totalLessons : null, topics };
}

export interface QualityStats {
  reviewedGames: number;
  avgAcpl: number | null;
  avgAccuracy: number | null;
  inaccuraciesPerGame: number | null;
  mistakesPerGame: number | null;
  blundersPerGame: number | null;
  missedTacticsPerGame: number | null;
  phaseAcpl: { opening: number | null; middlegame: number | null; endgame: number | null };
  best: ReviewEvent | null;
  worst: ReviewEvent | null;
  weaknesses: Array<{ tag: string; count: number }>;
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Quality figures from Game Review records. Best/worst are by accuracy. */
export function qualityStats(events: ActivityEvent[]): QualityStats {
  const rs = reviews(events);
  const per = (f: (r: ReviewEvent) => number) => mean(rs.map(f));
  const phase = (k: 'opening' | 'middlegame' | 'endgame') => mean(rs.map((r) => r.phaseAcpl[k]).filter((x): x is number => x !== null));
  const tags = new Map<string, number>();
  for (const r of rs) for (const t of r.weaknesses) tags.set(t, (tags.get(t) ?? 0) + 1);
  const byAcc = [...rs].sort((a, b) => b.accuracy - a.accuracy);
  return {
    reviewedGames: rs.length,
    avgAcpl: per((r) => r.acpl),
    avgAccuracy: per((r) => r.accuracy),
    inaccuraciesPerGame: per((r) => r.inaccuracies),
    mistakesPerGame: per((r) => r.mistakes),
    blundersPerGame: per((r) => r.blunders),
    missedTacticsPerGame: per((r) => r.missedTactics),
    phaseAcpl: { opening: phase('opening'), middlegame: phase('middlegame'), endgame: phase('endgame') },
    best: byAcc[0] ?? null,
    worst: byAcc.length ? byAcc[byAcc.length - 1]! : null,
    weaknesses: [...tags.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
  };
}
