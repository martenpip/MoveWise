/**
 * Checks every position, move and reference in the Academy content with the rules engine. The app runs this in its tests
 * and refuses to publish content that fails, so a lesson can never ask for an illegal move.
 */
import { Position } from '../chess/position';
import { WHITE, moveFrom, moveTo, parseSquare, pieceColor, pieceType } from '../chess/types';
import { isCheckmate } from '../puzzles/validate';
import type { BoardSpec, Course, ExerciseStep, Lesson, Path, Question, Step } from './types';

const isSq = (s: unknown): s is string => typeof s === 'string' && /^[a-h][1-8]$/.test(s) && parseSquare(s) >= 0;
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export const EMPTY_FEN = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';

/** The position a board spec describes, or null for an empty board. Throws if the FEN is not legal. */
export function positionOf(spec: BoardSpec): Position | null {
  return spec.fen === 'empty' ? null : new Position(spec.fen);
}

/** Plays a UCI list from a position; returns the problem, or null. */
export function replay(fen: string, moves: readonly string[]): string | null {
  let pos: Position;
  try {
    pos = new Position(fen);
  } catch (e) {
    return `bad FEN "${fen}" (${e instanceof Error ? e.message : String(e)})`;
  }
  for (let i = 0; i < moves.length; i++) {
    const u = moves[i]!;
    if (!UCI.test(u)) return `"${u}" is not a UCI move`;
    const m = pos.parseUci(u);
    if (m === undefined) return `move ${i + 1} (${u}) is not legal`;
    pos.makeMove(m);
  }
  return null;
}

const words = (s: string) => s.trim().split(/\s+/).length;

