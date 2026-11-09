/** Synthetic reviews for tests: real, legal games with hand-written engine evaluations, so every expectation is exact. */
import { START_FEN } from '../src/chess/types';
import { MATE_CP, REVIEW_PRESETS, REVIEW_VERSION, type GameReview, type PositionEval, type Side } from '../src/review/types';

export interface Ev {
  cp: number;
  best?: string;
  pv?: string[];
  mate?: number | null;
  depth?: number;
  final?: boolean;
}

export function makeReview(opts: { id?: string; startFen?: string; moves: string[]; evals: Ev[]; perspective?: Side | null; engines?: string[]; complete?: boolean }): GameReview {
  const engines = opts.engines ?? ['Stockfish 19 (lite)'];
  const positions: PositionEval[] = opts.evals.map((e) => ({
    cp: e.cp,
    mate: e.mate ?? null,
    best: e.best ?? '',
    pv: e.pv ?? (e.best ? [e.best] : []),
    depth: e.depth ?? 18,
    e: 0,
    ...(e.final ? { final: true as const } : {}),
  }));
  return {
    version: REVIEW_VERSION,
    gameId: opts.id ?? 'g-test',
    createdAt: 1000,
    updatedAt: 1000,
    startFen: opts.startFen ?? START_FEN,
    moves: [...opts.moves],
    engines,
    settings: REVIEW_PRESETS.quick,
    positions,
    complete: opts.complete ?? true,
    perspective: opts.perspective === undefined ? 'black' : opts.perspective,
  };
}

/** Scholar's mate: 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6?? 4.Qxf7#. Black's 3...Nf6 allows mate in one. */
export const SCHOLAR_MOVES = ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7'];
export const scholar = (perspective: Side | null = 'black', engines?: string[]): GameReview =>
  makeReview({
    id: 'scholar',
    moves: SCHOLAR_MOVES,
    perspective,
    engines,
    evals: [
      { cp: 20, best: 'e2e4' },
      { cp: 20, best: 'e7e5' },
      { cp: 30, best: 'g1f3' },
      { cp: 20, best: 'g7g6', pv: ['g7g6', 'h5f3'] },
      { cp: 40, best: 'f1c4' },
      { cp: 30, best: 'g7g6', pv: ['g7g6', 'h5f3'] },
      { cp: MATE_CP, mate: 1, best: 'h5f7', pv: ['h5f7'] },
      { cp: MATE_CP, final: true, depth: 0 },
    ],
  });

/** White plays 5.Nxe5?? losing the knight to ...Nxe5. */
export const HUNG_MOVES = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f3e5', 'c6e5'];
export const hungKnight = (perspective: Side | null = 'white'): GameReview =>
  makeReview({
    id: 'hung',
    moves: HUNG_MOVES,
    perspective,
    evals: [
      { cp: 20, best: 'e2e4' },
      { cp: 20, best: 'e7e5' },
      { cp: 25, best: 'g1f3' },
      { cp: 30, best: 'b8c6' },
      { cp: 30, best: 'f1b5' },
      { cp: -190, best: 'c6e5', pv: ['c6e5', 'd2d4'] },
      { cp: -200, best: 'd2d4', pv: ['d2d4'] },
    ],
  });

/** White can win the black queen (Qxd5) and plays Ke2 instead. */
export const MISSED_FEN = '4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1';
export const missedQueen = (): GameReview =>
  makeReview({
    id: 'missed',
    startFen: MISSED_FEN,
    moves: ['e1e2'],
    perspective: 'white',
    evals: [
      { cp: 900, best: 'd1d5', pv: ['d1d5'] },
      { cp: 0, best: 'd5d1', pv: ['d5d1', 'e2d1'] },
    ],
  });

/** A clear advantage (+4.5) shrinks to +0.2 after an ordinary-looking move (synthetic evaluations). */
export const thrownAdvantage = (): GameReview =>
  makeReview({
    id: 'thrown',
    moves: ['e2e4', 'e7e5'],
    perspective: 'white',
    evals: [
      { cp: 450, best: 'd2d4', pv: ['d2d4'] },
      { cp: 20, best: 'e7e5' },
      { cp: 25, best: 'g1f3' },
    ],
  });

/** Black king a8 has exactly one legal move (Ka7); played, so nothing to judge. */
export const FORCED_FEN = 'k7/2K5/8/8/8/8/8/1R6 b - - 0 1';
export const forcedMove = (): GameReview =>
  makeReview({
    id: 'forced',
    startFen: FORCED_FEN,
    moves: ['a8a7'],
    perspective: 'black',
    evals: [
      { cp: 900, best: 'a8a7' },
      { cp: 900, best: 'b1b7', pv: ['b1b7'] },
    ],
  });

/** A clean game (Ruy Lopez, Chigorin) of 20 half-moves in which the engine always agrees with the player. */
export const CLEAN_MOVES = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6', 'e1g1', 'f8e7', 'f1e1', 'b7b5', 'a4b3', 'd7d6', 'c2c3', 'e8g8', 'h2h3', 'c6b8', 'd2d4', 'b8d7'];
export function cleanGame(perspective: Side | null = 'white'): GameReview {
  const evals: Ev[] = [];
  for (let i = 0; i <= CLEAN_MOVES.length; i++) evals.push({ cp: 20, best: CLEAN_MOVES[i] ?? 'a2a3', pv: CLEAN_MOVES.slice(i, i + 3) });
  return makeReview({ id: 'clean', moves: CLEAN_MOVES, evals, perspective });
}
