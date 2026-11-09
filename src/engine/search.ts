import { Position } from '../chess/position';
import {
  FLAG_CAPTURE,
  KING,
  PAWN,
  QUEEN,
  moveFrom,
  moveTo,
  movePromo,
  pieceType,
  type Move,
} from '../chess/types';
import { PIECE_VALUE, STYLES, evaluate, type Style } from './eval';

export const MATE = 30000;
const INF = 32000;

export interface SearchLimits {
  maxDepth: number;
  maxNodes: number;
  maxTimeMs: number;
  /** Search captures to the end of the line (off for the weakest bot). */
  quiesce: boolean;
}

export interface RootMove {
  move: Move;
  score: number;
}

export interface SearchResult {
  best: Move;
  score: number;
  depth: number;
  nodes: number;
  pv: Move[];
  /** Scores for every legal root move at the last full depth (only if requested). */
  rootMoves: RootMove[];
  timedOut: boolean;
}

const TT_EXACT = 0;
const TT_LOWER = 1;
const TT_UPPER = 2;

interface TTEntry {
  depth: number;
  score: number;
  flag: number;
  move: Move;
}

class Abort extends Error {}

export class Searcher {
  private nodes = 0;
  private deadline = 0;
  private limits!: SearchLimits;
  private tt = new Map<number, TTEntry>();
  private killers: Move[][] = [];
  private history = new Int32Array(64 * 64);
  private pvTable: Move[][] = [];

  constructor(
    private readonly pos: Position,
    private readonly style: Style = STYLES.balanced!,
  ) {}

  search(limits: SearchLimits, wantRootMoves: boolean): SearchResult {
    this.limits = limits;
    this.nodes = 0;
    this.deadline = Date.now() + limits.maxTimeMs;
    this.killers = Array.from({ length: 128 }, () => [0, 0]);
    this.pvTable = Array.from({ length: 128 }, () => []);
    this.history.fill(0);

    const rootLegal = this.pos.legalMoves();
    if (rootLegal.length === 0) {
      return { best: 0, score: this.pos.inCheck() ? -MATE : 0, depth: 0, nodes: 0, pv: [], rootMoves: [], timedOut: false };
    }
    const basePly = this.pos.plyCount;
    let best = rootLegal[0]!;
    let bestScore = 0;
    let pv: Move[] = [best];
    let completedDepth = 0;
    let timedOut = false;

    for (let depth = 1; depth <= limits.maxDepth; depth++) {
      try {
        const score = this.negamax(depth, 0, -INF, INF, true);
        const line = this.pvTable[0]!.slice();
        if (line.length) {
          best = line[0]!;
          pv = line;
        }
        bestScore = score;
        completedDepth = depth;
        if (Math.abs(score) > MATE - 200) break; // forced mate found
        if (this.nodes >= limits.maxNodes) break;
      } catch (e) {
        if (e instanceof Abort) {
          this.pos.unwindTo(basePly);
          timedOut = true;
          break;
        }
        throw e;
      }
      if (Date.now() >= this.deadline) break;
    }

    let rootMoves: RootMove[] = [];
    if (wantRootMoves) {
      rootMoves = this.scoreRootMoves(rootLegal, Math.max(1, completedDepth), best, bestScore, basePly);
    }
    return { best, score: bestScore, depth: completedDepth, nodes: this.nodes, pv, rootMoves, timedOut };
  }

