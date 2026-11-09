/**
 * The achievements that ship with MoveWise. Each is a pure function of real saved data. Counting rules:
 *  - "Games" are finished games the player played against a bot in MoveWise, including resignations and draws.
 *    Games restored from a MoveWise backup keep their original source and count (they are the player's own history).
 *    Games imported from PGN files have no human side and never count.
 *  - Streaks of results are consecutive finished games, oldest first; a draw ends a winning or losing run.
 *  - Rating achievements use only rated games (see rating.ts), need at least 10 of them, and require the result to
 *    hold for two games in a row or over a long window, so one lucky swing earns nothing.
 *  - Training days are local calendar days with at least one game (or, once those features exist, puzzle / lesson / review).
 *  - Puzzle, lesson and review achievements stay inactive until FEATURES says the feature exists.
 */
import { PLAYER_START_RATING } from './rating';
import { finishedGames, streakReached, streaks, tally, type FinishedGame } from './stats';
import { assessments, lessons, puzzles, reviews } from './training';
import type { AchievementDef, DerivedContext, Evaluation } from './achievementTypes';
import type { LessonEvent, PuzzleEvent } from './types';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/* ------------------------------ derived data ------------------------------ */

/** Activity records a feature may legitimately have produced. Records for a feature that does not exist are ignored. */
export function usableActivity(c: DerivedContext) {
  return c.activity.filter((e) => (e.kind === 'puzzle' ? c.features.puzzles : e.kind === 'lesson' ? c.features.lessons : c.features.review));
}

/** Puzzle attempts from the trainer. Positions from the player's own games are exercises, not puzzles, and are counted separately. */
const isOwnGame = (p: PuzzleEvent): boolean => p.puzzleId.startsWith('game:');
function puzzleAttempts(c: DerivedContext): PuzzleEvent[] {
  return puzzles(usableActivity(c)).filter((p) => !isOwnGame(p));
}

/** First solve of each distinct puzzle, oldest first. Re-solving the same puzzle never counts twice. */
function solvedPuzzles(c: DerivedContext): PuzzleEvent[] {
  const seen = new Set<string>();
  const out: PuzzleEvent[] = [];
  for (const p of [...puzzleAttempts(c)].sort((a, b) => a.at - b.at)) {
    if (!p.solved || seen.has(p.puzzleId)) continue;
    seen.add(p.puzzleId);
    out.push(p);
  }
  return out;
}

/** First completion of each distinct lesson, oldest first. */
function completedLessons(c: DerivedContext): LessonEvent[] {
  const seen = new Set<string>();
  const out: LessonEvent[] = [];
  for (const l of [...lessons(usableActivity(c))].sort((a, b) => a.at - b.at)) {
    if (!l.completed || seen.has(l.lessonId)) continue;
    seen.add(l.lessonId);
    out.push(l);
  }
  return out;
}

/** Course assessments passed on their own merits (placement passes write no events), first pass of each course. */
function passedCourses(c: DerivedContext): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of [...assessments(usableActivity(c))].sort((a, b) => a.at - b.at)) {
    if (e.assessment !== 'course' || !e.passed) continue;
    const id = e.lessonId.slice('assess:'.length);
    if (!out.has(id)) out.set(id, e.at);
  }
  return out;
}

const fin = (c: DerivedContext): FinishedGame[] => finishedGames(c.games);

/* ------------------------------- builders -------------------------------- */

/** "Do N of something": progress is the count, unlocked by the Nth event. */
const count = (events: Array<{ at: number }>, target: number, unit: string): Evaluation => ({
  current: Math.min(events.length, target),
  target,
  unit,
  at: events.length >= target ? events[target - 1]!.at : null,
});

const gamesPlayed = (n: number) => (c: DerivedContext) => count(fin(c).map((g) => ({ at: g.game.createdAt })), n, 'games');

function winStreak(n: number) {
  return (c: DerivedContext): Evaluation => {
    const g = fin(c);
    let run = 0;
    let at: number | null = null;
    for (const x of g) {
      run = x.outcome === 'win' ? run + 1 : 0;
      if (at === null && run >= n) at = x.game.createdAt;
    }
    const best = streaks(g).bestWin;
    return { current: Math.min(best, n), target: n, unit: 'wins in a row', at, detail: `Current streak: ${streaks(g).currentWin}` };
  };
}

