/**
 * The end-of-game summary. Every strength, weakness and lesson is chosen by a stated rule from the analysis (see
 * the thresholds below) and quotes the numbers behind it, so the reader can see why it was said. When a game has
 * too little to support a statement, the summary says so instead of padding.
 */
import type { GameResult } from '../chess/types';
import type { ReviewEvent } from '../profile/types';
import { MIN_PHASE_MOVES, type PlyAnalysis, type ReviewAnalysis } from './analyse';
import { explainPly, TAG_SLIP, type ExplainLevel } from './explain';
import { pct, plural } from './format';
import { accuracyBand } from './score';
import { searchEngines, WEAKNESS_TAGS, type Phase, type Side, type Tag } from './types';

export interface Insight {
  id: string;
  text: string;
  /** Half-move to jump to, when the statement is about one move. */
  ply?: number;
}

export interface Lesson {
  ply: number | null;
  title: string;
  paragraphs: string[];
  tip: string | null;
}

export interface GameSummary {
  side: Side | null;
  headline: string;
  strengths: Insight[];
  weaknesses: Insight[];
  lesson: Lesson;
  focus: string;
  /** How this game compares with the player's earlier reviewed games, when there are enough of them. */
  comparison: string | null;
  /** Slips that also show up in earlier reviewed games. */
  recurring: Insight[];
  /** Honest limits of this particular review. */
  caveats: string[];
}

export const MIN_HISTORY_FOR_COMPARISON = 3;
const HISTORY_WINDOW = 10;
/** A phase counts as a strength/weakness only with this many decisions in it and this average centipawn loss. */
const PHASE_MOVES_FOR_VERDICT = 5;
const STRONG_PHASE_ACPL = 25;
const WEAK_PHASE_ACPL = 60;
const MIN_JUDGED_FOR_VERDICTS = 8;

const PHASE_NAME: Record<Phase, string> = { opening: 'opening', middlegame: 'middlegame', endgame: 'endgame' };
const moveLabel = (p: PlyAnalysis): string => `move ${Math.ceil(p.ply / 2)}${p.color === 'white' ? '' : '…'} (${p.san})`;