export function validateCurriculum(courses: readonly Course[], paths: readonly Path[] = []): string[] {
  const problems: string[] = [];
  const bad = (where: string, msg: string) => problems.push(`${where}: ${msg}`);
  const seen = new Map<string, string>();
  const unique = (id: string, where: string) => {
    if (!id || !/^[a-z0-9][a-z0-9.-]*$/i.test(id)) bad(where, `bad id "${id}"`);
    if (seen.has(id)) bad(where, `duplicate id "${id}" (also ${seen.get(id)})`);
    seen.set(id, where);
  };

  const board = (b: BoardSpec | undefined, where: string, needsFen = true): Position | null => {
    if (!b) return null;
    let pos: Position | null = null;
    if (b.fen !== 'empty') {
      try {
        pos = new Position(b.fen);
      } catch (e) {
        if (needsFen) bad(where, `board FEN is not legal: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
    }
    for (const a of b.arrows ?? []) if (!isSq(a.from) || !isSq(a.to)) bad(where, `arrow has a bad square ${a.from}-${a.to}`);
    for (const m of b.marks ?? []) if (!isSq(m.sq)) bad(where, `mark has a bad square ${m.sq}`);
    if (b.last && (!isSq(b.last.from) || !isSq(b.last.to))) bad(where, 'bad last-move squares');
    return pos;
  };

  const question = (q: Question, where: string, lessonIds: ReadonlySet<string> | null) => {
    unique(q.id, `${where} question`);
    const w = `${where} question ${q.id}`;
    if (!q.prompt.trim()) bad(w, 'no prompt');
    if (!q.explain.trim()) bad(w, 'no explanation');
    if (q.lesson && lessonIds && !lessonIds.has(q.lesson)) bad(w, `refers to unknown lesson ${q.lesson}`);
    if (q.kind === 'choice') {
      if (q.options.length < 2 || q.options.length > 5) bad(w, 'needs 2 to 5 options');
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) bad(w, 'answer index out of range');
      if (new Set(q.options).size !== q.options.length) bad(w, 'duplicate options');
      board(q.board, w);
    } else if (q.kind === 'move') {
      const pos = board(q.board, w);
      if (!pos) return;
      if (!q.answers.length) bad(w, 'no accepted answers');
      for (const a of q.answers) {
        const p = new Position(q.board.fen);
        const m = UCI.test(a) ? p.parseUci(a) : undefined;
        if (m === undefined) {
          bad(w, `answer ${a} is not a legal move`);
          continue;
        }
        if (q.mate) {
          p.makeMove(m);
          if (!isCheckmate(p)) bad(w, `answer ${a} is not checkmate`);
        }
      }
    } else {
      board(q.board, w, false);
      if (!q.answers.length || !q.answers.every(isSq)) bad(w, 'answers must be squares');
    }
  };

  const exercise = (s: ExerciseStep, where: string) => {
    unique(s.id, `${where} exercise`);
    const w = `${where} exercise ${s.id}`;
    if (!s.prompt.trim()) bad(w, 'no prompt');
    if (!s.explain.trim()) bad(w, 'no explanation');
    if (s.hints.length < 1 || s.hints.length > 3) bad(w, 'needs 1 to 3 hints');
    if (s.kind === 'move') {
      const pos = board(s.board, w);
      if (!pos) return;
      if (s.line.length % 2 !== 1) bad(w, 'the line must end on the learner’s move (odd length)');
      const r = replay(s.board.fen, s.line);
      if (r) bad(w, `line: ${r}`);
      for (const a of s.alt ?? []) {
        const m = pos.parseUci(a);
        if (m === undefined) bad(w, `alternative ${a} is not legal`);
      }
      for (const k of Object.keys(s.wrong ?? {})) if (pos.parseUci(k) === undefined) bad(w, `wrong-move note for ${k}: not legal`);
      if (s.anyMate) {
        const hasMate = pos.legalMoves().some((m) => {
          const p = new Position(s.board.fen);
          p.makeMove(m);
          return isCheckmate(p);
        });
        if (!hasMate) bad(w, 'anyMate is set but no move checkmates');
      }
      if (s.line.length === 1 && s.anyMate) {
        const p = new Position(s.board.fen);
        const m = p.parseUci(s.line[0]!);
        if (m !== undefined) {
          p.makeMove(m);
          if (!isCheckmate(p)) bad(w, 'anyMate, but the stored move is not checkmate');
        }
      }
    } else if (s.kind === 'reach') {
      const pos = board(s.board, w);
      if (!pos) return bad(w, 'reach needs a position');
      if (!isSq(s.from)) return bad(w, 'bad from square');
      const from = parseSquare(s.from);
      const p = pos.board[from]!;
      if (!p || pieceColor(p) !== pos.turn) return bad(w, `no piece of the side to move on ${s.from}`);
      const dests = pos.legalMoves().filter((m) => moveFrom(m) === from);
      if (!dests.length) bad(w, `the piece on ${s.from} has no legal move`);
      if (s.which === 'captures' && !dests.some((m) => pos.board[moveTo(m)] !== 0)) bad(w, 'no capture available');
    } else if (s.kind === 'ask') {
      board(s.board, w);
      if (s.options.length < 2 || s.options.length > 5) bad(w, 'needs 2 to 5 options');
      if (!Number.isInteger(s.answer) || s.answer < 0 || s.answer >= s.options.length) bad(w, 'answer index out of range');
      for (const k of Object.keys(s.wrong ?? {})) if (Number(k) < 0 || Number(k) >= s.options.length) bad(w, `wrong note ${k} is out of range`);
    } else if (s.kind === 'place') {
      board(s.board, w, false);
      if (!s.tasks.length) bad(w, 'no tasks');
      for (const t of s.tasks) {
        if (!t.squares.length || !t.squares.every(isSq)) bad(w, `task ${t.piece} has bad squares`);
        if (t.count !== undefined && (!Number.isInteger(t.count) || t.count < 1 || t.count > t.squares.length)) bad(w, `task ${t.piece} has a bad count`);
      }
    } else {
      board(s.board, w, false);
      if (!s.targets.length || !s.targets.every(isSq)) bad(w, 'bad target squares');
      if (s.asks && s.asks.length !== s.targets.length) bad(w, 'asks must match targets one to one');
    }
  };

  const lesson = (l: Lesson, where: string) => {
    unique(l.id, `${where} lesson`);
    const w = `${where} lesson ${l.id}`;
    if (!l.title.trim()) bad(w, 'no title');
    if (l.objectives.length < 2 || l.objectives.length > 3) bad(w, 'needs 2 or 3 objectives');
    if (l.steps.length < 2) bad(w, 'too few steps');
    if (!l.steps.some((s) => s.kind === 'move' || s.kind === 'reach' || s.kind === 'place' || s.kind === 'square' || s.kind === 'ask')) bad(w, 'a lesson needs at least one interactive exercise');
    if (l.check.length < 2 || l.check.length > 5) bad(w, 'the knowledge check needs 2 to 5 questions');
    l.steps.forEach((s: Step, i) => {
      const sw = `${w} step ${i + 1}`;
      if (s.kind === 'read') {
        if (!s.text.length) bad(sw, 'no text');
        for (const t of s.text) if (words(t) > 60) bad(sw, `a paragraph is ${words(t)} words; keep it under 60`);
        board(s.board, sw);
      } else if (s.kind === 'demo') {
        board(s.board, sw);
        if (!s.moves.length) bad(sw, 'a demonstration needs moves');
        const r = replay(s.board.fen, s.moves.map((m) => m.uci));
        if (r) bad(sw, r);
        for (const m of s.moves) {
          if (!m.say.trim()) bad(sw, `move ${m.uci} has no comment`);
          for (const a of m.arrows ?? []) if (!isSq(a.from) || !isSq(a.to)) bad(sw, 'bad arrow');
        }
      } else {
        exercise(s, w);
      }
    });
    const ids = new Set([l.id]);
    l.check.forEach((q) => question(q, w, ids));
    if (l.steps.length > 14) bad(w, 'too many steps; split the lesson');
    for (const c of l.claims ?? []) {
      try {
        new Position(c.fen);
      } catch {
        bad(w, `claim FEN is not legal: ${c.fen}`);
      }
    }
  };

  const courseIds = new Set(courses.map((c) => c.id));
  for (const c of courses) {
    unique(c.id, `course ${c.id}`);
    const lessonIds = new Set<string>();
    for (const ch of c.chapters) for (const l of ch.lessons) lessonIds.add(l.id);
    for (const r of c.requires) if (!courseIds.has(r)) bad(`course ${c.id}`, `requires unknown course ${r}`);
    if (c.requires.includes(c.id)) bad(`course ${c.id}`, 'requires itself');
    for (const ch of c.chapters) {
      unique(ch.id, `chapter ${ch.id}`);
      if (!ch.lessons.length) bad(`chapter ${ch.id}`, 'has no lessons');
      for (const l of ch.lessons) lesson(l, `${c.id}/${ch.id}`);
      const chLessons = new Set(ch.lessons.map((l) => l.id));
      if (ch.check.length < 4 || ch.check.length > 8) bad(`chapter ${ch.id}`, `the chapter check needs 4 to 8 questions, has ${ch.check.length}`);
      ch.check.forEach((q) => question(q, `chapter ${ch.id}`, chLessons));
    }
    if (c.assessment.length < 8 || c.assessment.length > 14) bad(`course ${c.id}`, `the assessment needs 8 to 14 questions, has ${c.assessment.length}`);
    c.assessment.forEach((q) => question(q, `course ${c.id} assessment`, lessonIds));
  }
  // No prerequisite cycles.
  const byId = new Map(courses.map((c) => [c.id, c]));
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): boolean => {
    if (done.has(id)) return true;
    if (visiting.has(id)) return false;
    visiting.add(id);
    for (const r of byId.get(id)?.requires ?? []) if (!visit(r)) return false;
    visiting.delete(id);
    done.add(id);
    return true;
  };
  for (const c of courses) if (!visit(c.id)) bad(`course ${c.id}`, 'prerequisite cycle');
  // Paths have their own namespace (a path and a course may share an id, such as "beginner").
  const pathIds = new Set<string>();
  for (const p of paths) {
    if (pathIds.has(p.id)) bad(`path ${p.id}`, 'duplicate path id');
    pathIds.add(p.id);
    for (const id of p.courses) if (!courseIds.has(id)) bad(`path ${p.id}`, `unknown course ${id}`);
  }
  return problems;
}

/** Side to move's colour name for prompts. */
export const sideName = (fen: string): 'White' | 'Black' => (new Position(fen).turn === WHITE ? 'White' : 'Black');
/** Piece-type name of the piece on a square, for tests. */
export const pieceOn = (fen: string, sq: string): number => pieceType(new Position(fen).board[parseSquare(sq)]!);
