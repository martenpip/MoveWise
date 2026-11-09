/**
 * Does a puzzle really contain the tactical idea it is tagged with?
 *
 * Lichess assigns theme tags with its own heuristics, and a tag is not a guarantee. For the themes below MoveWise replays the
 * solution on its own rules engine and looks for the geometry of the idea (two targets for a fork, a pinned piece, a piece in
 * front of a more valuable one, a piece uncovering a line, ...). The result is `confirmed` when the pattern is there,
 * `not-found` when it is not, and `unchecked` for themes without a detector (deflection, attraction, interference, clearance,
 * the in-between move and so on). Nothing here proves a puzzle is a *good* example, only that the named pattern appears.
 */
import { Position } from '../chess/position';
import { BISHOP, KING, QUEEN, ROOK, pieceColor, pieceType, type Color } from '../chess/types';

export type MotifResult = 'confirmed' | 'not-found' | 'unchecked';

const VAL = [0, 1, 3, 3, 5, 9, 100];
const DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const dirsOf = (type: number): number[] => (type === ROOK ? [0, 1, 2, 3] : type === BISHOP ? [4, 5, 6, 7] : type === QUEEN ? [0, 1, 2, 3, 4, 5, 6, 7] : []);

interface Step {
  /** The position before the player's move. */
  before: Position;
  /** The position after it. */
  after: Position;
  from: number;
  to: number;
  mover: number;
  captured: number;
  /** The opponent's reply, if the line has one. */
  reply?: { from: number; to: number };
  us: Color;
}

const sqOf = (uci: string) => 'abcdefgh'.indexOf(uci[0]!) + (Number(uci[1]) - 1) * 8;

/** The first two occupied squares met from `from` in direction `d`. */
function firstTwo(pos: Position, from: number, d: number): [number, number] {
  const [df, dr] = DIRS[d]!;
  let f = (from & 7) + df, r = (from >> 3) + dr;
  const found: number[] = [];
  while (f >= 0 && f < 8 && r >= 0 && r < 8 && found.length < 2) {
    const s = r * 8 + f;
    if (pos.board[s]) found.push(s);
    f += df; r += dr;
  }
  return [found[0] ?? -1, found[1] ?? -1];
}

function steps(p: { fen: string; moves: string[] }): Step[] | null {
  try {
    const pos = new Position(p.fen);
    const setup = pos.parseUci(p.moves[0]!);
    if (setup === undefined) return null;
    pos.makeMove(setup);
    const us = pos.turn;
    const out: Step[] = [];
    for (let i = 1; i < p.moves.length; i += 2) {
      const u = p.moves[i]!;
      const m = pos.parseUci(u);
      if (m === undefined) return null;
      const before = pos.clone();
      const from = sqOf(u), to = sqOf(u.slice(2));
      const mover = pos.board[from]!, captured = pos.board[to]!;
      pos.makeMove(m);
      const step: Step = { before, after: pos.clone(), from, to, mover, captured, us };
      const r = p.moves[i + 1];
      if (r) {
        const rm = pos.parseUci(r);
        if (rm === undefined) return null;
        step.reply = { from: sqOf(r), to: sqOf(r.slice(2)) };
        pos.makeMove(rm);
      }
      out.push(step);
    }
    return out;
  } catch {
    return null;
  }
}

const enemyAt = (pos: Position, s: number, us: Color) => s >= 0 && pos.board[s]! !== 0 && pieceColor(pos.board[s]!) !== us;
const val = (pos: Position, s: number) => VAL[pieceType(pos.board[s]!)]!;

/** Enemy squares attacked by the slider on `s`. */
function sliderAttacks(pos: Position, s: number, us: Color): Set<number> {
  const out = new Set<number>();
  for (const d of dirsOf(pieceType(pos.board[s]!))) {
    const [a] = firstTwo(pos, s, d);
    if (enemyAt(pos, a, us)) out.add(a);
  }
  return out;
}

const fork = (st: Step[]) => st.some((x) => {
  const them = (x.us ^ 1) as Color;
  const moverVal = VAL[pieceType(x.mover)]!;
  let n = 0;
  for (let s = 0; s < 64; s++) {
    if (!enemyAt(x.after, s, x.us)) continue;
    if (!x.after.attackersOf(s, x.us).includes(x.to)) continue;
    const t = pieceType(x.after.board[s]!);
    if (t === KING) { n++; continue; }
    const v = VAL[t]!;
    if (v >= 3 && (v > moverVal || x.after.attackersOf(s, them).length === 0)) n++;
  }
  return n >= 2;
});

