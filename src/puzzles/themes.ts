/**
 * The tactical themes MoveWise knows, keyed by the Lichess theme names that the puzzle data carries.
 *
 * Honesty note: these labels are assigned by Lichess's own tagging, not by MoveWise. MoveWise validates the moves and (for
 * mates) the mate length itself; it does not re-derive every motif. A hint or explanation that names a motif says "tagged
 * as" or builds on the tag, and everything else in a hint comes from the solution moves themselves.
 */
export interface ThemeInfo {
  id: string;
  label: string;
  group: 'tactic' | 'mate' | 'pattern' | 'endgame' | 'defence';
  /** Hint 1: a general direction that does not name the motif. */
  direction: string;
  /** Hint 2: names the motif. */
  motif: string;
  /** One plain sentence about the idea, for explanations. */
  idea: string;
}

const T = (id: string, label: string, group: ThemeInfo['group'], direction: string, motif: string, idea: string): ThemeInfo => ({ id, label, group, direction, motif, idea });

export const THEMES: ThemeInfo[] = [
  T('fork', 'Fork', 'tactic', 'Look for a single move that creates two threats at once.', 'One piece may be able to attack two valuable targets at the same time: a fork.', 'A fork attacks two or more targets with one piece, and the opponent can only deal with one.'),
  T('pin', 'Pin', 'tactic', 'Look for a piece that cannot move without exposing something more valuable behind it.', 'A pin: an enemy piece is stuck in front of a more valuable one on the same line.', 'A pinned piece cannot move without exposing something more valuable (or illegal to move at all), so it can be attacked and won.'),
  T('skewer', 'Skewer', 'tactic', 'Look for a line where a valuable piece must move and leaves something behind it.', 'A skewer: attack the more valuable piece so that it has to move, then win what stood behind it.', 'A skewer attacks a valuable piece that must step aside, exposing a piece behind it on the same line.'),
  T('discoveredAttack', 'Discovered attack', 'tactic', 'Think about which of your pieces is standing in the way of another one.', 'A discovered attack: move one piece away and let the piece behind it attack, ideally while the moved piece makes its own threat.', 'Moving a piece uncovers an attack from another piece, so two things are threatened at once.'),
  T('doubleCheck', 'Double check', 'tactic', 'Look for a move that gives check in two ways at once.', 'A double check: two pieces give check at the same time, so the king must move.', 'A double check cannot be blocked or captured, so the king has to move.'),
  T('deflection', 'Deflection', 'tactic', 'Ask which enemy piece is overloaded or guarding something important.', 'Deflection: force a defender away from the job it is doing.', 'Deflection forces a defending piece away from the square or piece it protects.'),
  T('attraction', 'Attraction / decoy', 'tactic', 'Look at where an enemy piece could be lured to.', 'Attraction (a decoy): drag a piece, often the king, to a square where it can be attacked.', 'A decoy pulls an enemy piece onto a bad square, usually with a sacrifice.'),
  T('capturingDefender', 'Removing the defender', 'tactic', 'Ask what is holding the enemy position together.', 'Remove the defender: take or chase away the piece that protects a target.', 'If a defender is removed, whatever it protected can be taken.'),
  T('backRankMate', 'Back-rank mate', 'mate', 'Look at the enemy king’s escape squares.', 'A back-rank mate: the king is trapped by its own pawns on the last rank.', 'A king hemmed in by its own pawns on the back rank can be mated by a rook or queen.'),
  T('intermezzo', 'In-between move', 'tactic', 'Before the obvious recapture, is there a stronger move to insert first?', 'An in-between move (zwischenzug): a forcing move played before the expected one.', 'An in-between move changes the position with a threat before the expected exchange continues.'),
  T('interference', 'Interference', 'tactic', 'Look at the lines connecting enemy pieces.', 'Interference: put a piece between two enemy pieces that defend each other.', 'Interference cuts the line between two enemy pieces, breaking their coordination.'),
  T('clearance', 'Clearance', 'tactic', 'Is one of your own pieces blocking something useful?', 'Clearance: move a piece away (often with a threat) to free a square or line for another piece.', 'A clearance move frees a square or line, usually with tempo.'),
  T('sacrifice', 'Sacrifice', 'tactic', 'Be willing to give something up if it forces more in return.', 'A sacrifice: give up material to open the position or force a result.', 'A sacrifice gives up material for a bigger gain such as mate or a decisive material win.'),
  T('quietMove', 'Quiet move', 'tactic', 'The best move may not be a check or a capture.', 'A quiet move: a calm move that creates an unstoppable threat.', 'A quiet move is not a check or capture, yet it leaves the opponent without a good defence.'),
  T('hangingPiece', 'Loose piece', 'tactic', 'Check whether anything is left undefended.', 'A hanging (loose) piece: something is attacked and not protected enough.', 'A piece that is not protected enough can simply be captured.'),
  T('trappedPiece', 'Trapped piece', 'tactic', 'Look for an enemy piece with nowhere safe to go.', 'A trapped piece: it is attacked and every square it could flee to is covered.', 'A trapped piece cannot escape capture.'),
  T('xRayAttack', 'X-ray', 'tactic', 'Look at what lies behind the pieces on a line.', 'An x-ray: a piece attacks or defends through another piece.', 'An x-ray lets a piece exert force through an enemy piece along the same line.'),
  T('zugzwang', 'Zugzwang', 'tactic', 'Sometimes the problem for the opponent is that they must move.', 'Zugzwang: every move the opponent has makes their position worse.', 'In zugzwang the obligation to move is itself the problem.'),
  T('exposedKing', 'Exposed king', 'tactic', 'Look for an opportunity involving the opponent’s exposed king.', 'The enemy king is short of cover: checks and attacks near it are strong.', 'An exposed king gives the attacker forcing moves.'),
  T('kingsideAttack', 'Attack on the kingside', 'tactic', 'Look at the side of the board where the enemy king lives.', 'An attack against a king on the kingside.', 'The attacker uses pieces near the king to create threats.'),
  T('queensideAttack', 'Attack on the queenside', 'tactic', 'Look at the side of the board where the enemy king lives.', 'An attack against a king on the queenside.', 'The attacker uses pieces near the king to create threats.'),
  T('attackingF2F7', 'Attack on f2 / f7', 'tactic', 'Look at the weakest squares near the king.', 'The f2 or f7 pawn, defended only by the king, is the target.', 'The pawn next to the king on its starting square is a classic weak point.'),
  T('advancedPawn', 'Advanced pawn', 'tactic', 'Think about a pawn that is close to promotion.', 'An advanced pawn: a pawn far up the board creates threats of its own.', 'A pawn close to promotion ties down the opponent’s pieces.'),
  T('promotion', 'Promotion', 'tactic', 'Look at what happens if a pawn reaches the last rank.', 'Promotion: turning a pawn into a new piece decides the position.', 'Promoting a pawn can win material or deliver mate.'),
  T('underPromotion', 'Under-promotion', 'tactic', 'The strongest new piece is not always a queen.', 'Under-promotion: promote to a knight, bishop or rook for a specific reason.', 'Sometimes a knight, bishop or rook is better than a queen (for example to give check or avoid stalemate).'),
  T('enPassant', 'En passant', 'tactic', 'Think about a special pawn capture.', 'En passant: a pawn captures a pawn that has just moved two squares.', 'The en passant capture can be the key to the tactic.'),
  T('castling', 'Castling', 'tactic', 'Think about the king and rook moving together.', 'Castling is part of the solution.', 'Castling both moves the king to safety and activates a rook.'),
  T('defensiveMove', 'Defence', 'defence', 'You are under pressure: find the one move that holds.', 'A defensive move: the task is to stop a threat, often with the only move.', 'A defensive tactic finds the move (or small set of moves) that keeps the position together.'),
  T('equality', 'Escape to equality', 'defence', 'You are worse. Look for a way to save the game.', 'A save: the best result available is a draw or equal position.', 'Sometimes the best a position offers is equality, and finding it is the tactic.'),
  T('mateIn1', 'Mate in 1', 'mate', 'Look at the checks. One of them may end the game.', 'Mate in one: a single move gives checkmate.', 'Mate in one: the king is attacked and has no escape, block or capture.'),
  T('mateIn2', 'Mate in 2', 'mate', 'Forcing moves first: checks, then threats.', 'Mate in two: a forcing first move, then checkmate whatever the opponent replies.', 'Mate in two: the first move leaves checkmate unstoppable next turn.'),
  T('mateIn3', 'Mate in 3', 'mate', 'Forcing moves first: checks, then threats.', 'Mate in three: a forced sequence of three of your moves.', 'Mate in three needs you to keep every reply under control.'),
  T('mateIn4', 'Mate in 4', 'mate', 'Forcing moves first: checks, then threats.', 'Mate in four: a longer forced sequence.', 'Mate in four rewards calculating every defence.'),
  T('mateIn5', 'Mate in 5', 'mate', 'Forcing moves first: checks, then threats.', 'Mate in five: a long forced sequence.', 'Mate in five is a long forced sequence; calculate checks first.'),
  T('mate', 'Checkmate', 'mate', 'The enemy king is in real danger. Look at forcing moves.', 'The solution ends in checkmate.', 'The solution ends with the opponent checkmated.'),
  T('smotheredMate', 'Smothered mate', 'pattern', 'The enemy king is surrounded by its own pieces.', 'A smothered mate: a knight checks a king that its own pieces have boxed in.', 'A knight gives mate to a king surrounded by its own pieces.'),
  T('anastasiaMate', 'Anastasia’s mate', 'pattern', 'Look at a king on the edge of the board.', 'Anastasia’s mate: a knight and a rook (or queen) trap a king at the edge.', 'A knight covers the escape squares while a rook or queen delivers mate along the edge.'),
  T('arabianMate', 'Arabian mate', 'pattern', 'Look at a king in the corner.', 'Arabian mate: a rook and a knight mate a king in the corner.', 'A rook and a knight combine to mate a king in the corner.'),
  T('hookMate', 'Hook mate', 'pattern', 'Look at a king with a rook next to it.', 'Hook mate: a rook, a knight and a pawn combine to mate.', 'A rook delivers mate with a knight and a pawn covering the escape squares.'),
  T('dovetailMate', 'Dovetail mate', 'pattern', 'Look at a king that is attacked diagonally.', 'Dovetail mate: a queen mates a king whose escape squares are blocked by its own pieces.', 'A queen checks a king whose neighbouring squares are covered or blocked.'),
  T('bodenMate', 'Boden’s mate', 'pattern', 'Look at two bishops and a king hemmed in on the queenside.', 'Boden’s mate: two bishops on crossing diagonals deliver mate.', 'Two bishops mate a king blocked by its own pieces.'),
  T('doubleBishopMate', 'Double-bishop mate', 'pattern', 'Look at the long diagonals and the bishops.', 'Two bishops cooperate to deliver mate.', 'Two bishops combine to mate.'),
  T('endgame', 'Endgame tactic', 'endgame', 'There are few pieces left, so every move counts.', 'An endgame tactic: precise calculation with few pieces on the board.', 'In endgames, accurate calculation of forcing lines decides the result.'),
  T('pawnEndgame', 'Pawn endgame', 'endgame', 'Count moves for the pawns and the kings.', 'A pawn endgame: only kings and pawns remain.', 'Pawn endgames are decided by counting and by opposition.'),
  T('rookEndgame', 'Rook endgame', 'endgame', 'Think about rook activity and pawns.', 'A rook endgame.', 'Rook endgames are about activity and precise calculation.'),
  T('bishopEndgame', 'Bishop endgame', 'endgame', 'Think about bishop colour and pawns.', 'A bishop endgame.', 'Bishop endgames depend on square colours and pawn placement.'),
  T('knightEndgame', 'Knight endgame', 'endgame', 'Think about knight routes and pawns.', 'A knight endgame.', 'Knight endgames depend on routes and tempo.'),
  T('queenEndgame', 'Queen endgame', 'endgame', 'Perpetual check and passed pawns matter.', 'A queen endgame.', 'Queen endgames often turn on checks and passed pawns.'),
  T('queenRookEndgame', 'Queen and rook endgame', 'endgame', 'Heavy pieces: look at the king and the checks.', 'A queen and rook endgame.', 'With heavy pieces the safety of the king decides.'),
];

