/** Small helpers so lesson content stays readable. No logic beyond building the data. */
import type {
  AskExercise, BoardSpec, ChoiceQuestion, DemoMove, DemoStep, Lesson, MoveExercise, MoveQuestion, PlaceExercise, Question, ReachExercise, ReadStep, SquareExercise, SquareQuestion, Step,
} from '../types';
import { themeInfo } from '../../puzzles/themes';
import { TP } from './tactic-positions';
import { Position } from '../../chess/position';
import { START_FEN, moveFrom, moveTo, movePromo, squareName } from '../../chess/types';

type Extra<T> = Partial<Omit<T, 'kind'>>;

export const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const board = (fen: string, o: Omit<BoardSpec, 'fen'> = {}): BoardSpec => ({ fen, ...o });
export const empty = (o: Omit<BoardSpec, 'fen'> = {}): BoardSpec => ({ fen: 'empty', ...o });

export const read = (text: string | string[], b?: BoardSpec, title?: string): ReadStep => ({ kind: 'read', title, text: Array.isArray(text) ? text : [text], board: b });

export const demo = (title: string, b: BoardSpec, moves: Array<[string, string] | DemoMove>, intro?: string): DemoStep => ({
  kind: 'demo', title, intro, board: b,
  moves: moves.map((m) => (Array.isArray(m) ? { uci: m[0], say: m[1] } : m)),
});

export const move = (id: string, prompt: string, fen: string, line: string[], hints: string[], explain: string, o: Extra<MoveExercise> & { orientation?: 'white' | 'black'; marks?: BoardSpec['marks']; arrows?: BoardSpec['arrows'] } = {}): MoveExercise => {
  const { orientation, marks, arrows, ...rest } = o;
  return { kind: 'move', id, prompt, board: { fen, orientation, marks, arrows }, line, hints, explain, ...rest };
};

export const reach = (id: string, prompt: string, fen: string, from: string, hints: string[], explain: string, o: Extra<ReachExercise> & { orientation?: 'white' | 'black' } = {}): ReachExercise => {
  const { orientation, ...rest } = o;
  return { kind: 'reach', id, prompt, board: { fen, orientation }, from, hints, explain, ...rest };
};

export const place = (id: string, prompt: string, b: BoardSpec, tasks: PlaceExercise['tasks'], hints: string[], explain: string): PlaceExercise => ({ kind: 'place', id, prompt, board: b, tasks, hints, explain });

export const square = (id: string, prompt: string, b: BoardSpec, targets: string[], hints: string[], explain: string, asks?: string[]): SquareExercise => ({ kind: 'square', id, prompt, board: b, targets, asks, hints, explain });

export const ask = (id: string, prompt: string, options: string[], answer: number, hints: string[], explain: string, o: { board?: BoardSpec; wrong?: Record<number, string> } = {}): AskExercise => ({ kind: 'ask', id, prompt, options, answer, hints, explain, ...o });

/** Knowledge-check questions. */
export const choice = (id: string, prompt: string, options: string[], answer: number, explain: string, o: { board?: BoardSpec; lesson?: string } = {}): ChoiceQuestion & { lesson?: string } => ({ kind: 'choice', id, prompt, options, answer, explain, ...o });
export const tf = (id: string, prompt: string, answer: boolean, explain: string, o: { board?: BoardSpec; lesson?: string } = {}): ChoiceQuestion & { lesson?: string } =>
  ({ kind: 'choice', id, prompt, options: ['True', 'False'], answer: answer ? 0 : 1, explain, ...o });
export const mq = (id: string, prompt: string, fen: string, answers: string[], explain: string, o: { orientation?: 'white' | 'black'; mate?: boolean; soft?: boolean; lesson?: string; marks?: BoardSpec['marks'] } = {}): MoveQuestion & { lesson?: string } => {
  const { orientation, marks, ...rest } = o;
  return { kind: 'move', id, prompt, board: { fen, orientation, marks }, answers, explain, ...rest };
};
export const sq = (id: string, prompt: string, b: BoardSpec, answers: string[], explain: string, o: { lesson?: string } = {}): SquareQuestion & { lesson?: string } => ({ kind: 'square', id, prompt, board: b, answers, explain, ...o });

export function lesson(id: string, title: string, topic: string, minutes: number, objectives: string[], steps: Step[], check: Question[], o: Partial<Pick<Lesson, 'puzzleThemes' | 'reviewTags' | 'reviewPhases' | 'concepts' | 'claims'>> = {}): Lesson {
  return { id, title, topic, minutes, objectives, steps, check: check.map((q) => ({ ...q, lesson: (q as { lesson?: string }).lesson ?? id })), ...o };
}

/* ---------- exercises and questions built from the frozen puzzle positions (tactic-positions.ts) ---------- */

const tp = (id: string) => {
  const t = TP[id];
  if (!t) throw new Error(`unknown tactic position ${id}`);
  return t;
};
const isMate1 = (id: string) => tp(id).themes.includes('mateIn1');

