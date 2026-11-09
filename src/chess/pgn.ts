import { Game } from './game';
import { START_FEN, type GameResult } from './types';

export interface PgnHeaders {
  [key: string]: string;
}

export interface ParsedPgn {
  headers: PgnHeaders;
  game: Game;
  result: GameResult;
}

const RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

const escapeHeader = (v: string): string => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/** Serialise a game to PGN (seven-tag roster first, then any extras). */
export function toPgn(game: Game, headers: PgnHeaders = {}, result?: GameResult): string {
  const status = game.status();
  const res: GameResult = result ?? (status.over ? status.result : '*');
  const date = new Date();
  const defaults: PgnHeaders = {
    Event: 'MoveWise game',
    Site: 'MoveWise (offline)',
    Date: `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`,
    Round: '-',
    White: 'White',
    Black: 'Black',
  };
  const merged: PgnHeaders = { ...defaults, ...headers, Result: res };
  const order = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'];
  const lines: string[] = [];
  for (const k of order) lines.push(`[${k} "${escapeHeader(merged[k] ?? '?')}"]`);
  for (const [k, v] of Object.entries(merged)) {
    if (!order.includes(k)) lines.push(`[${k} "${escapeHeader(v)}"]`);
  }
  if (game.startFen.split(' ').slice(0, 4).join(' ') !== START_FEN.split(' ').slice(0, 4).join(' ')) {
    lines.push('[SetUp "1"]', `[FEN "${game.startFen}"]`);
  }
  const movetext = [...game.sanTokens(), res].join(' ');
  return `${lines.join('\n')}\n\n${wrap(movetext, 80)}\n`;
}

function wrap(text: string, width: number): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && cur.length + 1 + w.length > width) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines.join('\n');
}

/**
 * Parse the first game in a PGN string. Comments, NAGs and variations are skipped.
 * Throws with a readable message at the first illegal move.
 */
export function parsePgn(text: string): ParsedPgn {
  const headers: PgnHeaders = {};
  const headerRe = /^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(text))) headers[m[1]!] = m[2]!.replace(/\\(["\\])/g, '$1');

  let body = text.replace(headerRe, '');
  // Stop at a second game, if any.
  body = body.replace(/\r/g, '');
  body = body.replace(/\{[^}]*\}/g, ' '); // brace comments
  body = body.replace(/;[^\n]*/g, ' '); // line comments
  let prev: string;
  do {
    prev = body;
    body = body.replace(/\([^()]*\)/g, ' '); // variations (innermost first)
  } while (body !== prev);
  body = body.replace(/\$\d+/g, ' ');

  const game = new Game(headers.FEN && headers.SetUp !== '0' ? headers.FEN : START_FEN);
  let result: GameResult = '*';
  const tokens = body.split(/\s+/).filter(Boolean);
  for (const raw of tokens) {
    if (RESULTS.has(raw)) {
      result = raw as GameResult;
      break;
    }
    const tok = raw.replace(/^\d+\.(\.\.)?/, '');
    if (!tok) continue;
    try {
      game.playSan(tok);
    } catch {
      throw new Error(`Could not read move "${tok}" after ${game.ply} plies`);
    }
  }
  if (result === '*' && headers.Result && RESULTS.has(headers.Result)) {
    result = headers.Result as GameResult;
  }
  if (game.ply === 0 && !tokens.length) throw new Error('No moves found in PGN');
  return { headers, game, result };
}
