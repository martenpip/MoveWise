/** Which sound a chess move deserves. Reads the rules engine's own move information, never the screen or the notation. */
import type { MoveInfo, PlayedMove } from '../chess/game';
import type { SoundKind, SoundPrefs } from './kinds';

/** One sound per move. The most important thing that happened wins, so a single action never plays several sounds. */
export function soundForMove(info: MoveInfo): SoundKind {
  if (info.checkmate) return 'checkmate';
  if (info.check) return 'check';
  if (info.promotion) return 'promotion';
  if (info.castle) return 'castle';
  if (info.capture) return 'capture';
  return 'move';
}

/**
 * Sound for moving through a game that already exists (replay, analysis, move list).
 *  - Only a single step forward is a "move"; jumping (first/last, clicking a move far away, loading a game) is silent,
 *    so opening a saved game or scrubbing never produces a burst of sounds.
 *  - Stepping back is silent unless the player turned that on.
 * `moves` is the full move list; `from` and `to` are plies (0 = start position).
 */
export function replaySound(moves: readonly PlayedMove[], from: number, to: number, prefs: Pick<SoundPrefs, 'replay' | 'undo'>): SoundKind | null {
  if (to === from) return null;
  if (to === from + 1) {
    if (!prefs.replay) return null;
    const m = moves[to - 1];
    return m ? soundForMove(m.info) : null;
  }
  if (to === from - 1) {
    if (!prefs.undo) return null;
    const m = moves[from - 1];
    return m ? (m.info.capture ? 'capture' : 'move') : null;
  }
  return null;
}
