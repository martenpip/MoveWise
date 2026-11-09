/**
 * What the Trainer says. Every sentence is built from a fact the rules engine or the engine's evaluation supports; there is no
 * canned praise or invented danger. Two levels of detail: "beginner" explains the idea, "concise" states the fact.
 */
import { Position } from '../chess/position';
import { BISHOP, KNIGHT, PAWN, QUEEN, ROOK, WHITE, type Color } from '../chess/types';
import { describeMove, pieceWord } from '../review/facts';
import { attackedBy, loosePieces, looseText } from './facts';
import type { MoveCheck } from './check';
import type { TrainerPrefs } from './types';

type Detail = TrainerPrefs['detail'];

const list = (xs: string[]): string => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const material = (cp: number): string => {
  const n = Math.abs(cp);
  if (n >= 800) return 'a queen';
  if (n >= 450) return 'a rook';
  if (n >= 250) return 'a piece';
  return 'a pawn';
};

/** The warning shown before a serious blunder is played. Null when the check does not support a warning. */
export function warningText(check: MoveCheck, detail: Detail = 'beginner'): string | null {
  if (check.status !== 'checked') return null;
  const parts: string[] = [];
  if (check.mateAgainst !== null) {
    parts.push(check.mateAgainst === 1 ? `After ${check.playedSan}, your opponent can checkmate you in one move.` : `After ${check.playedSan}, the engine finds a forced checkmate against you in ${check.mateAgainst} moves.`);
  } else if (check.material <= -250 && check.reply) {
    parts.push(`After ${check.playedSan}, ${check.reply.san} wins ${material(check.material)} for your opponent.`);
  } else {
    parts.push(`The engine thinks ${check.playedSan} throws away much of your position: your winning chances drop from about ${Math.round(check.winBefore)}% to about ${Math.round(check.winAfter)}%.`);
  }
  parts.push(`${check.best.san} is the engine's choice here.`);
  if (detail === 'beginner') parts.push('You can look again, or play it anyway if you have a reason.');
  return parts.join(' ');
}

/** A short comment on the move the player just made. Null when there is nothing worth saying. */
export function yourMoveText(check: MoveCheck, detail: Detail = 'beginner'): string | null {
  if (check.status !== 'checked') return null;
  if (check.verdict === 'best') {
    const same = check.playedUci === check.best.uci;
    if (same) return detail === 'beginner' ? `${check.playedSan} is the move the engine prefers here. Well found.` : `${check.playedSan}: the engine's choice.`;
    return detail === 'beginner' ? `${check.playedSan} is as good as the engine's first choice, ${check.best.san}. The difference is too small to matter.` : `${check.playedSan}: equal to ${check.best.san}.`;
  }
  if (check.verdict === 'good') return null;
  const lead = check.verdict === 'blunder' ? 'That was a serious mistake' : check.verdict === 'mistake' ? 'That gave up part of your position' : 'That was a little inaccurate';
  const why = check.mateAgainst !== null ? ' It allows a forced checkmate.' : check.material <= -250 && check.reply ? ` ${check.reply.san} wins ${material(check.material)}.` : '';
  return `${lead}.${why} The engine preferred ${check.best.san}.`;
}

const PIECE_NAME: Record<number, string> = { [KNIGHT]: 'knight', [BISHOP]: 'bishop', [ROOK]: 'rook', [QUEEN]: 'queen' };

/** Why the bot played its move, from what the move does on the board. */
export function botMoveText(fenBefore: string, uci: string, ply: number, detail: Detail = 'beginner'): string {
  const d = describeMove(fenBefore, uci);
  if (!d) return '';
  const pos = new Position(fenBefore);
  const color = pos.turn as Color;
  const after = new Position(fenBefore);
  after.makeMove(after.parseUci(uci)!);
  const afterFen = after.toFen();
  const targets = attackedBy(afterFen, d.to).map(looseText);
  let reason: string;
  if (d.checkmate) reason = 'It is checkmate.';
  else if (d.captured) {
    const recapture = after.attackersOf(d.to, (color ^ 1) as Color).length > 0;
    reason = `It takes your ${pieceWord(d.captured)}${recapture ? '.' : ', and nothing of yours can take it back.'}`;
  } else if (d.castle) reason = 'It tucks my king away and brings a rook into play.';
  else if (d.promotion) reason = 'The pawn promotes.';
  else if (d.check) reason = 'It gives check.';
  else if (targets.length) reason = `It attacks your ${list(targets.slice(0, 2))}.`;
  else if (ply <= 20 && PIECE_NAME[d.pieceType] && (color === WHITE ? d.from < 8 : d.from >= 56)) reason = `It brings my ${PIECE_NAME[d.pieceType]} into the game.`;
  else if (ply <= 20 && d.pieceType === PAWN && ['d', 'e'].includes('abcdefgh'[d.to % 8]!)) reason = 'It claims space in the centre.';
  else reason = 'A quiet move; it was the best of the moves I considered.';
  return detail === 'beginner' ? `I played ${d.san}. ${reason}` : `${d.san}. ${reason}`;
}

/** Threats on the board right now against `color` (the player), stated as possibilities. Empty when there are none. */
export function threatText(fen: string, color: Color): string | null {
  const loose = loosePieces(fen, color);
  if (!loose.length) return null;
  const names = loose.slice(0, 2).map(looseText);
  const undefended = loose.slice(0, 2).every((l) => l.why === 'undefended');
  return `Your ${list(names)} can be captured${undefended ? ' and nothing defends ' + (names.length === 1 ? 'it' : 'them') : ''}. Check before you move.`;
}

/** What you left hanging by moving: pieces that become capturable only because of the move. */
export function newlyLoose(fenBefore: string, uci: string, color: Color): string[] {
  const after = new Position(fenBefore);
  const m = after.parseUci(uci);
  if (m === undefined) return [];
  after.makeMove(m);
  const before = new Set(loosePieces(fenBefore, color).map((l) => l.sq));
  const to = describeMove(fenBefore, uci)?.to;
  return loosePieces(after.toFen(), color).filter((l) => !before.has(l.sq) || l.sq === to).map(looseText);
}

export const WELCOME = {
  beginner: 'Hello. I am your Trainer for this game. I will speak up when I see a serious problem with a move before you play it, and tell you why I play my own moves. You can turn me off at any time.',
  concise: 'Trainer on. I will warn before serious blunders and explain my moves.',
};

export function resultText(result: '1-0' | '0-1' | '1/2-1/2', human: 'white' | 'black'): string {
  if (result === '1/2-1/2') return 'The game is drawn. Open the review to see where the balance shifted.';
  const won = (result === '1-0') === (human === 'white');
  return won ? 'You won. Open the review to see which of your moves mattered most.' : 'The game is over. Losing is how most improvement happens: open the review, and your clearest mistakes go into your Notebook.';
}
