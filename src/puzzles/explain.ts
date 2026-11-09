/**
 * Explanations of a solved puzzle at three levels. Everything stated comes from one of three places:
 *  - the rules engine (what each move is, whether it captures, gives check or mates, which pieces the moved piece attacks),
 *  - the settled material result of the stored line (see review/facts.ts),
 *  - the theme tags of the puzzle data (named as tags, with the sentence MoveWise has written for that theme).
 * Optionally an engine evaluation (`engine`) is added to the advanced text. When none of the above says why a move works, the
 * text says so and simply shows the verified continuation. Nothing is guessed.
 */
import { Position } from '../chess/position';
import { KING, squareName } from '../chess/types';
import { type ExplainLevel } from '../review/explain';
import { buildLine, describeMove, formatLine, pieceWord, settledMaterialChange, type Line, type MoveDetail } from '../review/facts';
import { pointsText } from '../review/format';
import { isCheckmate } from './validate';
import { primaryTheme, themeInfo, themeLabel } from './themes';
import type { Puzzle } from './types';

export interface PuzzleExplanation {
  headline: string;
  paragraphs: string[];
  /** The whole stored solution, written out from the position the player sees. */
  line: Line;
  /** The tags the puzzle data carries, as labels. */
  tags: string[];
  /** Facts that were checked by the rules engine, used by tests and the advanced view. */
  facts: { checks: number; captures: number; endsInMate: boolean; material: number; targetsAfterFirst: string[] };
}

export interface EngineNote {
  engine: string;
  /** Evaluation after the first solution move, from the player's side, in centipawns, or null. */
  cp: number | null;
  mate: number | null;
  depth: number;
}

const a = (w: string): string => (/^[aeiou]/.test(w) ? 'an' : 'a');

function playerSteps(p: Puzzle): { fen: string; d: MoveDetail }[] {
  const out: { fen: string; d: MoveDetail }[] = [];
  const pos = new Position(p.fen);
  for (let i = 0; i < p.moves.length; i++) {
    const fen = pos.toFen();
    const m = pos.parseUci(p.moves[i]!);
    if (m === undefined) break;
    if (i % 2 === 1) {
      const d = describeMove(fen, p.moves[i]!);
      if (d) out.push({ fen, d });
    }
    pos.makeMove(m);
  }
  return out;
}

/** Enemy pieces the moved piece attacks after the first solution move, e.g. ["queen on d8", "rook on f8"]. */
export function targetsAfter(fen: string, uci: string): string[] {
  const pos = new Position(fen);
  const m = pos.parseUci(uci);
  if (m === undefined) return [];
  const mover = pos.turn;
  const to = describeMove(fen, uci)?.to;
  pos.makeMove(m);
  if (to === undefined) return [];
  const out: string[] = [];
  for (let sq = 0; sq < 64; sq++) {
    const p = pos.board[sq]!;
    if (!p || p >> 3 === mover || (p & 7) === 1) continue; // enemy pieces other than pawns
    if (pos.attackersOf(sq, mover).includes(to)) out.push(`${pieceWord(p & 7)} on ${squareName(sq)}`);
  }
  return out;
}

