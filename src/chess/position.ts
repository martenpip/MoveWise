import {
  BISHOP,
  BLACK,
  CASTLE_BK,
  CASTLE_BQ,
  CASTLE_WK,
  CASTLE_WQ,
  FLAG_CAPTURE,
  FLAG_CASTLE,
  FLAG_DOUBLE,
  FLAG_EP,
  KING,
  KNIGHT,
  PAWN,
  QUEEN,
  ROOK,
  START_FEN,
  WHITE,
  charToPiece,
  fileOf,
  makeMove,
  makePiece,
  moveFlags,
  moveFrom,
  movePromo,
  moveTo,
  parseSquare,
  pieceColor,
  pieceToChar,
  pieceType,
  rankOf,
  squareName,
  type Color,
  type Move,
} from './types';

/* ------------------------------------------------------------------ */
/* Precomputed tables                                                  */
/* ------------------------------------------------------------------ */

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
  [1, 1],
  [1, -1],
  [-1, -1],
  [-1, 1],
];

const KNIGHT_DELTAS: ReadonlyArray<readonly [number, number]> = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];

const inBoard = (f: number, r: number): boolean => f >= 0 && f < 8 && r >= 0 && r < 8;

function buildTargets(deltas: ReadonlyArray<readonly [number, number]>): number[][] {
  const out: number[][] = [];
  for (let sq = 0; sq < 64; sq++) {
    const list: number[] = [];
    for (const [df, dr] of deltas) {
      const f = fileOf(sq) + df;
      const r = rankOf(sq) + dr;
      if (inBoard(f, r)) list.push(r * 8 + f);
    }
    out.push(list);
  }
  return out;
}

const KNIGHT_TARGETS = buildTargets(KNIGHT_DELTAS);
const KING_TARGETS = buildTargets(DIRS);
const PAWN_ATTACKS: number[][][] = [
  buildTargets([
    [-1, 1],
    [1, 1],
  ]),
  buildTargets([
    [-1, -1],
    [1, -1],
  ]),
];

const RAYS: number[][][] = [];
for (let sq = 0; sq < 64; sq++) {
  const perDir: number[][] = [];
  for (const [df, dr] of DIRS) {
    const ray: number[] = [];
    let f = fileOf(sq) + df;
    let r = rankOf(sq) + dr;
    while (inBoard(f, r)) {
      ray.push(r * 8 + f);
      f += df;
      r += dr;
    }
    perDir.push(ray);
  }
  RAYS.push(perDir);
}

const CASTLE_MASK = new Uint8Array(64).fill(15);
CASTLE_MASK[0] = 15 & ~CASTLE_WQ;
CASTLE_MASK[4] = 15 & ~(CASTLE_WK | CASTLE_WQ);
CASTLE_MASK[7] = 15 & ~CASTLE_WK;
CASTLE_MASK[56] = 15 & ~CASTLE_BQ;
CASTLE_MASK[60] = 15 & ~(CASTLE_BK | CASTLE_BQ);
CASTLE_MASK[63] = 15 & ~CASTLE_BK;

/* ------------------------------------------------------------------ */
/* Zobrist hashing (32-bit, deterministic) — used for search/repetition */
/* ------------------------------------------------------------------ */

let seed = 0x9e3779b9;
const rand32 = (): number => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return seed | 0;
};
const Z_PIECE: Int32Array[] = [];
for (let p = 0; p < 16; p++) {
  const row = new Int32Array(64);
  for (let s = 0; s < 64; s++) row[s] = rand32();
  Z_PIECE.push(row);
}
const Z_CASTLE = new Int32Array(16).map(() => rand32());
const Z_EP = new Int32Array(8).map(() => rand32());
const Z_SIDE = rand32();

/* ------------------------------------------------------------------ */

interface Undo {
  move: Move;
  piece: number;
  captured: number;
  castling: number;
  ep: number;
  halfmove: number;
  hash: number;
}

export class FenError extends Error {}