function trainingStreak(n: number) {
  return (c: DerivedContext): Evaluation => {
    const times = [...c.games.filter((g) => g.source === 'played' && g.human).map((g) => g.createdAt), ...usableActivity(c).map((a) => a.at)];
    const r = streakReached(times, n);
    return { current: Math.min(r.best, n), target: n, unit: 'days in a row', at: r.at, detail: 'Counted in your local calendar days.' };
  };
}

function levelUp(milestone: number) {
  return (c: DerivedContext): Evaluation => {
    const h = c.rating.history;
    let at: number | null = null;
    // Reached on two consecutive rated games, and only once there are at least 10 of them.
    for (let i = 9; i < h.length; i++) {
      if (i >= 1 && Math.min(h[i]!.after, h[i - 1]!.after) >= milestone) {
        at = h[i]!.at;
        break;
      }
    }
    const cur = Math.round(c.rating.current);
    return {
      current: clamp(cur, PLAYER_START_RATING, milestone),
      target: milestone,
      from: PLAYER_START_RATING,
      unit: 'rating',
      at,
      detail: c.rating.ratedGames < 10 ? `${c.rating.ratedGames} of 10 rated games needed first.` : `Your rating: ${cur}.`,
    };
  };
}

/** One entry per local day on which the daily puzzle was solved. Replays of an already solved daily do not add days. */
function dailySolveDays(c: DerivedContext): PuzzleEvent[] {
  const seen = new Set<string>();
  const out: PuzzleEvent[] = [];
  for (const p of [...puzzleAttempts(c)].sort((a, b) => a.at - b.at)) {
    if (p.mode !== 'daily' || !p.solved) continue;
    const d = new Date(p.at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function themeSolved(match: (themes: string[]) => boolean, n: number) {
  return (c: DerivedContext) => count(solvedPuzzles(c).filter((p) => match(p.themes.map((t) => t.toLowerCase()))), n, 'puzzles');
}

function lessonsDone(n: number) {
  return (c: DerivedContext) => count(completedLessons(c), n, 'lessons');
}

/* ------------------------------- the list -------------------------------- */

export const CORE_ACHIEVEMENTS: AchievementDef[] = [
  /* Getting started */
  { id: 'first-game', category: 'start', title: 'First Steps', description: 'Your first finished game.', condition: 'Finish a game against a bot.', icon: 'pawn', rarity: 'common', evaluate: gamesPlayed(1) },
  { id: 'first-win', category: 'start', title: 'First Victory', description: 'The first of many.', condition: 'Win a game against a bot.', icon: 'star', rarity: 'common',
    evaluate: (c) => count(fin(c).filter((g) => g.outcome === 'win').map((g) => ({ at: g.game.createdAt })), 1, 'win') },
  { id: 'first-puzzle', category: 'start', title: 'First Puzzle', description: 'Spotting a tactic for the first time.', condition: 'Solve a puzzle.', icon: 'puzzle', rarity: 'common', requires: 'puzzles', evaluate: (c) => count(solvedPuzzles(c), 1, 'puzzle') },
  { id: 'first-lesson', category: 'start', title: 'First Lesson', description: 'Learning something new.', condition: 'Complete a lesson.', icon: 'book', rarity: 'common', requires: 'lessons', evaluate: lessonsDone(1) },
  { id: 'ten-games', category: 'start', title: 'Getting Serious', description: 'Ten games in the books.', condition: 'Finish 10 games.', icon: 'knight', rarity: 'common', evaluate: gamesPlayed(10) },
  { id: 'fifty-games', category: 'start', title: 'Regular Player', description: 'Chess is becoming a habit.', condition: 'Finish 50 games.', icon: 'bishop', rarity: 'uncommon', evaluate: gamesPlayed(50) },
  { id: 'hundred-games', category: 'start', title: 'Chess Enthusiast', description: 'A hundred games.', condition: 'Finish 100 games.', icon: 'rook', rarity: 'uncommon', evaluate: gamesPlayed(100) },
  { id: 'five-hundred-games', category: 'start', title: 'Dedicated Player', description: 'Five hundred games of experience.', condition: 'Finish 500 games.', icon: 'queen', rarity: 'rare', evaluate: gamesPlayed(500) },

  /* Winning */
  { id: 'first-mate', category: 'winning', title: 'Checkmate!', description: 'Finishing a game the proper way.', condition: 'Win a game by delivering checkmate.', icon: 'king', rarity: 'common',
    evaluate: (c) => count(fin(c).filter((g) => g.outcome === 'win' && g.game.reason === 'checkmate').map((g) => ({ at: g.game.createdAt })), 1, 'checkmate') },
  { id: 'three-wins', category: 'winning', title: 'On a Roll', description: 'Three wins without a slip.', condition: 'Win 3 games in a row.', icon: 'flame', rarity: 'common', evaluate: winStreak(3) },
  { id: 'five-wins', category: 'winning', title: 'Winning Habit', description: 'Five straight wins.', condition: 'Win 5 games in a row.', icon: 'flame', rarity: 'uncommon', evaluate: winStreak(5) },
  { id: 'ten-wins', category: 'winning', title: 'Unstoppable', description: 'Ten straight wins.', condition: 'Win 10 games in a row.', icon: 'bolt', rarity: 'rare', evaluate: winStreak(10) },
  { id: 'comeback', category: 'winning', title: 'Comeback', description: 'Bouncing back after a rough patch.', condition: 'Win a game right after losing 3 or more games in a row.', icon: 'arrowup', rarity: 'uncommon',
    evaluate: (c) => {
      let run = 0;
      let at: number | null = null;
      for (const g of fin(c)) {
        if (g.outcome === 'win' && run >= 3 && at === null) at = g.game.createdAt;
        run = g.outcome === 'loss' ? run + 1 : 0;
      }
      return { current: at === null ? 0 : 1, target: 1, unit: 'comeback', at, detail: `Current losing streak: ${streaks(fin(c)).currentLoss}` };
    } },
  { id: 'consistency', category: 'winning', title: 'Consistency', description: 'Winning more often than not, over a real sample.', condition: 'Score at least 60% (a win = 1, a draw = ½) after 25 or more games.', icon: 'target', rarity: 'uncommon',
    evaluate: (c) => {
      const g = fin(c);
      let at: number | null = null;
      for (let i = 25; i <= g.length; i++) {
        const t = tally(g.slice(0, i));
        if ((t.score ?? 0) >= 0.6) { at = g[i - 1]!.game.createdAt; break; }
      }
      if (g.length < 25) return { current: g.length, target: 25, unit: 'games', at };
      const score = Math.round((tally(g).score ?? 0) * 100);
      return { current: at ? 60 : Math.min(score, 59), target: 60, unit: '% score', at, detail: `Your score over ${g.length} games: ${score}%.` };
    } },

  /* Tactics (puzzles) */
  { id: 'fork-master', category: 'tactics', title: 'Fork Master', description: 'Attacking two things at once.', condition: 'Solve 10 fork puzzles.', icon: 'fork', rarity: 'uncommon', requires: 'puzzles', evaluate: themeSolved((t) => t.includes('fork'), 10) },
  { id: 'pin-master', category: 'tactics', title: 'Pinpoint Accuracy', description: 'Pinning pieces in place.', condition: 'Solve 10 pin puzzles.', icon: 'pin', rarity: 'uncommon', requires: 'puzzles', evaluate: themeSolved((t) => t.includes('pin'), 10) },
  { id: 'mate-hunter', category: 'tactics', title: 'Checkmate Hunter', description: 'Finding the final blow.', condition: 'Solve 25 checkmate puzzles.', icon: 'crown', rarity: 'uncommon', requires: 'puzzles', evaluate: themeSolved((t) => t.some((x) => x.includes('mate')), 25) },
  { id: 'tactical-thinker', category: 'tactics', title: 'Tactical Thinker', description: 'A hundred puzzles solved.', condition: 'Solve 100 different puzzles.', icon: 'puzzle', rarity: 'uncommon', requires: 'puzzles', evaluate: (c) => count(solvedPuzzles(c), 100, 'puzzles') },
  { id: 'daily-solver', category: 'tactics', title: 'Daily Solver', description: 'Starting the day with a tactic.', condition: 'Solve the daily puzzle.', icon: 'calendar', rarity: 'common', requires: 'puzzles', evaluate: (c) => count(dailySolveDays(c), 1, 'daily puzzle') },
  { id: 'daily-habit', category: 'consistency', title: 'Daily Habit', description: 'Coming back for the daily puzzle.', condition: 'Solve the daily puzzle on 7 different days.', icon: 'flame', rarity: 'uncommon', requires: 'puzzles', evaluate: (c) => count(dailySolveDays(c), 7, 'days') },
  { id: 'rush-runner', category: 'tactics', title: 'Rush Runner', description: 'Quick, and still right.', condition: 'Solve 25 puzzles in Puzzle Rush.', icon: 'bolt', rarity: 'uncommon', requires: 'puzzles',
    evaluate: (c) => count(puzzleAttempts(c).filter((p) => p.mode === 'rush' && p.solved), 25, 'rush puzzles') },
  { id: 'mistake-fixer', category: 'improvement', title: 'Learning from Losses', description: 'Turning your own mistakes into skill.', condition: 'Solve 3 exercises taken from your own reviewed games.', icon: 'arrowup', rarity: 'uncommon', requires: 'puzzles',
    evaluate: (c) => {
      const seen = new Set<string>();
      const hits = puzzles(usableActivity(c)).filter(isOwnGame).sort((a, b) => a.at - b.at).filter((p) => p.solved && !seen.has(p.puzzleId) && seen.add(p.puzzleId));
      return count(hits, 3, 'exercises');
    } },
  { id: 'puzzle-addict', category: 'tactics', title: 'Puzzle Addict', description: 'Five hundred puzzles.', condition: 'Solve 500 different puzzles.', icon: 'puzzle', rarity: 'rare', requires: 'puzzles', evaluate: (c) => count(solvedPuzzles(c), 500, 'puzzles') },
  { id: 'sharp-eyes', category: 'tactics', title: 'Sharp Eyes', description: 'Accurate, not just busy.', condition: 'Solve at least 80% of your puzzle attempts, across 50 or more attempts.', icon: 'target', rarity: 'uncommon', requires: 'puzzles',
    evaluate: (c) => {
      const a = puzzleAttempts(c).sort((x, y) => x.at - y.at);
      let at: number | null = null;
      let solved = 0;
      a.forEach((p, i) => {
        if (p.solved) solved++;
        if (at === null && i + 1 >= 50 && solved / (i + 1) >= 0.8) at = p.at;
      });
      if (a.length < 50) return { current: a.length, target: 50, unit: 'attempts', at };
      const rate = Math.round((solved / a.length) * 100);
      return { current: at ? 80 : Math.min(rate, 79), target: 80, unit: '% solved', at, detail: `Your solve rate: ${rate}%.` };
    } },

  /* Learning (lessons) */
  { id: 'knowledge-seeker', category: 'learning', title: 'Knowledge Seeker', description: 'Ten lessons completed.', condition: 'Complete 10 lessons.', icon: 'book', rarity: 'uncommon', requires: 'lessons', evaluate: lessonsDone(10) },
  { id: 'dedicated-learner', category: 'learning', title: 'Dedicated Learner', description: 'Twenty-five lessons completed.', condition: 'Complete 25 lessons.', icon: 'book', rarity: 'uncommon', requires: 'lessons', evaluate: lessonsDone(25) },
  { id: 'lifelong-learner', category: 'learning', title: 'Lifelong Learner', description: 'Fifty lessons completed.', condition: 'Complete 50 lessons.', icon: 'mortarboard', rarity: 'rare', requires: 'lessons', evaluate: lessonsDone(50) },
  { id: 'first-chapter', category: 'learning', title: 'First Chapter', description: 'A whole chapter, start to finish.', condition: 'Complete every lesson in one Academy chapter.', icon: 'book', rarity: 'common', requires: 'lessons',
    evaluate: (c) => {
      const done = new Map(completedLessons(c).map((l) => [l.lessonId, l.at]));
      let at: number | null = null;
      let best = { have: 0, need: 1 };
      for (const ids of Object.values(c.academy.chapters)) {
        if (!ids.length) continue;
        const have = ids.filter((id) => done.has(id)).length;
        if (have / ids.length > best.have / best.need) best = { have, need: ids.length };
        if (have === ids.length) {
          const when = Math.max(...ids.map((id) => done.get(id)!));
          at = at === null ? when : Math.min(at, when);
        }
      }
      return { current: best.have, target: best.need, unit: 'lessons in one chapter', at };
    } },
  { id: 'student-of-chess', category: 'learning', title: 'Student of Chess', description: 'The beginner course, finished properly.', condition: 'Complete every lesson in the beginner course and pass its assessment.', icon: 'mortarboard', rarity: 'uncommon', requires: 'lessons',
    evaluate: (c) => {
      const done = new Map(completedLessons(c).map((l) => [l.lessonId, l.at]));
      const ids = Object.entries(c.academy.chapters).filter(([k]) => k.startsWith(`${c.academy.beginnerCourse}-`)).flatMap(([, v]) => v);
      const passed = passedCourses(c).get(c.academy.beginnerCourse);
      const have = ids.filter((id) => done.has(id)).length;
      const total = ids.length + 1;
      const cur = have + (passed !== undefined ? 1 : 0);
      const at = cur === total && total > 1 ? Math.max(passed!, ...ids.map((id) => done.get(id)!)) : null;
      return { current: cur, target: total, unit: 'steps', at };
    } },
  { id: 'course-complete', category: 'learning', title: 'Course Complete', description: 'A course assessment passed.', condition: 'Pass the final assessment of any Academy course (a placement pass does not count).', icon: 'check', rarity: 'uncommon', requires: 'lessons',
    evaluate: (c) => {
      const p = [...passedCourses(c).values()].sort((a, b) => a - b);
      return { current: Math.min(p.length, 1), target: 1, unit: 'course', at: p[0] ?? null };
    } },
  { id: 'academy-graduate', category: 'learning', title: 'Academy Graduate', description: 'Every course in the Academy.', condition: 'Pass the final assessment of every Academy course.', icon: 'trophy', rarity: 'rare', requires: 'lessons',
    evaluate: (c) => {
      const p = passedCourses(c);
      const all = c.academy.courses;
      const have = all.filter((id) => p.has(id)).length;
      return { current: have, target: Math.max(all.length, 1), unit: 'courses', at: all.length && have === all.length ? Math.max(...all.map((id) => p.get(id)!)) : null };
    } },
  { id: 'chess-scholar', category: 'learning', title: 'Chess Scholar', description: 'Mastering a whole topic.', condition: 'Complete every lesson in one Academy course.', icon: 'mortarboard', rarity: 'rare', requires: 'lessons',
    evaluate: (c) => {
      const done = new Map(completedLessons(c).map((l) => [l.lessonId, l.at]));
      let at: number | null = null;
      let best = { have: 0, need: 1 };
      for (const ids of Object.values(c.curriculum)) {
        if (!ids.length) continue;
        const have = ids.filter((id) => done.has(id)).length;
        if (have / ids.length > best.have / best.need) best = { have, need: ids.length };
        if (have === ids.length) {
          const when = Math.max(...ids.map((id) => done.get(id)!));
          at = at === null ? when : Math.min(at, when);
        }
      }
      return { current: best.have, target: best.need, unit: 'lessons in one section', at };
    } },

  /* Improvement */
  { id: 'level-up', category: 'improvement', title: 'Level Up', description: 'A first rating milestone.', condition: 'Reach a MoveWise Rating of 1000 on two rated games in a row, after at least 10 rated games.', icon: 'arrowup', rarity: 'common', evaluate: levelUp(1000) },
  { id: 'level-up-2', category: 'improvement', title: 'Level Up II', description: 'Another step up.', condition: 'Reach a MoveWise Rating of 1250 on two rated games in a row, after at least 10 rated games.', icon: 'arrowup', rarity: 'uncommon', evaluate: levelUp(1250) },
  { id: 'level-up-3', category: 'improvement', title: 'Level Up III', description: 'Climbing steadily.', condition: 'Reach a MoveWise Rating of 1500 on two rated games in a row, after at least 10 rated games.', icon: 'arrowup', rarity: 'uncommon', evaluate: levelUp(1500) },
  { id: 'level-up-4', category: 'improvement', title: 'Level Up IV', description: 'A serious milestone.', condition: 'Reach a MoveWise Rating of 2000 on two rated games in a row, after at least 10 rated games.', icon: 'arrowup', rarity: 'rare', evaluate: levelUp(2000) },
  { id: 'personal-best', category: 'improvement', title: 'Personal Best', description: 'Your highest rating yet.', condition: 'After 10 rated games, finish a game with a rating at least 25 points above your previous best.', icon: 'trophy', rarity: 'uncommon',
    evaluate: (c) => {
      const h = c.rating.history;
      let at: number | null = null;
      let best = PLAYER_START_RATING;
      for (let i = 0; i < h.length; i++) {
        if (at === null && i >= 10 && h[i]!.after >= best + 25) at = h[i]!.at;
        best = Math.max(best, h[i]!.after);
      }
      return h.length < 10 ? { current: h.length, target: 10, unit: 'rated games', at } : { current: at ? 1 : 0, target: 1, unit: 'new best', at, detail: `Your best so far: ${Math.round(best)}.` };
    } },
  { id: 'improvement', category: 'improvement', title: 'Improvement', description: 'Real progress over many games.', condition: 'Gain at least 150 rating points over any 20 rated games.', icon: 'trend', rarity: 'uncommon',
    evaluate: (c) => {
      const h = c.rating.history;
      let at: number | null = null;
      let bestGain = 0;
      for (let i = 19; i < h.length; i++) {
        // Rating after game i minus the rating before the first game of this 20-game window.
        const gain = h[i]!.after - h[i - 19]!.before;
        bestGain = Math.max(bestGain, gain);
        if (at === null && gain >= 150) at = h[i]!.at;
      }
      return h.length < 20 ? { current: h.length, target: 20, unit: 'rated games', at } : { current: clamp(Math.round(bestGain), 0, 150), target: 150, unit: 'points', at };
    } },
  { id: 'tactical-growth', category: 'improvement', title: 'Tactical Growth', description: 'Getting measurably better at a kind of tactic.', condition: 'In one puzzle theme with 40 or more attempts, solve your latest 20 at a rate 20 points higher than your first 20.', icon: 'trend', rarity: 'uncommon', requires: 'puzzles',
    evaluate: (c) => {
      const byTheme = new Map<string, PuzzleEvent[]>();
      for (const p of [...puzzleAttempts(c)].sort((a, b) => a.at - b.at)) for (const t of new Set(p.themes.map((x) => x.toLowerCase()))) byTheme.set(t, [...(byTheme.get(t) ?? []), p]);
      const rate = (l: PuzzleEvent[]) => l.filter((p) => p.solved).length / l.length;
      let at: number | null = null;
      let bestGain = 0;
      let mostAttempts = 0;
      for (const list of byTheme.values()) {
        mostAttempts = Math.max(mostAttempts, list.length);
        if (list.length < 40) continue;
        const first = rate(list.slice(0, 20));
        for (let k = 40; k <= list.length; k++) {
          const gain = (rate(list.slice(k - 20, k)) - first) * 100;
          bestGain = Math.max(bestGain, gain);
          if (gain >= 20) at = at === null ? list[k - 1]!.at : Math.min(at, list[k - 1]!.at);
        }
      }
      return mostAttempts < 40 ? { current: mostAttempts, target: 40, unit: 'attempts in one theme', at } : { current: clamp(Math.round(bestGain), 0, 20), target: 20, unit: 'points', at };
    } },
  { id: 'endgame-expert', category: 'improvement', title: 'Endgame Expert', description: 'Converting and defending endgames accurately.', condition: 'Average at most 35 centipawn loss in the endgame across 10 reviewed games.', icon: 'flag', rarity: 'rare', requires: 'review',
    evaluate: (c) => {
      const r = reviews(usableActivity(c)).filter((x) => x.phaseAcpl.endgame !== null).sort((a, b) => a.at - b.at);
      let at: number | null = null;
      for (let i = 9; i < r.length && at === null; i++) {
        const avg = r.slice(i - 9, i + 1).reduce((s, x) => s + x.phaseAcpl.endgame!, 0) / 10;
        if (avg <= 35) at = r[i]!.at;
      }
      return { current: Math.min(r.length, 10), target: 10, unit: 'reviewed endgames', at };
    } },

  /* Consistency */
  { id: 'three-days', category: 'consistency', title: 'Three-Day Streak', description: 'Three days running.', condition: 'Train on 3 days in a row.', icon: 'calendar', rarity: 'common', evaluate: trainingStreak(3) },
  { id: 'seven-days', category: 'consistency', title: 'Week of Chess', description: 'A full week.', condition: 'Train on 7 days in a row.', icon: 'calendar', rarity: 'uncommon', evaluate: trainingStreak(7) },
  { id: 'fourteen-days', category: 'consistency', title: 'Two-Week Challenge', description: 'Two weeks without a gap.', condition: 'Train on 14 days in a row.', icon: 'calendar', rarity: 'rare', evaluate: trainingStreak(14) },
  { id: 'thirty-days', category: 'consistency', title: 'Monthly Dedication', description: 'A month of chess, every day.', condition: 'Train on 30 days in a row.', icon: 'calendar', rarity: 'rare', evaluate: trainingStreak(30) },
];