function scoreFor(result: GameResult, side: Side): 'win' | 'loss' | 'draw' | null {
  if (result === '1/2-1/2') return 'draw';
  if (result === '*') return null;
  return (result === '1-0') === (side === 'white') ? 'win' : 'loss';
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

export function summarise(
  analysis: ReviewAnalysis,
  result: GameResult,
  history: readonly ReviewEvent[],
  level: ExplainLevel,
): GameSummary {
  const side = analysis.perspective;
  const caveats = limitsOf(analysis);
  if (side === null) return neutralSummary(analysis, level, caveats);

  const stats = analysis.sides[side];
  const mine = analysis.plies.filter((p) => p.color === side);
  const judged = mine.filter((p) => !p.forced);
  const outcome = scoreFor(result, side);
  const enough = judged.length >= MIN_JUDGED_FOR_VERDICTS;

  /* ---- headline ---- */
  const resultText = outcome === 'win' ? 'You won' : outcome === 'loss' ? 'You lost' : outcome === 'draw' ? 'The game was drawn' : 'The game was not finished';
  const headline =
    stats.accuracy === null || stats.acpl === null
      ? `${resultText}. There were no decisions to judge in this game.`
      : `${resultText}. Your accuracy was ${pct(stats.accuracy)} (${accuracyBand(stats.accuracy)}), with an average loss of ${Math.round(stats.acpl)} centipawns over ${plural(judged.length, 'decision')}.`;

  /* ---- strengths ---- */
  const strengths: Insight[] = [];
  if (enough && stats.counts.blunder === 0) strengths.push({ id: 'no-blunders', text: `No blunders in ${judged.length} decisions.` });
  if (enough && stats.engineMatches / judged.length >= 0.5) {
    strengths.push({ id: 'engine-matches', text: `${stats.engineMatches} of ${judged.length} moves (${pct((100 * stats.engineMatches) / judged.length)}) were exactly the engine’s first choice.` });
  }
  for (const ph of ['opening', 'middlegame', 'endgame'] as const) {
    const s = stats.phases[ph];
    if (s.acpl !== null && s.moves >= PHASE_MOVES_FOR_VERDICT && s.acpl <= STRONG_PHASE_ACPL) {
      strengths.push({ id: `strong-${ph}`, text: `Strong ${PHASE_NAME[ph]}: an average loss of only ${Math.round(s.acpl)} centipawns over ${plural(s.moves, 'move')}.` });
    }
  }
  const found = mine.filter((p) => p.tags.includes('found-mate') || p.tags.includes('found-tactic'));
  if (found.length) {
    const p = found[0]!;
    strengths.push({
      id: 'found-tactics',
      ply: p.ply,
      text: found.length === 1
        ? `You found a winning idea at ${moveLabel(p)} that the engine also chose.`
        : `You found ${found.length} winning ideas the engine also chose, starting at ${moveLabel(p)}.`,
    });
  }
  if (outcome === 'win' && stats.peakWin >= 75) strengths.push({ id: 'converted', text: `You reached a winning position (about ${pct(stats.peakWin)} win chance) and went on to win.` });
  if (outcome !== 'loss' && outcome !== null && stats.lowWin <= 25) {
    strengths.push({ id: 'resilient', text: `You were in a difficult position (down to about ${pct(stats.lowWin)} win chance) and still ${outcome === 'win' ? 'won' : 'drew'}.` });
  }
  if (strengths.length === 0 && judged.length >= 3) {
    const best = bestStretch(judged);
    if (best) strengths.push({ id: 'best-stretch', ply: best.from, text: `${best.label} was your most accurate stretch (accuracy ${pct(best.accuracy)}).` });
  }

  /* ---- weaknesses ---- */
  const weaknesses: Insight[] = [];
  const serious = mine.filter((p) => p.cls === 'mistake' || p.cls === 'blunder');
  if (serious.length) {
    const worst = [...serious].sort((a, b) => b.winLoss - a.winLoss)[0]!;
    weaknesses.push({
      id: 'costly-errors',
      ply: worst.ply,
      text: `${plural(stats.counts.blunder, 'blunder')} and ${plural(stats.counts.mistake, 'mistake')}. The costliest was ${moveLabel(worst)}, which gave up ${worst.winLoss.toFixed(0)} points of win chance.`,
    });
  }
  for (const tag of WEAKNESS_TAGS) {
    const hits = mine.filter((p) => p.tags.includes(tag));
    if (!hits.length) continue;
    weaknesses.push({ id: `tag-${tag}`, ply: hits[0]!.ply, text: `${plural(hits.length, 'move')} involved ${TAG_SLIP[tag]} (first at ${moveLabel(hits[0]!)}).` });
  }
  const phased = (['opening', 'middlegame', 'endgame'] as const)
    .map((ph) => ({ ph, ...stats.phases[ph] }))
    .filter((x): x is { ph: Phase; moves: number; acpl: number } => x.acpl !== null && x.moves >= PHASE_MOVES_FOR_VERDICT);
  const weakestPhase = [...phased].sort((a, b) => b.acpl - a.acpl)[0];
  if (weakestPhase && weakestPhase.acpl >= WEAK_PHASE_ACPL) {
    weaknesses.push({ id: `weak-${weakestPhase.ph}`, text: `Your ${PHASE_NAME[weakestPhase.ph]} was the weakest part: an average loss of ${Math.round(weakestPhase.acpl)} centipawns over ${plural(weakestPhase.moves, 'move')}.` });
  }
  if (weaknesses.length === 0) {
    const inaccurate = mine.filter((p) => p.cls === 'inaccuracy');
    if (inaccurate.length) {
      weaknesses.push({ id: 'inaccuracies', ply: inaccurate[0]!.ply, text: `${plural(inaccurate.length, 'small inaccuracy', 'small inaccuracies')} and nothing worse (first at ${moveLabel(inaccurate[0]!)}).` });
    } else if (judged.length) {
      weaknesses.push({ id: 'none', text: 'No clear weakness in this game: no move gave up 5 points of win chance or more.' });
    }
  }

  /* ---- the lesson ---- */
  const lesson = pickLesson(analysis, side, level);

  /* ---- comparison with earlier reviews ---- */
  const prior = [...history].sort((a, b) => b.at - a.at).slice(0, HISTORY_WINDOW);
  let comparison: string | null = null;
  if (prior.length >= MIN_HISTORY_FOR_COMPARISON && stats.accuracy !== null) {
    const avg = mean(prior.map((r) => r.accuracy));
    const delta = stats.accuracy - avg;
    comparison =
      Math.abs(delta) < 1
        ? `Your accuracy matches your average of ${pct(avg)} over your last ${prior.length} reviewed games.`
        : `Your accuracy was ${Math.abs(delta).toFixed(0)} points ${delta > 0 ? 'above' : 'below'} your average of ${pct(avg)} over your last ${prior.length} reviewed games.`;
  }
  const recurring: Insight[] = [];
  if (prior.length >= 2) {
    for (const tag of WEAKNESS_TAGS) {
      if (!mine.some((p) => p.tags.includes(tag))) continue;
      const before = prior.filter((r) => r.weaknesses.includes(tag)).length;
      if (before >= 2) recurring.push({ id: `recurring-${tag}`, text: `A pattern: ${TAG_SLIP[tag]} also showed up in ${before} of your last ${prior.length} reviewed games.` });
    }
  }

  /* ---- what to work on next ---- */
  const focus = focusFor(mine, weakestPhase, recurring, judged.length);

  return { side, headline, strengths, weaknesses, lesson, focus, comparison, recurring, caveats };
}

function limitsOf(a: ReviewAnalysis): string[] {
  const out: string[] = [];
  if (searchEngines(a.engines).some((e) => !/stockfish/i.test(e))) {
    out.push('Part or all of this review was done by the built-in engine, which is much weaker than Stockfish. Treat the classifications as rough.');
  }
  if (a.meanDepth !== null && a.meanDepth < 12) out.push(`The search was shallow (average depth ${a.meanDepth.toFixed(0)}). A Thorough review would be more reliable.`);
  return out;
}

function bestStretch(judged: PlyAnalysis[]): { from: number; accuracy: number; label: string } | null {
  const size = Math.min(5, judged.length);
  if (size < 3) return null;
  let best: { i: number; acc: number } | null = null;
  for (let i = 0; i + size <= judged.length; i++) {
    const acc = mean(judged.slice(i, i + size).map((p) => p.accuracy));
    if (!best || acc > best.acc) best = { i, acc };
  }
  if (!best) return null;
  const a = judged[best.i]!;
  const z = judged[best.i + size - 1]!;
  return { from: a.ply, accuracy: best.acc, label: `Moves ${Math.ceil(a.ply / 2)}–${Math.ceil(z.ply / 2)}` };
}

/** The one thing to learn from this game: the player's costliest decision, explained; or an honest note if there was none. */
function pickLesson(analysis: ReviewAnalysis, side: Side, level: ExplainLevel): Lesson {
  const mine = analysis.plies.filter((p) => p.color === side && !p.forced);
  const ranked = [...mine].sort((a, b) => b.winLoss - a.winLoss);
  const top = ranked[0];
  if (top && top.winLoss > 1) {
    const ex = explainPly(top, level, analysis, side);
    return { ply: top.ply, title: `The lesson of this game: ${moveLabel(top)}`, paragraphs: ex.paragraphs, tip: ex.tip };
  }
  return {
    ply: null,
    title: 'The lesson of this game',
    paragraphs: [
      mine.length
        ? 'Every decision stayed within 1 point of win chance of the engine’s best. There was no costly moment to learn from, so the best next step is a stronger opponent or a longer game.'
        : 'There were no decisions to judge in this game.',
    ],
    tip: null,
  };
}

function focusFor(mine: PlyAnalysis[], weakest: { ph: Phase; acpl: number } | undefined, recurring: Insight[], judged: number): string {
  if (judged === 0) return 'Play a longer game and review it to get a focus for next time.';
  const counts = new Map<Tag, number>();
  for (const p of mine) for (const t of p.tags) if ((WEAKNESS_TAGS as readonly Tag[]).includes(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
  const recurringTag = WEAKNESS_TAGS.find((t) => recurring.some((r) => r.id === `recurring-${t}`));
  const topTag = recurringTag ?? [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const tips: Partial<Record<Tag, string>> = {
    'hung-piece': 'Before each move, check whether the piece you are moving can be captured, and whether it is protected.',
    'lost-material': 'Before each move, count the captures available to your opponent and your recaptures.',
    'missed-capture': 'Before settling on a quiet move, check every capture and check for both sides.',
    'missed-mate': 'Look at every check and capture first when your opponent’s king is exposed.',
    'allowed-mate': 'Before each move, look at every check your opponent could give afterwards.',
    'threw-away-advantage': 'When you are ahead, choose safe moves and check what your opponent threatens before you attack.',
  };
  if (topTag && tips[topTag]) return `For your next games: ${tips[topTag]}`;
  if (weakest && weakest.acpl >= WEAK_PHASE_ACPL) return `For your next games: pay extra attention in the ${PHASE_NAME[weakest.ph]}, where this game lost the most.`;
  return 'For your next games: keep checking for your opponent’s threats before each move, then review again to see whether the pattern holds.';
}

function neutralSummary(analysis: ReviewAnalysis, level: ExplainLevel, caveats: string[]): GameSummary {
  const w = analysis.sides.white;
  const b = analysis.sides.black;
  const fmt = (s: typeof w) => (s.accuracy === null ? 'no decisions' : `${pct(s.accuracy)} accuracy, ${plural(s.counts.blunder, 'blunder')}, ${plural(s.counts.mistake, 'mistake')}`);
  const costliest = [...analysis.plies].filter((p) => !p.forced).sort((a, b2) => b2.winLoss - a.winLoss)[0];
  const lesson: Lesson =
    costliest && costliest.winLoss > 1
      ? (() => {
          const ex = explainPly(costliest, level, analysis, null);
          return { ply: costliest.ply, title: `The costliest move: ${moveLabel(costliest)}`, paragraphs: ex.paragraphs, tip: ex.tip };
        })()
      : { ply: null, title: 'The costliest move', paragraphs: ['Both sides stayed within 1 point of win chance of the engine’s best on every move.'], tip: null };
  return {
    side: null,
    headline: `White: ${fmt(w)}. Black: ${fmt(b)}.`,
    strengths: [],
    weaknesses: [],
    lesson,
    focus: 'Choose which side you played above to get a personal summary, strengths and weaknesses.',
    comparison: null,
    recurring: [],
    caveats,
  };
}

export { MIN_PHASE_MOVES };