const PROMO_ORDER = [QUEEN, ROOK, BISHOP, KNIGHT] as const;

export class Position {
  readonly board = new Int8Array(64);
  turn: Color = WHITE;
  castling = 0;
  ep = -1;
  halfmove = 0;
  fullmove = 1;
  readonly kings: [number, number] = [-1, -1];
  hash = 0;
  private stack: Undo[] = [];
  /** Hash after every move made since construction (index 0 = starting position). */
  private hashes: number[] = [];

  constructor(fen: string = START_FEN) {
    this.loadFen(fen);
  }

  /* ----------------------------- FEN ------------------------------ */

  loadFen(fen: string): void {
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 4) throw new FenError('FEN needs at least 4 fields');
    const [placement, side, castle, epStr] = parts as [string, string, string, string];
    const halfmove = parts[4] === undefined ? 0 : Number(parts[4]);
    const fullmove = parts[5] === undefined ? 1 : Number(parts[5]);
    if (!Number.isInteger(halfmove) || halfmove < 0) throw new FenError('Bad halfmove clock');
    if (!Number.isInteger(fullmove) || fullmove < 1) throw new FenError('Bad fullmove number');

    const rows = placement.split('/');
    if (rows.length !== 8) throw new FenError('FEN placement needs 8 ranks');
    const board = new Int8Array(64);
    const kings: [number, number] = [-1, -1];
    let kingCount = [0, 0];
    for (let i = 0; i < 8; i++) {
      const rank = 7 - i;
      let file = 0;
      for (const ch of rows[i]!) {
        if (ch >= '1' && ch <= '8') {
          file += Number(ch);
        } else {
          const piece = charToPiece(ch);
          if (!piece || file > 7) throw new FenError(`Bad FEN piece "${ch}"`);
          const sq = rank * 8 + file;
          if (pieceType(piece) === PAWN && (rank === 0 || rank === 7))
            throw new FenError('Pawn on first or last rank');
          board[sq] = piece;
          if (pieceType(piece) === KING) {
            const c = pieceColor(piece);
            kings[c] = sq;
            kingCount[c]!++;
          }
          file++;
        }
      }
      if (file !== 8) throw new FenError(`Rank ${rank + 1} does not have 8 squares`);
    }
    if (kingCount[0] !== 1 || kingCount[1] !== 1)
      throw new FenError('Each side needs exactly one king');
    if (side !== 'w' && side !== 'b') throw new FenError('Side to move must be w or b');

    let rights = 0;
    if (castle !== '-') {
      for (const ch of castle) {
        if (ch === 'K') rights |= CASTLE_WK;
        else if (ch === 'Q') rights |= CASTLE_WQ;
        else if (ch === 'k') rights |= CASTLE_BK;
        else if (ch === 'q') rights |= CASTLE_BQ;
        else throw new FenError('Bad castling field');
      }
    }
    // Drop rights that the piece placement contradicts.
    if (board[4] !== makePiece(KING, WHITE)) rights &= ~(CASTLE_WK | CASTLE_WQ);
    if (board[7] !== makePiece(ROOK, WHITE)) rights &= ~CASTLE_WK;
    if (board[0] !== makePiece(ROOK, WHITE)) rights &= ~CASTLE_WQ;
    if (board[60] !== makePiece(KING, BLACK)) rights &= ~(CASTLE_BK | CASTLE_BQ);
    if (board[63] !== makePiece(ROOK, BLACK)) rights &= ~CASTLE_BK;
    if (board[56] !== makePiece(ROOK, BLACK)) rights &= ~CASTLE_BQ;

    let ep = -1;
    if (epStr !== '-') {
      ep = parseSquare(epStr);
      if (ep < 0) throw new FenError('Bad en passant square');
      const expectRank = side === 'w' ? 5 : 2;
      if (rankOf(ep) !== expectRank) throw new FenError('En passant square on wrong rank');
    }