interface Line { slider: number; a: number; b: number }
/** Every (slider, front enemy piece, enemy piece behind it) line for `us`. */
function lines(pos: Position, us: Color): Line[] {
  const out: Line[] = [];
  for (let s = 0; s < 64; s++) {
    const pc = pos.board[s]!;
    if (!pc || pieceColor(pc) !== us) continue;
    for (const d of dirsOf(pieceType(pc))) {
      const [a, b] = firstTwo(pos, s, d);
      if (enemyAt(pos, a, us) && enemyAt(pos, b, us)) out.push({ slider: s, a, b });
    }
  }
  return out;
}
const isPin = (pos: Position, l: Line) => pieceType(pos.board[l.a]!) !== KING && (pieceType(pos.board[l.b]!) === KING || val(pos, l.b) > val(pos, l.a));
const isSkewer = (pos: Position, l: Line) => val(pos, l.a) > val(pos, l.b) && val(pos, l.b) >= 3;

/**
 * A pin or skewer counts when the player's move creates it (the moved piece is the slider), or when the player's move takes
 * the pinned or skewered piece, or attacks it with another piece. A pin that is merely lying around does not count.
 */
function pinsAndSkewers(st: Step[], kind: 'pin' | 'skewer'): boolean {
  const test = kind === 'pin' ? isPin : isSkewer;
  return st.some((x) => {
    const after = lines(x.after, x.us).filter((l) => test(x.after, l));
    if (after.some((l) => l.slider === x.to)) return true;
    const before = lines(x.before, x.us).filter((l) => test(x.before, l));
    if (before.some((l) => l.a === x.to)) return true;
    // an existing pin that the move now exploits by attacking the pinned piece
    return before.some((l) => x.after.board[l.a] === x.before.board[l.a] && x.after.attackersOf(l.a, x.us).includes(x.to) && !x.before.attackersOf(l.a, x.us).includes(x.from));
  });
}

const discovered = (st: Step[]) => st.some((x) => {
  for (let s = 0; s < 64; s++) {
    const pc = x.before.board[s]!;
    if (!pc || pieceColor(pc) !== x.us || s === x.from || x.after.board[s] !== pc || !dirsOf(pieceType(pc)).length) continue;
    const was = sliderAttacks(x.before, s, x.us);
    for (const t of sliderAttacks(x.after, s, x.us)) {
      if (was.has(t)) continue;
      if (pieceType(x.after.board[t]!) === KING || val(x.after, t) >= 3) return true;
    }
  }
  return false;
});

const doubleCheck = (st: Step[]) => st.some((x) => {
  if (!x.after.inCheck()) return false;
  for (let s = 0; s < 64; s++) {
    const pc = x.after.board[s]!;
    if (pc && pieceType(pc) === KING && pieceColor(pc) !== x.us) return x.after.attackersOf(s, x.us).length >= 2;
  }
  return false;
});

const backRank = (st: Step[]) => {
  const last = st[st.length - 1]!;
  const end = last.reply ? null : last.after;
  if (!end || !end.inCheck() || end.hasLegalMove()) return false;
  for (let s = 0; s < 64; s++) {
    const pc = end.board[s]!;
    if (pc && pieceType(pc) === KING && pieceColor(pc) !== last.us) {
      if ((s >> 3) !== (last.us === 0 ? 7 : 0)) return false;
      return end.attackersOf(s, last.us).some((a) => (a >> 3) === (s >> 3) && [ROOK, QUEEN].includes(pieceType(end.board[a]!)));
    }
  }
  return false;
};

const sacrifice = (st: Step[]) => st.some((x) => {
  if (!x.reply || x.reply.to !== x.to) return false;
  const v = VAL[pieceType(x.mover)]!;
  return v >= 3 && v > (x.captured ? VAL[pieceType(x.captured)]! : 0);
});

const removesDefender = (st: Step[]) => st.some((x, k) => {
  if (!x.captured) return false;
  const them = (x.us ^ 1) as Color;
  return st.slice(k + 1).some((y) => y.captured !== 0 && x.before.attackersOf(y.to, them).includes(x.to));
});

const DETECT: Record<string, (st: Step[]) => boolean> = {
  fork, doubleCheck, backRankMate: backRank, sacrifice, capturingDefender: removesDefender, discoveredAttack: discovered,
  pin: (st) => pinsAndSkewers(st, 'pin'),
  skewer: (st) => pinsAndSkewers(st, 'skewer'),
};

/** Themes with an automatic check. */
export const CHECKED_THEMES: ReadonlySet<string> = new Set(Object.keys(DETECT));

export function checkMotif(p: { fen: string; moves: string[] }, theme: string): MotifResult {
  const d = DETECT[theme];
  if (!d) return 'unchecked';
  const st = steps(p);
  if (!st || !st.length) return 'not-found';
  return d(st) ? 'confirmed' : 'not-found';
}

