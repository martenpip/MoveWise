import { Position } from '../chess/position';
import { FLAG_CAPTURE, moveFlags, moveToUci, type Move } from '../chess/types';
import { getLevel, getPersonality, type Level } from './levels';
import { MATE, Searcher, type RootMove, type SearchLimits } from './search';

export interface PositionSpec {
  startFen: string;
  /** UCI moves from startFen, so repetition history is correct. */
  moves: string[];
}

export interface BotRequest extends PositionSpec {
  level: string;
  personality: string;
  /** Used only to add variety in the opening. */
  seed?: number;
  /** Replaces the named level's settings. Used only by the calibration harness (scripts/calibration). */
  levelSpec?: Level;
}

export interface BotReply {
  uci: string;
  /** Evaluation in centipawns from White's perspective, or a mate distance. */
  scoreCp: number;
  mate: number | null;
  depth: number;
  nodes: number;
  pv: string[];
  /** Display name of the engine that produced this reply. Added by the client, not by the search itself. */
  engine?: string;
}

export function buildPosition(spec: PositionSpec): Position {
  const pos = new Position(spec.startFen);
  for (const u of spec.moves) {
    const m = pos.parseUci(u);
    if (m === undefined) throw new Error(`Bad move in history: ${u}`);
    pos.makeMove(m);
  }
  return pos;
}

/** Deterministic PRNG so a game with a given seed is reproducible in tests. */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toWhiteCp(scoreForMover: number, mover: number): { cp: number; mate: number | null } {
  const white = mover === 0 ? scoreForMover : -scoreForMover;
  if (Math.abs(scoreForMover) > MATE - 200) {
    const plies = MATE - Math.abs(scoreForMover);
    const moves = Math.ceil(plies / 2);
    return { cp: white > 0 ? MATE : -MATE, mate: white > 0 ? moves : -moves };
  }
  return { cp: white, mate: null };
}

/** Choose the bot's move for a request. Synchronous; run it inside a Web Worker. */
export function chooseBotMove(req: BotRequest): BotReply {
  const level = req.levelSpec ?? getLevel(req.level);
  const personality = getPersonality(req.personality);
  const pos = buildPosition(req);
  const mover = pos.turn;
  const rng = mulberry32(req.seed ?? Date.now());

  let temperature = level.temperature;
  // Strong levels would otherwise repeat the same opening forever.
  if (temperature < 20 && pos.plyCount < 10) temperature = 14;

  const searcher = new Searcher(pos, personality.style);
  const wantRoot = temperature > 0;
  const result = searcher.search(level.limits, wantRoot);
  if (!result.best) throw new Error('No legal moves');

  let chosen: Move = result.best;
  if (wantRoot && result.rootMoves.length > 1) {
    chosen = pickByTemperature(pos, result.rootMoves, temperature, personality.style.rootTactical, rng);
  }
  const w = toWhiteCp(result.score, mover);
  return {
    uci: moveToUci(chosen),
    scoreCp: w.cp,
    mate: w.mate,
    depth: result.depth,
    nodes: result.nodes,
    pv: result.pv.map(moveToUci),
  };
}

function pickByTemperature(
  pos: Position,
  roots: RootMove[],
  temperature: number,
  tacticalBias: number,
  rng: () => number,
): Move {
  const scored = roots.map((r) => {
    let s = r.score;
    if (tacticalBias) {
      const capture = (moveFlags(r.move) & FLAG_CAPTURE) !== 0;
      pos.makeMove(r.move);
      const gives = pos.inCheck();
      pos.unmakeMove();
      if (capture || gives) s += tacticalBias;
      else if (tacticalBias < 0) s -= tacticalBias; // defensive styles prefer quiet moves
    }
    return { move: r.move, score: s };
  });
  const top = Math.max(...scored.map((x) => x.score));
  // Never choose a move that throws away a forced mate we found, or walks into one.
  const candidates = scored.filter((x) => top - x.score < 900);
  const weights = candidates.map((x) => Math.exp((x.score - top) / temperature));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return candidates[i]!.move;
  }
  return candidates[0]!.move;
}

export interface EvalRequest extends PositionSpec {
  depth: number;
  maxTimeMs: number;
}

/** Evaluate the current position for the evaluation bar and coaching. */
export function evaluatePosition(req: EvalRequest): BotReply {
  const pos = buildPosition(req);
  const mover = pos.turn;
  const limits: SearchLimits = {
    maxDepth: req.depth,
    maxNodes: 2_000_000,
    maxTimeMs: req.maxTimeMs,
    quiesce: true,
  };
  const searcher = new Searcher(pos);
  const result = searcher.search(limits, false);
  const w = toWhiteCp(result.score, mover);
  return {
    uci: result.best ? moveToUci(result.best) : '',
    scoreCp: w.cp,
    mate: w.mate,
    depth: result.depth,
    nodes: result.nodes,
    pv: result.pv.map(moveToUci),
  };
}
