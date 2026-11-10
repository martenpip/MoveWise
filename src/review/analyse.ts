/**
 * Turns a stored GameReview (what the engine said about each position) into everything the review screen shows:
 * a class for every move, centipawn loss, accuracy, per-phase figures, tags that the engine's own lines support,
 * and the critical moments. Pure and deterministic: the same review always gives the same analysis.
 */
import { KING, PAWN } from '../chess/types';
import { Game } from '../chess/game';
import { Position } from '../chess/position';
import {
  buildLine, describeMove, nonPawnMaterial, settledMaterialChange, sideOf, type Line, type MoveDetail,
} from './facts';
import {
  centipawnLoss, classByLoss, gameAccuracy, moveAccuracy, winPct, winPctFor, BEST_WITHIN, INACCURACY_AT, MISTAKE_AT,
} from './score';
import type { GameReview, MoveClass, Phase, PositionEval, Side, Tag } from './types';
import { MATE_CP } from './types';

/** Opening ends after this many half-moves, or earlier when the endgame starts. */
export const OPENING_PLIES = 20;
/** The endgame starts once the pieces other than pawns and kings are worth this many points or fewer, both sides together. */
export const ENDGAME_MATERIAL = 24;
/** A phase needs at least this many decisions by a side before a figure for it is reported. */
export const MIN_PHASE_MOVES = 3;

/** A material change this large (2 points = two pawns) along the engine's line counts as winning or losing material. */
const MATERIAL_SWING = 200;

/**
 * A "brilliant" move is the engine's own choice that gives up real material (a piece or more, at least two pawns net along the
 * engine's line) and still leaves the mover at least level and not already winning clearly. Deliberately strict: it should be rare.
 */
export function isBrilliant(m: { forced: boolean; matchedEngine: boolean; pieceType: number; materialIfPlayed: number; winBefore: number; winAfter: number }): boolean {
  return !m.forced && m.matchedEngine && m.pieceType !== PAWN && m.pieceType !== KING && m.materialIfPlayed <= -200 && m.winAfter >= 50 && m.winBefore < 85;
}

export interface PlyAnalysis {
  /** 1-based half-move number. */
  ply: number;
  color: Side;
  uci: string;
  san: string;
  fenBefore: string;
  fenAfter: string;
  before: PositionEval;
  after: PositionEval;
  /** Only one legal move was available. */
  forced: boolean;
  /** The move played is exactly the engine's first choice. */
  matchedEngine: boolean;
  /** Mover's win chance (0..100) before and after. */
  winBefore: number;
  winAfter: number;
  /** Points of win chance the move gave up (0 or more). */
  winLoss: number;
  /** Centipawn loss (0 or more, scores clamped to ±1000). */
  cpLoss: number;
  accuracy: number;
  cls: MoveClass;
  /** A best move that gave up material for an advantage the engine confirms (see `isBrilliant`). Shown as "Brilliant", never stored. */
  brilliant: boolean;
  phase: Phase;
  tags: Tag[];
  /** Details of the move played, the engine's choice and the lines (null where not applicable). */
  played: MoveDetail;
  best: MoveDetail | null;
  bestLine: Line;
  afterLine: Line;
  /** The moved piece's destination was captured first in the engine's reply. */
  refutationCapturesMoved: boolean;
  /** Net material (centipawn units, 100 = a pawn) the mover gains/loses along the engine's line vs along the played line. */
  materialIfBest: number;
  materialIfPlayed: number;
  /** Forced mate distances from the mover's point of view (positive = mover mates), else null. */
  mateBefore: number | null;
  mateAfter: number | null;
}

export interface SideStats {
  color: Side;
  /** Moves made. */
  moves: number;
  /** Moves that were decisions (not forced); the figures below are about these. */
  judged: number;
  counts: Record<MoveClass, number>;
  /** Moves exactly equal to the engine's first choice. */
  engineMatches: number;
  acpl: number | null;
  accuracy: number | null;
  phases: Record<Phase, { moves: number; acpl: number | null }>;
  /** Best and worst moments of the side's own win chance during the game. */
  peakWin: number;
  lowWin: number;
}

export type CriticalKind = 'blunder' | 'mistake' | 'missed-mate' | 'missed-capture' | 'allowed-mate' | 'opponent-error';

export interface CriticalMoment {
  ply: number;
  color: Side;
  kind: CriticalKind;
  /** For opponent errors: whether the next move of the other side took advantage of it. */
  exploited?: boolean;
  /** Points of win chance lost by the move (for ranking). */
  winLoss: number;
}