  /** Full-window score for every root move so a weaker bot can choose among plausible moves. */
  private scoreRootMoves(legal: Move[], depth: number, best: Move, bestScore: number, basePly: number): RootMove[] {
    const out: RootMove[] = [];
    // Give this phase its own small budget so weak bots still answer promptly.
    const savedDeadline = this.deadline;
    this.deadline = Math.max(savedDeadline, Date.now() + Math.min(600, this.limits.maxTimeMs));
    this.limits = { ...this.limits, maxNodes: Number.MAX_SAFE_INTEGER / 8 };
    for (const m of legal) {
      if (m === best) {
        out.push({ move: m, score: bestScore });
        continue;
      }
      try {
        this.pos.makeMove(m);
        const score = -this.negamax(Math.max(0, depth - 1), 1, -INF, INF, false);
        this.pos.unmakeMove();
        out.push({ move: m, score });
      } catch (e) {
        if (e instanceof Abort) {
          // Leave the position consistent, then give unsearched moves a pessimistic score.
          this.pos.unwindTo(basePly);
          out.push({ move: m, score: bestScore - 400 });
          continue;
        }
        throw e;
      }
    }
    return out;
  }

  private checkTime(): void {
    if ((this.nodes & 1023) === 0) {
      if (Date.now() >= this.deadline || this.nodes >= Math.max(this.limits.maxNodes * 4, 8000)) throw new Abort();
    }
  }

  private negamax(depth: number, ply: number, alpha: number, beta: number, isRoot: boolean): number {
    this.nodes++;
    this.checkTime();
    const pos = this.pos;
    this.pvTable[ply] = [];
    if (ply > 0) {
      if (pos.halfmove >= 100 || pos.repetitionCount() >= 1 || pos.isInsufficientMaterial()) return 0;
    }
    const inCheck = pos.inCheck();
    if (inCheck) depth++; // check extension
    if (depth <= 0) {
      if (!this.limits.quiesce) return evaluate(pos, this.style);
      return this.quiesce(ply, alpha, beta);
    }
    if (ply >= 100) return evaluate(pos, this.style);

    // Mate-distance pruning.
    alpha = Math.max(alpha, -MATE + ply);
    beta = Math.min(beta, MATE - ply - 1);
    if (alpha >= beta) return alpha;

    const key = pos.hash;
    const entry = this.tt.get(key);
    let ttMove = 0;
    if (entry) {
      ttMove = entry.move;
      if (!isRoot && entry.depth >= depth) {
        let s = entry.score;
        if (s > MATE - 200) s -= ply;
        else if (s < -MATE + 200) s += ply;
        if (entry.flag === TT_EXACT) return s;
        if (entry.flag === TT_LOWER && s >= beta) return s;
        if (entry.flag === TT_UPPER && s <= alpha) return s;
      }
    }

    // Null-move pruning (not in check, with some non-pawn material, not at root).
    if (!isRoot && !inCheck && depth >= 3 && beta < MATE - 200 && this.hasPieces()) {
      pos.makeNull();
      const score = -this.negamax(depth - 3, ply + 1, -beta, -beta + 1, false);
      pos.unmakeNull();
      if (score >= beta) return beta;
    }

    const moves = pos.pseudoMoves();
    this.orderMoves(moves, ttMove, ply);

    let bestScore = -INF;
    let bestMove = 0;
    let legalCount = 0;
    const origAlpha = alpha;
    const us = pos.turn;

    for (let i = 0; i < moves.length; i++) {
      const m = moves[i]!;
      pos.makeMove(m);
      if (pos.isAttacked(pos.kings[us], (us ^ 1) as 0 | 1)) {
        pos.unmakeMove();
        continue;
      }
      legalCount++;
      this.pvTable[ply + 1] = [];
      let score: number;
      const quiet = !(m >> 15 & FLAG_CAPTURE) && !movePromo(m);
      if (legalCount === 1) {
        score = -this.negamax(depth - 1, ply + 1, -beta, -alpha, false);
      } else {
        // Late-move reduction for quiet moves, then principal-variation re-search.
        let reduction = 0;
        if (depth >= 3 && legalCount > 4 && quiet && !inCheck) reduction = 1;
        score = -this.negamax(depth - 1 - reduction, ply + 1, -alpha - 1, -alpha, false);
        if (score > alpha && reduction) {
          score = -this.negamax(depth - 1, ply + 1, -alpha - 1, -alpha, false);
        }
        if (score > alpha && score < beta) {
          score = -this.negamax(depth - 1, ply + 1, -beta, -alpha, false);
        }
      }
      pos.unmakeMove();

      if (score > bestScore) {
        bestScore = score;
        bestMove = m;
        if (score > alpha) {
          alpha = score;
          const child = this.pvTable[ply + 1]!;
          this.pvTable[ply] = [m, ...child];
          if (alpha >= beta) {
            if (quiet) {
              const k = this.killers[ply]!;
              if (k[0] !== m) {
                k[1] = k[0]!;
                k[0] = m;
              }
              this.history[moveFrom(m) * 64 + moveTo(m)]! += depth * depth;
            }
            break;
          }
        }
      }
    }

    if (legalCount === 0) return inCheck ? -MATE + ply : 0;

    const flag = bestScore >= beta ? TT_LOWER : bestScore > origAlpha ? TT_EXACT : TT_UPPER;
    let stored = bestScore;
    if (stored > MATE - 200) stored += ply;
    else if (stored < -MATE + 200) stored -= ply;
    if (this.tt.size > 400_000) this.tt.clear();
    this.tt.set(key, { depth, score: stored, flag, move: bestMove });
    return bestScore;
  }