export function explainPuzzle(p: Puzzle, level: ExplainLevel, engine?: EngineNote | null): PuzzleExplanation {
  const steps = playerSteps(p);
  const setup = describeMove(p.fen, p.moves[0]!);
  // The line the player sees starts after the setup move.
  const pos0 = new Position(p.fen);
  pos0.makeMove(pos0.parseUci(p.moves[0]!)!);
  const seen = buildLine(pos0.toFen(), p.moves.slice(1), p.moves.length);
  const side = pos0.turn;
  const end = new Position(p.fen);
  for (const u of p.moves) end.makeMove(end.parseUci(u)!);
  const endsInMate = isCheckmate(end);
  const mat = settledMaterialChange(pos0.toFen(), p.moves.slice(1), side, p.moves.length);
  const checks = steps.filter((s) => s.d.check).length;
  const captures = steps.filter((s) => s.d.captured).length;
  const prim = primaryTheme(p.themes);
  const info = themeInfo(prim ?? '');
  const first = steps[0];
  const targets = first ? targetsAfter(first.fen, first.d.uci) : [];
  const tags = p.themes.filter((t) => themeInfo(t)).map(themeLabel);
  const facts = { checks, captures, endsInMate, material: mat.change, targetsAfterFirst: targets };

  const label = info ? info.label.toLowerCase() : null;
  const headline = endsInMate && steps.length >= 1
    ? `${steps.length === 1 ? 'Checkmate in one' : `Checkmate in ${steps.length}`}${info && info.group === 'pattern' ? `: ${info.label}` : ''}`
    : info ? `${info.label}: ${steps[0]?.d.san ?? ''}` : `Solution: ${steps[0]?.d.san ?? ''}`;

  const paras: string[] = [];
  const winning = steps.map((s) => s.d.san).join(', then ');
  // Beginner.
  paras.push(
    `The solution is ${steps.length === 1 ? steps[0]!.d.san : winning}.${endsInMate ? ' It ends in checkmate.' : mat.change >= 200 ? ` Once the captures settle you are ahead by ${pointsText(mat.change)}.` : ''}`,
  );
  if (info) paras.push(`The idea (tagged “${info.label}”): ${info.idea}`);
  if (first && targets.length >= 2 && prim === 'fork') paras.push(`After ${first.d.san}, the ${pieceWord(first.d.pieceType)} attacks the ${targets.slice(0, 3).join(' and the ')} at the same time.`);
  else if (first && targets.length >= 1 && level !== 'beginner' && p.themes.some((t) => t === 'fork' || t === 'skewer' || t === 'pin')) paras.push(`After ${first.d.san}, the ${pieceWord(first.d.pieceType)} attacks the ${targets.slice(0, 3).join(' and the ')}.`);
  if (level === 'beginner') {
    if (!info) paras.push('MoveWise has no explanation of the idea for this puzzle; the moves above are the verified solution.');
    return { headline, paragraphs: paras, line: seen, tags, facts };
  }

  // Intermediate: what each move does.
  if (setup) paras.push(`Your opponent’s last move was ${setup.san}${setup.captured ? `, capturing ${a(pieceWord(setup.captured))} ${pieceWord(setup.captured)}` : ''}. The puzzle starts after it.`);
  const per = steps.map((s) => {
    const bits = [s.d.checkmate ? 'checkmate' : s.d.check ? 'check' : '', s.d.captured ? `captures ${a(pieceWord(s.d.captured))} ${pieceWord(s.d.captured)}` : '', s.d.promotion ? 'promotes' : ''].filter(Boolean);
    return `${s.d.san}${bits.length ? ` (${bits.join(', ')})` : ''}`;
  });
  paras.push(`Your moves: ${per.join('; ')}.`);
  if (!endsInMate && mat.change !== 0) paras.push(`Material after the exchanges settle: ${mat.change > 0 ? '+' : '−'}${pointsText(Math.abs(mat.change))} for you.`);
  if (level === 'intermediate') {
    if (tags.length > 1) paras.push(`All tags on this puzzle: ${tags.join(', ')}.`);
    return { headline, paragraphs: paras, line: seen, tags, facts };
  }

  // Advanced: calculation.
  paras.push(
    `Calculation: ${steps.length} move${steps.length === 1 ? '' : 's'} for you${steps.length > 1 ? ` against ${steps.length - 1} forced repl${steps.length === 2 ? 'y' : 'ies'}` : ''}. ${checks} of your moves ${checks === 1 ? 'is a check' : 'are checks'} and ${captures} ${captures === 1 ? 'is a capture' : 'are captures'}. Full line: ${formatLine(seen)}.`,
  );
  const king = first && new Position(first.fen).board.findIndex((x) => (x & 7) === KING && x >> 3 !== side);
  if (endsInMate && king !== undefined && king >= 0) paras.push('The final position is checkmate: the king is in check and has no legal move (verified on the rules engine).');
  if (engine) {
    const ev = engine.mate !== null ? `a forced mate in ${Math.abs(engine.mate)}` : engine.cp !== null ? `${engine.cp >= 0 ? '+' : '−'}${(Math.abs(engine.cp) / 100).toFixed(1)}` : 'no usable score';
    paras.push(`${engine.engine} (depth ${engine.depth}) scores the position after ${first?.d.san ?? 'the first move'} at ${ev} for you.`);
  } else {
    paras.push('No engine evaluation was available for this view.');
  }
  paras.push('The stored line is the main line. Other moves can also work; MoveWise accepts a different move only after the engine confirms it is about as good (or mates just as fast).');
  void label;
  return { headline, paragraphs: paras, line: seen, tags, facts };
}