export interface ReviewAnalysis {
  gameId: string;
  plies: PlyAnalysis[];
  /** White's win chance (0..100) after every half-move, including the start. */
  winSeries: number[];
  sides: Record<Side, SideStats>;
  critical: CriticalMoment[];
  /** Names of the engines that produced the evaluations. */
  engines: string[];
  /** Mean depth reached over the searched positions, or null if none was searched. */
  meanDepth: number | null;
  perspective: Side | null;
}

/** Mate distance (in moves) from the mover's point of view, or null. */
const moverMate = (e: PositionEval, mover: Side): number | null => (e.mate === null ? null : mover === 'white' ? e.mate : -e.mate);

export function phaseOf(ply: number, nonPawnPoints: number, endgameReached: boolean): Phase {
  if (endgameReached || nonPawnPoints <= ENDGAME_MATERIAL) return 'endgame';
  return ply <= OPENING_PLIES ? 'opening' : 'middlegame';
}

/** Throws if the review is not complete or does not match the structure of its own game. */
export function analyseReview(review: GameReview): ReviewAnalysis {
  if (!review.complete || review.positions.some((p) => p === null)) throw new Error('This review is not finished yet');
  if (review.positions.length !== review.moves.length + 1) throw new Error('This review does not match its game');
  const positions = review.positions as PositionEval[];
  const game = new Game(review.startFen);
  const plies: PlyAnalysis[] = [];
  let endgameReached = nonPawnMaterial(new Position(review.startFen).board) <= ENDGAME_MATERIAL;

  for (let i = 0; i < review.moves.length; i++) {
    const uci = review.moves[i]!;
    const fenBefore = game.fen;
    const legalCount = game.legalMoves().length;
    const mover = sideOf(game.turn);
    const phase = phaseOf(i + 1, nonPawnMaterial(game.position.board), endgameReached);
    if (phase === 'endgame') endgameReached = true;
    const played = describeMove(fenBefore, uci);
    if (!played) throw new Error(`The review contains an illegal move: ${uci}`);
    const entry = game.playUci(uci);
    const before = positions[i]!;
    const after = positions[i + 1]!;

    const forced = legalCount === 1;
    const matchedEngine = before.best === uci;
    const winBefore = winPctFor(before.cp, mover);
    const winAfter = winPctFor(after.cp, mover);
    // Search noise can make the position after a move look better than the best the engine found before it: that is not a gain.
    let winLoss = Math.max(0, winBefore - winAfter);
    let cpLoss = centipawnLoss(before.cp, after.cp, mover);
    if (matchedEngine || forced) {
      winLoss = 0;
      cpLoss = 0;
    }
    const accuracy = matchedEngine || forced ? 100 : moveAccuracy(winBefore, winAfter);
    const cls: MoveClass = forced ? 'forced' : matchedEngine ? 'best' : classByLoss(winLoss);

    const bestLine = buildLine(fenBefore, before.pv.length ? before.pv : before.best ? [before.best] : []);
    const afterLine = buildLine(entry.fen, after.pv);
    const best = before.best ? describeMove(fenBefore, before.best) : null;
    const moverColor = mover === 'white' ? 0 : 1;
    const materialIfBest = settledMaterialChange(fenBefore, bestLine.uci, moverColor).change;
    const materialIfPlayed = settledMaterialChange(fenBefore, [uci, ...afterLine.uci], moverColor).change;
    const refutationCapturesMoved = (() => {
      const first = afterLine.uci[0] ? describeMove(entry.fen, afterLine.uci[0]) : null;
      return !!first && first.captured !== 0 && first.to === played.to;
    })();
    const mateBefore = moverMate(before, mover);
    const mateAfter = moverMate(after, mover);

    const tags: Tag[] = [];
    if (cls === 'inaccuracy' || cls === 'mistake' || cls === 'blunder') {
      if (mateAfter !== null && mateAfter < 0 && !(mateBefore !== null && mateBefore < 0)) tags.push('allowed-mate');
      if (mateBefore !== null && mateBefore > 0 && !(mateAfter !== null && mateAfter > 0)) tags.push('missed-mate');
      if (materialIfPlayed <= -MATERIAL_SWING && materialIfPlayed <= materialIfBest - MATERIAL_SWING) {
        tags.push(refutationCapturesMoved && played.pieceType !== 1 ? 'hung-piece' : 'lost-material');
      } else if (materialIfBest >= MATERIAL_SWING && materialIfPlayed <= materialIfBest - MATERIAL_SWING && !tags.includes('missed-mate')) {
        tags.push('missed-capture');
      }
      if (cls !== 'inaccuracy' && winBefore >= 70 && winAfter <= 55) tags.push('threw-away-advantage');
    } else if (cls === 'best' && matchedEngine) {
      if (mateBefore !== null && mateBefore > 0) tags.push('found-mate');
      else if (materialIfBest >= MATERIAL_SWING && best && (best.captured !== 0 || best.check)) tags.push('found-tactic');
    }

    plies.push({
      ply: i + 1, color: mover, uci, san: entry.san, fenBefore, fenAfter: entry.fen, before, after, forced, matchedEngine,
      winBefore, winAfter, winLoss, cpLoss, accuracy, cls, brilliant: isBrilliant({ forced, matchedEngine, pieceType: played.pieceType, materialIfPlayed, winBefore, winAfter }), phase, tags, played, best, bestLine, afterLine,
      refutationCapturesMoved, materialIfBest, materialIfPlayed, mateBefore, mateAfter,
    });
  }

  const winSeries = positions.map((p) => winPct(p.cp));
  const sides = { white: sideStats('white', plies, winSeries), black: sideStats('black', plies, winSeries) };
  const searched = positions.filter((p) => !p.final && p.depth > 0);
  return {
    gameId: review.gameId,
    plies,
    winSeries,
    sides,
    critical: criticalMoments(plies, review.perspective),
    engines: review.engines,
    meanDepth: searched.length ? searched.reduce((a, p) => a + p.depth, 0) / searched.length : null,
    perspective: review.perspective,
  };
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function sideStats(color: Side, all: PlyAnalysis[], winSeries: number[]): SideStats {
  const mine = all.filter((p) => p.color === color);
  const judged = mine.filter((p) => !p.forced);
  const counts: Record<MoveClass, number> = { forced: 0, best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
  for (const p of mine) counts[p.cls]++;
  const phases = {} as SideStats['phases'];
  for (const ph of ['opening', 'middlegame', 'endgame'] as const) {
    const inPhase = judged.filter((p) => p.phase === ph);
    phases[ph] = { moves: inPhase.length, acpl: inPhase.length >= MIN_PHASE_MOVES ? mean(inPhase.map((p) => p.cpLoss)) : null };
  }
  const own = winSeries.map((w) => (color === 'white' ? w : 100 - w));
  return {
    color,
    moves: mine.length,
    judged: judged.length,
    counts,
    engineMatches: judged.filter((p) => p.matchedEngine).length,
    acpl: mean(judged.map((p) => p.cpLoss)),
    accuracy: gameAccuracy(winSeries, judged.map((p) => ({ ply: p.ply, accuracy: p.accuracy }))),
    phases,
    peakWin: Math.max(...own),
    lowWin: Math.min(...own),
  };
}

const MAX_CRITICAL = 6;

/**
 * The moments worth a second look. For the player's own side: mistakes, blunders and moves that missed or allowed a
 * mate or missed material. For the opponent: their errors, with whether the player's next move took advantage.
 * Without a personal perspective both sides' errors are listed.
 */
export function criticalMoments(plies: PlyAnalysis[], perspective: Side | null): CriticalMoment[] {
  const own: CriticalMoment[] = [];
  const other: CriticalMoment[] = [];
  for (const p of plies) {
    const serious = p.cls === 'mistake' || p.cls === 'blunder';
    const tagged = p.tags.includes('missed-mate') || p.tags.includes('allowed-mate') || p.tags.includes('missed-capture');
    if (!serious && !tagged) continue;
    const kind: CriticalKind = p.tags.includes('allowed-mate')
      ? 'allowed-mate'
      : p.tags.includes('missed-mate')
        ? 'missed-mate'
        : p.tags.includes('missed-capture') && !serious
          ? 'missed-capture'
          : p.cls === 'blunder'
            ? 'blunder'
            : 'mistake';
    if (perspective === null || p.color === perspective) own.push({ ply: p.ply, color: p.color, kind, winLoss: p.winLoss });
    else if (serious) {
      const reply = plies[p.ply]; // the player's next move (index = ply)
      const exploited = !!reply && reply.color === perspective && (reply.cls === 'best' || reply.cls === 'good' || reply.cls === 'forced');
      other.push({ ply: p.ply, color: p.color, kind: 'opponent-error', exploited, winLoss: p.winLoss });
    }
  }
  const top = (xs: CriticalMoment[], n: number) => [...xs].sort((a, b) => b.winLoss - a.winLoss).slice(0, n);
  return [...top(own, MAX_CRITICAL), ...top(other, 3)].sort((a, b) => a.ply - b.ply);
}

export { INACCURACY_AT, MISTAKE_AT, BEST_WITHIN, MATE_CP };