  private hasPieces(): boolean {
    const b = this.pos.board;
    const us = this.pos.turn;
    for (let sq = 0; sq < 64; sq++) {
      const p = b[sq]!;
      if (!p || p >> 3 !== us) continue;
      const t = p & 7;
      if (t !== PAWN && t !== KING) return true;
    }
    return false;
  }

  private quiesce(ply: number, alpha: number, beta: number): number {
    this.nodes++;
    this.checkTime();
    const pos = this.pos;
    const standPat = evaluate(pos, this.style);
    if (ply >= 100) return standPat;
    if (standPat >= beta) return standPat;
    if (standPat > alpha) alpha = standPat;
    // Delta pruning: even winning a queen cannot rescue this position.
    if (standPat + 1000 < alpha) return alpha;

    const moves = pos.pseudoMoves(true);
    this.orderMoves(moves, 0, ply);
    const us = pos.turn;
    for (const m of moves) {
      const victim = pos.board[moveTo(m)]!;
      // Skip captures that cannot raise alpha even with the victim's value plus a margin.
      if (victim && !movePromo(m) && standPat + PIECE_VALUE[pieceType(victim)]! + 200 < alpha) continue;
      pos.makeMove(m);
      if (pos.isAttacked(pos.kings[us], (us ^ 1) as 0 | 1)) {
        pos.unmakeMove();
        continue;
      }
      const score = -this.quiesce(ply + 1, -beta, -alpha);
      pos.unmakeMove();
      if (score >= beta) return score;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  private orderMoves(moves: Move[], ttMove: Move, ply: number): void {
    const b = this.pos.board;
    const killers = this.killers[ply] ?? [0, 0];
    const scores = new Map<Move, number>();
    for (const m of moves) {
      let s = 0;
      if (m === ttMove) s = 1_000_000;
      else {
        const victim = b[moveTo(m)]!;
        const attacker = b[moveFrom(m)]!;
        const promo = movePromo(m);
        if (victim) s = 100_000 + PIECE_VALUE[pieceType(victim)]! * 10 - PIECE_VALUE[pieceType(attacker)]! / 10;
        else if (m >> 15 & 2) s = 100_000 + 900; // en passant
        if (promo) s += 90_000 + (promo === QUEEN ? 800 : 0);
        if (!victim && !promo) {
          if (m === killers[0]) s = 90_000;
          else if (m === killers[1]) s = 80_000;
          else s = this.history[moveFrom(m) * 64 + moveTo(m)]!;
          if (pieceType(attacker) === KING && !(m >> 15 & 4)) s -= 50;
        }
      }
      scores.set(m, s);
    }
    moves.sort((a, c) => scores.get(c)! - scores.get(a)!);
  }
}