/** A puzzle as a guided exercise. The first move is the learner's; later replies are played automatically. */
export function pz(id: string, themeId: string, o: { prompt?: string; soft?: boolean; extra?: string } = {}): MoveExercise {
  const t = tp(id);
  const th = themeInfo(themeId);
  if (!th) throw new Error(`unknown theme ${themeId}`);
  return {
    kind: 'move', id: `ex-${id}`,
    prompt: o.prompt ?? `${t.side} to move. Find the strongest move.`,
    board: { fen: t.fen, orientation: t.side === 'Black' ? 'black' : 'white' },
    line: t.line, anyMate: isMate1(id), soft: o.soft,
    hints: [th.direction, th.motif, `Look at the piece on ${t.line[0]!.slice(0, 2)}.`],
    explain: `The winning line is ${t.text}. ${th.idea}${o.extra ? ' ' + o.extra : ''}`,
  };
}

/** A puzzle as a single-move knowledge-check question. */
export function pq(id: string, themeId: string, o: { prompt?: string; lesson?: string } = {}): MoveQuestion & { lesson?: string } {
  const t = tp(id);
  const th = themeInfo(themeId);
  if (!th) throw new Error(`unknown theme ${themeId}`);
  return {
    kind: 'move', id: `q-${id}`,
    prompt: o.prompt ?? `${t.side} to move. Find the strongest move.`,
    board: { fen: t.fen, orientation: t.side === 'Black' ? 'black' : 'white' },
    answers: [t.line[0]!], mate: isMate1(id) || undefined,
    explain: `The winning line is ${t.text}. ${th.idea}`,
    ...(o.lesson ? { lesson: o.lesson } : {}),
  };
}

/** A puzzle shown as a stepped demonstration, with a hand-written comment per move. */
export function pdemo(id: string, title: string, says: string[], intro?: string): DemoStep {
  const t = tp(id);
  if (says.length !== t.line.length) throw new Error(`${id}: needs ${t.line.length} comments, got ${says.length}`);
  return demo(title, { fen: t.fen, orientation: t.side === 'Black' ? 'black' : 'white' }, t.line.map((u, i) => [u, says[i]!] as [string, string]), intro);
}
export const tacticFen = (id: string) => tp(id).fen;


/* ---------- lines written in SAN, converted to UCI and FENs when the module loads ---------- */

const uciOf = (m: number): string => squareName(moveFrom(m)) + squareName(moveTo(m)) + (movePromo(m) ? 'pnbrqk'[movePromo(m) - 1]! : '');

/** Play a SAN line from `from` (default: the start position). Throws on an illegal or ambiguous move, so bad content cannot load. */
export function sanLine(san: string, from: string = START_FEN): { fen: string; uci: string[] } {
  const p = new Position(from);
  const uci: string[] = [];
  for (const tok of san.split(/\s+/).filter((t) => t && !/^\d+\.+$/.test(t))) {
    const m = p.parseSan(tok);
    if (m === undefined) throw new Error(`illegal SAN "${tok}" after "${uci.join(' ')}" from ${from}`);
    uci.push(uciOf(m));
    p.makeMove(m);
  }
  return { fen: p.toFen(), uci };
}
export const fenAfter = (san: string, from?: string): string => sanLine(san, from).fen;

/** A demonstration written as SAN moves with one comment per move. */
export function demoSan(title: string, san: string, says: string[], o: { from?: string; intro?: string; orientation?: 'white' | 'black' } = {}): DemoStep {
  const start = o.from ?? START_FEN;
  const { uci } = sanLine(san, start);
  if (uci.length !== says.length) throw new Error(`${title}: ${uci.length} moves but ${says.length} comments`);
  return demo(title, { fen: start, orientation: o.orientation }, uci.map((u, i) => [u, says[i]!] as [string, string]), o.intro);
}

/** A move exercise whose solution line is written in SAN, starting from the position after `setup`. */
export function moveSan(id: string, prompt: string, setup: string, line: string, hints: string[], explain: string, o: Extra<MoveExercise> & { from?: string; orientation?: 'white' | 'black'; alt?: string[] } = {}): MoveExercise {
  const start = setup.includes('/') ? setup : fenAfter(setup, o.from);
  const { from: _f, ...rest } = o;
  const uci = sanLine(line, start).uci;
  const alt = (o.alt ?? []).map((a) => sanLine(a, start).uci[0]!);
  return move(id, prompt, start, uci, hints, explain, { ...rest, alt: alt.length ? alt : undefined });
}

/** A one-move knowledge-check question from the position after `setup`. */
export function mqSan(id: string, prompt: string, setup: string, answers: string[], explain: string, o: { from?: string; orientation?: 'white' | 'black'; mate?: boolean; soft?: boolean; lesson?: string } = {}): MoveQuestion & { lesson?: string } {
  const start = setup.includes('/') ? setup : fenAfter(setup, o.from);
  const { from: _f, ...rest } = o;
  return mq(id, prompt, start, answers.map((a) => sanLine(a, start).uci[0]!), explain, rest);
}
