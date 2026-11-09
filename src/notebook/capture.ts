/**
 * Turning a reviewed game into Notebook entries.
 *
 * Automatic saving is deliberately selective. A move qualifies only when ALL of these hold:
 *  - it was the player's own move, and a decision (not forced), with an engine move to compare against;
 *  - it gave up at least MISTAKE_AT points of win chance (a mistake or a blunder; inaccuracies are never saved automatically);
 *  - the position was not already lost before the move (so there was something to save) and the player was not still clearly
 *    winning afterwards (so it did not change the result of the game).
 * At most MAX_AUTO_PER_GAME are kept per game, worst first. Anything else can still be saved by hand.
 */
import type { PlyAnalysis, ReviewAnalysis } from '../review/analyse';
import { explainPly } from '../review/explain';
import { formatLine, buildLine } from '../review/facts';
import { forSide } from '../review/score';
import { MISTAKE_AT } from '../review/score';
import type { Side } from '../review/types';
import { Position } from '../chess/position';
import { toLearningItemLike } from './items';
import { newSchedule } from './srs';
import type { MistakeKind, NotebookEntry, Occurrence, Severity } from './types';

export const MAX_AUTO_PER_GAME = 5;
export const LOST_BEFORE = 10;
export const STILL_WINNING_AFTER = 90;

export const fen4 = (fen: string): string => fen.split(' ').slice(0, 4).join(' ');
export const entryIdFor = (fen: string): string => `nb:${fen4(fen)}`;

export interface GameInfo {
  gameId: string;
  /** Display names of both players, for the origin label. */
  white: string;
  black: string;
  playedAt: number | null;
}

export function qualifies(p: PlyAnalysis, perspective: Side): boolean {
  if (p.color !== perspective || p.forced || !p.best) return false;
  if (p.matchedEngine || p.winLoss < MISTAKE_AT) return false;
  if (p.winBefore < LOST_BEFORE) return false;
  if (p.winAfter > STILL_WINNING_AFTER) return false;
  return true;
}

function kindOf(p: PlyAnalysis): MistakeKind {
  if (p.tags.includes('missed-mate')) return 'missed-mate';
  if (p.tags.includes('allowed-mate')) return 'allowed-mate';
  if (p.tags.includes('hung-piece')) return 'hung-piece';
  if (p.tags.includes('missed-capture')) return 'missed-tactic';
  if (p.cls === 'blunder') return 'blunder';
  if (p.cls === 'mistake') return 'mistake';
  return 'inaccuracy';
}

function severityOf(p: PlyAnalysis): Severity {
  return p.cls === 'blunder' ? 'blunder' : p.cls === 'mistake' ? 'mistake' : 'inaccuracy';
}

/** One entry from one analysed move, or null when it cannot be practised (no engine move, or the data does not replay). */
export function entryFromPly(analysis: ReviewAnalysis, p: PlyAnalysis, game: GameInfo, now: number, manual = false): NotebookEntry | null {
  if (!p.best) return null;
  const side = p.color;
  const item = toLearningItemLike(analysis, p);
  if (!item) return null;
  try {
    new Position(p.fenBefore);
  } catch {
    return null;
  }
  const explanation = explainPly(p, 'beginner', analysis, analysis.perspective);
  const text = [explanation.headline + '.', ...explanation.paragraphs.slice(0, 2)].join(' ');
  const line = buildLine(p.fenBefore, p.bestLine.uci.length ? p.bestLine.uci : [p.best.uci], 6);
  const kind = manual ? 'manual' : kindOf(p);
  const opponent = side === 'white' ? game.black : game.white;
  const occ: Occurrence = { gameId: game.gameId, ply: p.ply, uci: p.uci, at: now };
  const fullmove = Number(p.fenBefore.split(' ')[5]) || Math.ceil(p.ply / 2);
  return {
    id: entryIdFor(p.fenBefore),
    fen: p.fenBefore,
    sideToMove: side,
    moveNumber: fullmove,
    previous: item.previous,
    played: { uci: p.uci, san: p.san },
    best: { uci: p.best.uci, san: p.best.san, line: p.bestLine.uci.length ? p.bestLine.uci : [p.best.uci], lineSan: formatLine(line, 6) },
    alternatives: [],
    evalBefore: Math.round(forSide(p.before.cp, side)),
    evalAfter: Math.round(forSide(p.after.cp, side)),
    winLoss: Math.round(p.winLoss * 10) / 10,
    cpLoss: Math.round(p.cpLoss),
    severity: manual && p.winLoss < 5 ? 'manual' : severityOf(p),
    kind,
    explanation: text,
    themes: item.themes,
    tags: [...p.tags],
    phase: p.phase,
    origin: { gameId: game.gameId, ply: p.ply, label: `${game.white} vs ${game.black}, move ${fullmove}`, opponent, playedAt: game.playedAt },
    occurrences: [occ],
    engine: analysis.engines[p.before.e] ?? 'Unknown engine',
    savedAt: now,
    updatedAt: now,
    srs: newSchedule(now),
  };
}

/** The entries that qualify for automatic saving from a finished review, worst first. */
export function autoEntries(analysis: ReviewAnalysis, game: GameInfo, now: number): NotebookEntry[] {
  const side = analysis.perspective;
  if (!side) return [];
  const out: NotebookEntry[] = [];
  for (const p of [...analysis.plies].sort((a, b) => b.winLoss - a.winLoss)) {
    if (out.length >= MAX_AUTO_PER_GAME) break;
    if (!qualifies(p, side)) continue;
    const e = entryFromPly(analysis, p, game, now);
    if (e) out.push(e);
  }
  return out;
}

/**
 * Merge a newly found entry into the one already stored for the same position.
 * The stored entry keeps its schedule and its answer; the new occurrence is added to its history. If it happened again in a
 * DIFFERENT game, the position is scheduled for review again, because the lesson clearly did not stick yet.
 */
export function mergeEntry(existing: NotebookEntry, incoming: NotebookEntry, now: number): NotebookEntry {
  const inc = incoming.occurrences[0]!;
  const seen = existing.occurrences.some((o) => o.gameId === inc.gameId && o.ply === inc.ply);
  if (seen) return existing;
  const newGame = !existing.occurrences.some((o) => o.gameId === inc.gameId);
  const srs = newGame && existing.srs.attempts > 0 ? { ...existing.srs, lapses: existing.srs.lapses + 1, reps: 0, lastGrade: 'failed' as const, intervalDays: 0, due: now } : existing.srs;
  const stronger = (incoming.winLoss ?? 0) > (existing.winLoss ?? 0);
  return {
    ...existing,
    occurrences: [...existing.occurrences, inc],
    // The worst version of the slip decides how serious the entry is shown to be.
    severity: stronger ? incoming.severity : existing.severity,
    winLoss: stronger ? incoming.winLoss : existing.winLoss,
    cpLoss: stronger ? incoming.cpLoss : existing.cpLoss,
    srs,
    updatedAt: now,
  };
}