const BY_ID = new Map(THEMES.map((t) => [t.id, t]));
export const themeInfo = (id: string): ThemeInfo | undefined => BY_ID.get(id);
export const themeLabel = (id: string): string => BY_ID.get(id)?.label ?? id;

/** Theme keys kept in packs (others, like "short" or "crushing", say nothing about the idea). */
export const KEPT_THEMES = new Set<string>([...THEMES.map((t) => t.id), 'middlegame', 'opening']);

/**
 * Themes used to describe, hint and track a puzzle, most specific first. A puzzle's "primary" theme is the first of these
 * it carries. Mate patterns and named tactics come before the generic "mate in N", which comes before phases.
 */
const PRIORITY = [
  'smotheredMate', 'anastasiaMate', 'arabianMate', 'hookMate', 'dovetailMate', 'bodenMate', 'doubleBishopMate', 'backRankMate',
  'doubleCheck', 'fork', 'pin', 'skewer', 'discoveredAttack', 'deflection', 'attraction', 'capturingDefender', 'intermezzo',
  'interference', 'clearance', 'trappedPiece', 'xRayAttack', 'zugzwang', 'underPromotion', 'enPassant', 'castling',
  'hangingPiece', 'quietMove', 'sacrifice', 'defensiveMove', 'equality', 'attackingF2F7', 'exposedKing',
  'mateIn1', 'mateIn2', 'mateIn3', 'mateIn4', 'mateIn5', 'mate',
  'promotion', 'advancedPawn', 'kingsideAttack', 'queensideAttack',
  'pawnEndgame', 'rookEndgame', 'bishopEndgame', 'knightEndgame', 'queenRookEndgame', 'queenEndgame', 'endgame',
];

/** The idea a puzzle is mainly about (the key of a THEMES entry), or null if it carries no known theme. */
export function primaryTheme(themes: readonly string[]): string | null {
  const set = new Set(themes);
  return PRIORITY.find((t) => set.has(t)) ?? null;
}

/** Themes that count for per-theme training statistics: everything except the broad "mate in N" length labels and phases. */
export const TRACKED = new Set<string>(THEMES.filter((t) => !/^mateIn\d$/.test(t.id)).map((t) => t.id));