    this.board.set(board);
    this.kings[0] = kings[0];
    this.kings[1] = kings[1];
    this.turn = side === 'w' ? WHITE : BLACK;
    this.castling = rights;
    this.ep = ep;
    this.halfmove = halfmove;
    this.fullmove = fullmove;
    this.stack = [];
    this.recomputeHash();
    this.hashes = [this.hash];

    // The side that just moved must not have left its own king capturable.
    const them = (this.turn ^ 1) as Color;
    if (this.isAttacked(this.kings[them], this.turn))
      throw new FenError('Side not to move is in check');
  }

  toFen(): string {
    const rows: string[] = [];
    for (let rank = 7; rank >= 0; rank--) {
      let row = '';
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const p = this.board[rank * 8 + file]!;
        if (!p) empty++;
        else {
          if (empty) row += empty;
          empty = 0;
          row += pieceToChar(p);
        }
      }
      if (empty) row += empty;
      rows.push(row);
    }
    let c = '';
    if (this.castling & CASTLE_WK) c += 'K';
    if (this.castling & CASTLE_WQ) c += 'Q';
    if (this.castling & CASTLE_BK) c += 'k';
    if (this.castling & CASTLE_BQ) c += 'q';
    const ep = this.epCapturePossible() ? squareName(this.ep) : '-';
    return `${rows.join('/')} ${this.turn === WHITE ? 'w' : 'b'} ${c || '-'} ${ep} ${this.halfmove} ${this.fullmove}`;
  }

  /** First four FEN fields — the identity of a position for repetition purposes. */
  repetitionKey(): string {
    return this.toFen().split(' ').slice(0, 4).join(' ');
  }

  clone(): Position {
    return new Position(this.toFenRaw());
  }

  /** FEN with the raw en passant square (not filtered for legality). */
  private toFenRaw(): string {
    const fen = this.toFen().split(' ');
    fen[3] = this.ep >= 0 ? squareName(this.ep) : '-';
    return fen.join(' ');
  }

  private recomputeHash(): void {
    let h = 0;
    for (let sq = 0; sq < 64; sq++) {
      const p = this.board[sq]!;
      if (p) h ^= Z_PIECE[p]![sq]!;
    }
    h ^= Z_CASTLE[this.castling]!;
    if (this.ep >= 0) h ^= Z_EP[this.ep & 7]!;
    if (this.turn === BLACK) h ^= Z_SIDE;
    this.hash = h;
  }

  /** True if the side to move has a legal en passant capture. */
  private epCapturePossible(): boolean {
    if (this.ep < 0) return false;
    const us = this.turn;
    const pawn = makePiece(PAWN, us);
    for (const from of PAWN_ATTACKS[us ^ 1]![this.ep]!) {
      if (this.board[from] === pawn) {
        const m = makeMove(from, this.ep, 0, FLAG_EP | FLAG_CAPTURE);
        if (this.isLegal(m)) return true;
      }
    }
    return false;
  }

  /* --------------------------- Attacks ---------------------------- */

  isAttacked(sq: number, by: Color): boolean {
    const b = this.board;
    const knight = makePiece(KNIGHT, by);
    for (const t of KNIGHT_TARGETS[sq]!) if (b[t] === knight) return true;
    const king = makePiece(KING, by);
    for (const t of KING_TARGETS[sq]!) if (b[t] === king) return true;
    const pawn = makePiece(PAWN, by);
    for (const t of PAWN_ATTACKS[by ^ 1]![sq]!) if (b[t] === pawn) return true;
    const queen = makePiece(QUEEN, by);
    const rook = makePiece(ROOK, by);
    const bishop = makePiece(BISHOP, by);
    for (let d = 0; d < 8; d++) {
      const slider = d < 4 ? rook : bishop;
      for (const t of RAYS[sq]![d]!) {
        const p = b[t]!;
        if (p) {
          if (p === slider || p === queen) return true;
          break;
        }
      }
    }
    return false;
  }

  inCheck(): boolean {
    return this.isAttacked(this.kings[this.turn], (this.turn ^ 1) as Color);
  }

  /** All squares holding pieces of `by` that attack `sq` (for coaching / defender counts). */
  attackersOf(sq: number, by: Color): number[] {
    const out: number[] = [];
    const b = this.board;
    const knight = makePiece(KNIGHT, by);
    for (const t of KNIGHT_TARGETS[sq]!) if (b[t] === knight) out.push(t);
    const king = makePiece(KING, by);
    for (const t of KING_TARGETS[sq]!) if (b[t] === king) out.push(t);
    const pawn = makePiece(PAWN, by);
    for (const t of PAWN_ATTACKS[by ^ 1]![sq]!) if (b[t] === pawn) out.push(t);
    const queen = makePiece(QUEEN, by);
    const rook = makePiece(ROOK, by);
    const bishop = makePiece(BISHOP, by);
    for (let d = 0; d < 8; d++) {
      const slider = d < 4 ? rook : bishop;
      for (const t of RAYS[sq]![d]!) {
        const p = b[t]!;
        if (p) {
          if (p === slider || p === queen) out.push(t);
          break;
        }
      }
    }
    return out;
  }

  /* ------------------------ Move generation ------------------------ */

  /** Pseudo-legal moves (may leave own king in check). */
  pseudoMoves(capturesOnly = false): Move[] {
    const moves: Move[] = [];
    const b = this.board;
    const us = this.turn;
    const them = (us ^ 1) as Color;
    const dir = us === WHITE ? 8 : -8;
    const startRank = us === WHITE ? 1 : 6;
    const promoRank = us === WHITE ? 7 : 0;

    for (let sq = 0; sq < 64; sq++) {
      const piece = b[sq]!;
      if (!piece || pieceColor(piece) !== us) continue;
      const type = pieceType(piece);

      if (type === PAWN) {
        const one = sq + dir;
        if (b[one] === 0) {
          if (rankOf(one) === promoRank) {
            for (const pr of PROMO_ORDER) moves.push(makeMove(sq, one, pr));
          } else if (!capturesOnly) {
            moves.push(makeMove(sq, one));
            if (rankOf(sq) === startRank && b[one + dir] === 0)
              moves.push(makeMove(sq, one + dir, 0, FLAG_DOUBLE));
          }
        }
        for (const t of PAWN_ATTACKS[us]![sq]!) {
          const target = b[t]!;
          if (target && pieceColor(target) === them) {
            if (rankOf(t) === promoRank) {
              for (const pr of PROMO_ORDER) moves.push(makeMove(sq, t, pr, FLAG_CAPTURE));
            } else moves.push(makeMove(sq, t, 0, FLAG_CAPTURE));
          } else if (t === this.ep && !target) {
            moves.push(makeMove(sq, t, 0, FLAG_EP | FLAG_CAPTURE));
          }
        }
      } else if (type === KNIGHT || type === KING) {
        const targets = type === KNIGHT ? KNIGHT_TARGETS[sq]! : KING_TARGETS[sq]!;
        for (const t of targets) {
          const target = b[t]!;
          if (!target) {
            if (!capturesOnly) moves.push(makeMove(sq, t));
          } else if (pieceColor(target) === them) moves.push(makeMove(sq, t, 0, FLAG_CAPTURE));
        }
      } else {
        const from = type === BISHOP ? 4 : 0;
        const to = type === ROOK ? 4 : 8;
        for (let d = from; d < to; d++) {
          for (const t of RAYS[sq]![d]!) {
            const target = b[t]!;
            if (!target) {
              if (!capturesOnly) moves.push(makeMove(sq, t));
            } else {
              if (pieceColor(target) === them) moves.push(makeMove(sq, t, 0, FLAG_CAPTURE));
              break;
            }
          }
        }
      }
    }

    if (!capturesOnly) this.genCastling(moves);
    return moves;
  }

  private genCastling(moves: Move[]): void {
    const b = this.board;
    const us = this.turn;
    const them = (us ^ 1) as Color;
    if (us === WHITE) {
      if (this.castling & (CASTLE_WK | CASTLE_WQ) && !this.isAttacked(4, them)) {
        if (this.castling & CASTLE_WK && !b[5] && !b[6] && !this.isAttacked(5, them))
          moves.push(makeMove(4, 6, 0, FLAG_CASTLE));
        if (this.castling & CASTLE_WQ && !b[3] && !b[2] && !b[1] && !this.isAttacked(3, them))
          moves.push(makeMove(4, 2, 0, FLAG_CASTLE));
      }
    } else if (this.castling & (CASTLE_BK | CASTLE_BQ) && !this.isAttacked(60, them)) {
      if (this.castling & CASTLE_BK && !b[61] && !b[62] && !this.isAttacked(61, them))
        moves.push(makeMove(60, 62, 0, FLAG_CASTLE));
      if (this.castling & CASTLE_BQ && !b[59] && !b[58] && !b[57] && !this.isAttacked(59, them))
        moves.push(makeMove(60, 58, 0, FLAG_CASTLE));
    }
  }

  /** Fully legal moves for the side to move. */
  legalMoves(capturesOnly = false): Move[] {
    const us = this.turn;
    const them = (us ^ 1) as Color;
    const out: Move[] = [];
    for (const m of this.pseudoMoves(capturesOnly)) {
      this.makeMove(m);
      if (!this.isAttacked(this.kings[us], them)) out.push(m);
      this.unmakeMove();
    }
    return out;
  }

  isLegal(m: Move): boolean {
    // Quick structural check first, then full legality via make/unmake.
    const us = this.turn;
    const piece = this.board[moveFrom(m)]!;
    if (!piece || pieceColor(piece) !== us) return false;
    let found = false;
    for (const pm of this.pseudoMoves()) {
      if (pm === m) {
        found = true;
        break;
      }
    }
    if (!found) return false;
    this.makeMove(m);
    const ok = !this.isAttacked(this.kings[us], (us ^ 1) as Color);
    this.unmakeMove();
    return ok;
  }

  hasLegalMove(): boolean {
    const us = this.turn;
    const them = (us ^ 1) as Color;
    for (const m of this.pseudoMoves()) {
      this.makeMove(m);
      const ok = !this.isAttacked(this.kings[us], them);
      this.unmakeMove();
      if (ok) return true;
    }
    return false;
  }

  /** Find the legal move matching from/to/promotion, or undefined. */
  findMove(from: number, to: number, promo = 0): Move | undefined {
    for (const m of this.legalMoves()) {
      if (moveFrom(m) === from && moveTo(m) === to && movePromo(m) === promo) return m;
    }
    return undefined;
  }

  /* ------------------------ Make / unmake -------------------------- */

  makeMove(m: Move): void {
    const from = moveFrom(m);
    const to = moveTo(m);
    const promo = movePromo(m);
    const flags = moveFlags(m);
    const b = this.board;
    const us = this.turn;
    const piece = b[from]!;
    let captured = b[to]!;

    this.stack.push({
      move: m,
      piece,
      captured,
      castling: this.castling,
      ep: this.ep,
      halfmove: this.halfmove,
      hash: this.hash,
    });

    let h = this.hash ^ Z_SIDE;
    if (this.ep >= 0) h ^= Z_EP[this.ep & 7]!;
    h ^= Z_CASTLE[this.castling]!;

    b[from] = 0;
    h ^= Z_PIECE[piece]![from]!;

    if (flags & FLAG_EP) {
      const capSq = us === WHITE ? to - 8 : to + 8;
      captured = b[capSq]!;
      b[capSq] = 0;
      h ^= Z_PIECE[captured]![capSq]!;
      this.stack[this.stack.length - 1]!.captured = captured;
    } else if (captured) {
      h ^= Z_PIECE[captured]![to]!;
    }

    const placed = promo ? makePiece(promo, us) : piece;
    b[to] = placed;
    h ^= Z_PIECE[placed]![to]!;

    if (flags & FLAG_CASTLE) {
      const kingside = to > from;
      const rookFrom = kingside ? to + 1 : to - 2;
      const rookTo = kingside ? to - 1 : to + 1;
      const rook = b[rookFrom]!;
      b[rookFrom] = 0;
      b[rookTo] = rook;
      h ^= Z_PIECE[rook]![rookFrom]! ^ Z_PIECE[rook]![rookTo]!;
    }

    if (pieceType(piece) === KING) this.kings[us] = to;

    this.castling &= CASTLE_MASK[from]! & CASTLE_MASK[to]!;
    this.ep = flags & FLAG_DOUBLE ? (from + to) >> 1 : -1;
    this.halfmove = pieceType(piece) === PAWN || captured ? 0 : this.halfmove + 1;
    if (us === BLACK) this.fullmove++;
    this.turn = (us ^ 1) as Color;

    h ^= Z_CASTLE[this.castling]!;
    if (this.ep >= 0) h ^= Z_EP[this.ep & 7]!;
    this.hash = h;
    this.hashes.push(h);
  }

  unmakeMove(): void {
    const u = this.stack.pop();
    if (!u) return;
    this.hashes.pop();
    const m = u.move;
    const from = moveFrom(m);
    const to = moveTo(m);
    const flags = moveFlags(m);
    const b = this.board;
    this.turn = (this.turn ^ 1) as Color;
    const us = this.turn;

    b[from] = u.piece;
    if (flags & FLAG_EP) {
      b[to] = 0;
      b[us === WHITE ? to - 8 : to + 8] = u.captured;
    } else {
      b[to] = u.captured;
    }
    if (flags & FLAG_CASTLE) {
      const kingside = to > from;
      const rookFrom = kingside ? to + 1 : to - 2;
      const rookTo = kingside ? to - 1 : to + 1;
      b[rookFrom] = b[rookTo]!;
      b[rookTo] = 0;
    }
    if (pieceType(u.piece) === KING) this.kings[us] = from;
    this.castling = u.castling;
    this.ep = u.ep;
    this.halfmove = u.halfmove;
    if (us === BLACK) this.fullmove--;
    this.hash = u.hash;
  }

  /** Null move for search pruning. */
  makeNull(): void {
    this.stack.push({
      move: 0,
      piece: 0,
      captured: 0,
      castling: this.castling,
      ep: this.ep,
      halfmove: this.halfmove,
      hash: this.hash,
    });
    let h = this.hash ^ Z_SIDE;
    if (this.ep >= 0) h ^= Z_EP[this.ep & 7]!;
    this.ep = -1;
    this.halfmove++;
    this.turn = (this.turn ^ 1) as Color;
    this.hash = h;
    this.hashes.push(h);
  }

  unmakeNull(): void {
    const u = this.stack.pop()!;
    this.hashes.pop();
    this.turn = (this.turn ^ 1) as Color;
    this.ep = u.ep;
    this.halfmove = u.halfmove;
    this.hash = u.hash;
  }

  get plyCount(): number {
    return this.stack.length;
  }

  /** Undo moves (including null moves) until the stack is back to `ply` entries. */
  unwindTo(ply: number): void {
    while (this.stack.length > ply) {
      if (this.stack[this.stack.length - 1]!.move === 0) this.unmakeNull();
      else this.unmakeMove();
    }
  }

  /** Cheap repetition test for search: has the current hash occurred earlier in the same game line? */
  repetitionCount(): number {
    let n = 0;
    const last = this.hashes.length - 1;
    const limit = Math.max(0, last - this.halfmove);
    for (let i = last - 2; i >= limit; i -= 2) if (this.hashes[i] === this.hash) n++;
    return n;
  }

  /* ------------------------ Draw detection ------------------------- */

  isInsufficientMaterial(): boolean {
    const minors: number[] = [];
    const bishopSquareColors: number[] = [];
    for (let sq = 0; sq < 64; sq++) {
      const p = this.board[sq]!;
      if (!p) continue;
      const t = pieceType(p);
      if (t === KING) continue;
      if (t === PAWN || t === ROOK || t === QUEEN) return false;
      minors.push(p);
      if (t === BISHOP) bishopSquareColors.push((fileOf(sq) + rankOf(sq)) & 1);
    }
    if (minors.length <= 1) return true;
    // Only bishops, all on the same square colour (any number).
    if (minors.every((p) => pieceType(p) === BISHOP)) {
      return bishopSquareColors.every((c) => c === bishopSquareColors[0]);
    }
    return false;
  }

  /* ---------------------------- SAN -------------------------------- */

  toSan(m: Move, legal: Move[] = this.legalMoves()): string {
    const from = moveFrom(m);
    const to = moveTo(m);
    const flags = moveFlags(m);
    const piece = this.board[from]!;
    const type = pieceType(piece);
    let san: string;

    if (flags & FLAG_CASTLE) {
      san = to > from ? 'O-O' : 'O-O-O';
    } else {
      san = '';
      const capture = (flags & FLAG_CAPTURE) !== 0;
      if (type === PAWN) {
        if (capture) san += 'abcdefgh'[fileOf(from)] + 'x';
      } else {
        san += 'PNBRQK'[type - 1];
        let sameTo = false;
        let sameFile = false;
        let sameRank = false;
        for (const o of legal) {
          if (o === m) continue;
          const of = moveFrom(o);
          if (moveTo(o) === to && this.board[of] === piece) {
            sameTo = true;
            if (fileOf(of) === fileOf(from)) sameFile = true;
            if (rankOf(of) === rankOf(from)) sameRank = true;
          }
        }
        if (sameTo) {
          if (!sameFile) san += 'abcdefgh'[fileOf(from)];
          else if (!sameRank) san += String(rankOf(from) + 1);
          else san += squareName(from);
        }
        if (capture) san += 'x';
      }
      san += squareName(to);
      const promo = movePromo(m);
      if (promo) san += '=' + 'PNBRQK'[promo - 1];
    }

    this.makeMove(m);
    if (this.inCheck()) san += this.hasLegalMove() ? '+' : '#';
    this.unmakeMove();
    return san;
  }

  /** Parse SAN (tolerates 0-0, missing check marks, and annotation glyphs). */
  parseSan(text: string): Move | undefined {
    const clean = (s: string) =>
      s
        .replace(/0/g, 'O')
        .replace(/[+#!?]+$/g, '')
        .replace(/e\.p\./g, '')
        .trim();
    const want = clean(text);
    if (!want) return undefined;
    const legal = this.legalMoves();
    for (const m of legal) {
      if (clean(this.toSan(m, legal)) === want) return m;
    }
    // Lenient: allow omitted "x" or omitted pawn-capture marker.
    const loose = (s: string) => s.replace('x', '').replace('=', '');
    for (const m of legal) {
      if (loose(clean(this.toSan(m, legal))) === loose(want)) return m;
    }
    return undefined;
  }

  parseUci(text: string): Move | undefined {
    if (text.length < 4) return undefined;
    const from = parseSquare(text.slice(0, 2));
    const to = parseSquare(text.slice(2, 4));
    if (from < 0 || to < 0) return undefined;
    const promoChar = text[4];
    const promo = promoChar ? 'pnbrqk'.indexOf(promoChar.toLowerCase()) + 1 : 0;
    return this.findMove(from, to, promo);
  }

  /* ----------------------------- Perft ----------------------------- */

  perft(depth: number): number {
    if (depth === 0) return 1;
    const moves = this.legalMoves();
    if (depth === 1) return moves.length;
    let nodes = 0;
    for (const m of moves) {
      this.makeMove(m);
      nodes += this.perft(depth - 1);
      this.unmakeMove();
    }
    return nodes;
  }
}
