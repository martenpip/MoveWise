import type { Chapter } from '../types';
import { ask, board, choice, demo, lesson, move, mq, read, reach, sq, tf } from './dsl';

/* Lone-piece boards keep the kings in far corners so they never get in the way. */
const marks = (...s: string[]) => s.map((x) => ({ sq: x, tone: 'hint' as const }));

const king = lesson(
  'the-king', 'The king', 'King', 7,
  ['Move the king one square in any direction', 'Know the king cannot step into danger', 'Know that the king can capture'],
  [
    read(['The king is the most important piece, but not a strong attacker. It moves one square in any direction: forwards, backwards, sideways or diagonally.', 'It captures in the same way, as long as the square is safe.'], board('k7/8/8/8/4K3/8/8/8 w - - 0 1', { marks: marks('e5', 'd5', 'f5', 'd4', 'f4', 'd3', 'e3', 'f3') }), 'One step, any direction'),
    reach('king-reach', 'Click every square the white king can move to.', 'k7/8/8/8/4K3/8/8/8 w - - 0 1', 'e4', ['The king goes one square in every direction.', 'There are eight squares around e4.'], 'A king in the middle of the board has eight possible moves, one in each direction.'),
    read(['A king may never move to a square that an enemy piece attacks. That would be moving into check, which is illegal.', 'Two kings can also never stand next to each other, because each would attack the other.']),
    reach('king-safe', 'The black rook on d8 attacks the whole d-file. Click every square the white king can move to.', '3r3k/8/8/8/4K3/8/8/8 w - - 0 1', 'e4', ['The rook attacks every square on the d-file.', 'Count the squares left once the d-file is removed.'], 'The king cannot enter the d-file because the rook attacks it. Five squares remain.'),
    move('king-capture', 'The black rook is undefended and next to your king. Capture it.', '7k/8/8/3r4/4K3/8/8/8 w - - 0 1', ['e4d5'], ['The king captures just like any other piece.', 'Move onto the rook’s square.'], 'The king can capture an undefended piece. Nothing guards d5, so it is safe.'),
  ],
  [
    choice('king-1', 'How far can a king move in one turn?', ['One square', 'Any number of squares', 'Two squares'], 0, 'One square in any direction (castling aside).'),
    tf('king-2', 'A king can move onto a square attacked by an enemy piece.', false, 'That would put the king in check, which is not allowed.'),
    choice('king-3', 'Why can two kings never stand next to each other?', ['They would capture each other', 'Each would attack the other’s square', 'It is allowed'], 1, 'A king may not move into attack, and two adjacent kings would attack each other.'),
  ],
  { concepts: ['piece.king'] },
);

const rook = lesson(
  'the-rook', 'The rook', 'Rook', 8,
  ['Move the rook along files and ranks', 'Know a rook cannot jump over pieces', 'Capture with the rook'],
  [
    read(['The rook moves in straight lines: forwards, backwards or sideways, as far as it likes, until something is in the way.', 'It cannot jump over other pieces.'], board('k7/8/8/8/3R4/8/8/7K w - - 0 1', { marks: marks('d1', 'd8', 'a4', 'h4') }), 'Straight lines'),
    reach('rook-reach', 'Click every square the white rook can reach.', 'k7/8/8/8/3R4/8/8/7K w - - 0 1', 'd4', ['It travels along the d-file and the fourth rank.', 'There are fourteen squares in total.'], 'On an open board a rook reaches 14 squares, wherever it stands.'),
    read(['A piece in the way blocks the rook. If it is your own piece, the rook stops before it. If it is an enemy piece, the rook may capture it, and stops there.']),
    reach('rook-blocked', 'Pawns block the rook. Click every square it can reach, including the capture.', 'k7/8/8/8/3Rp3/8/3P4/7K w - - 0 1', 'd4', ['Your own pawn on d2 stops the rook at d3.', 'The black pawn on e4 can be captured, but the rook cannot go past it.'], 'The rook stops in front of its own pawn, and may capture the enemy pawn but not go beyond it.'),
    move('rook-win', 'Capture the black knight with your rook. It is undefended.', '7k/8/8/8/R3n3/8/8/7K w - - 0 1', ['a4e4'], ['The rook travels along the fourth rank.'], 'The rook captures along the rank. The knight had no protection.'),
  ],
  [
    choice('rook-1', 'The rook moves…', ['Diagonally', 'Along ranks and files', 'In an L-shape'], 1, 'Rooks move in straight lines along ranks and files.'),
    tf('rook-2', 'A rook can jump over its own pawns.', false, 'Only knights jump. A rook is stopped by any piece in its way.'),
    sq('rook-3', 'The rook on a1 can capture one black piece. Click the square it captures on.', board('7k/8/8/8/n7/8/8/R6K w - - 0 1'), ['a4'], 'The rook travels up the a-file to a4 and takes the knight.'),
  ],
  { concepts: ['piece.rook'] },
);

const bishop = lesson(
  'the-bishop', 'The bishop', 'Bishop', 8,
  ['Move the bishop along diagonals', 'Know a bishop stays on one colour for the whole game', 'Capture with the bishop'],
  [
    read(['The bishop moves diagonally, as far as it likes, until something is in the way.', 'Each bishop stays on the same colour of square it started on. You get one light-squared and one dark-squared bishop.'], board('k7/8/8/8/3B4/8/8/7K w - - 0 1', { marks: marks('a1', 'h8', 'a7', 'g1') }), 'Diagonals'),
    reach('bishop-reach', 'Click every square the white bishop can reach.', 'k7/8/8/8/3B4/8/8/7K w - - 0 1', 'd4', ['Think of an X shape crossing d4.', 'Four diagonals, each ending at an edge.'], 'The bishop covers the two diagonals that cross d4: thirteen squares.'),
    ask('bishop-colour', 'The bishop on c1 is on a dark square. Can it ever reach d1?', ['Yes, after a few moves', 'No, never'], 1, ['Is d1 the same colour as c1?', 'A bishop never leaves its colour.'], 'd1 is a light square. The dark-squared bishop can never land there.', { board: board('7k/8/8/8/8/8/8/2B4K w - - 0 1') }),
    move('bishop-capture', 'Capture the black rook with your bishop. It is not defended.', '7k/8/8/3r4/8/8/B7/7K w - - 0 1', ['a2d5'], ['Follow the diagonal from a2.'], 'The bishop captures along the diagonal a2–d5. Nothing protects the rook.'),
  ],
  [
    choice('bishop-1', 'The bishop moves…', ['Diagonally', 'Along ranks and files', 'One square only'], 0, 'Bishops move along diagonals.'),
    tf('bishop-2', 'A bishop can change the colour of square it stands on.', false, 'A bishop always stays on squares of the same colour.'),
    sq('bishop-3', 'The white bishop on a2 can capture one black piece. Click it.', board('7k/8/8/3r4/8/8/B7/7K w - - 0 1'), ['d5'], 'The long diagonal a2–b3–c4–d5 leads to the rook.'),
  ],
  { concepts: ['piece.bishop'] },
);

const queen = lesson(
  'the-queen', 'The queen', 'Queen', 8,
  ['Move the queen like a rook and a bishop combined', 'Know she is the most powerful piece', 'Know why not to bring her out too early'],
  [
    read(['The queen moves any number of squares in a straight line, along a rank, a file or a diagonal. She is a rook and a bishop in one piece.', 'She is the strongest piece on the board.'], board('k7/8/8/8/3Q4/8/8/7K w - - 0 1', { marks: marks('d8', 'd1', 'a4', 'h4', 'a1', 'h8', 'a7', 'g1') }), 'Rook plus bishop'),
    reach('queen-captures', 'Click every black piece the queen can capture.', 'k7/3pn1p1/1p6/8/p2Q4/8/8/7K w - - 0 1', 'd4', ['A queen captures along files, ranks and diagonals.', 'The knight on e7 is not on any line from d4.', 'Four pieces are in reach.'], 'The queen takes d7 along the file, g7 along the diagonal, a4 along the rank and b6 along the other diagonal. The knight sits where she cannot reach.', { which: 'captures' }),
    read(['Because she is so valuable, the queen should not rush out early. Enemy knights and bishops can attack her, and she has to waste moves running away.', 'Develop the smaller pieces first.']),
    ask('queen-trap', 'The white queen is attacked by a pawn. What should you do?', ['Ignore it', 'Move her to safety', 'Capture the pawn with her'], 2, ['Can the queen capture the pawn?', 'Look at whether the pawn is protected.'], 'The pawn is unprotected, so the queen can simply capture it. If it had been protected she would have needed to run away.', { board: board('7k/8/8/8/3p4/4Q3/8/7K w - - 0 1'), wrong: { 1: 'Running is safe, but there is a better move: capture the unprotected pawn.', 0: 'A pawn would win the queen for almost nothing.' } }),
  ],
  [
    choice('queen-1', 'The queen moves like…', ['A rook and a bishop together', 'A knight', 'A king that can move twice'], 0, 'She combines the rook’s straight lines and the bishop’s diagonals.'),
    tf('queen-2', 'Bringing the queen out early is usually a good idea.', false, 'She can be chased by smaller pieces, so develop knights and bishops first.'),
    sq('queen-3', 'The white queen on d1 attacks one black piece. Click it.', board('4k3/8/8/8/8/3b4/8/3QK3 w - - 0 1'), ['d3'], 'The queen on d1 attacks up the d-file and captures the bishop on d3.'),
  ],
  { concepts: ['piece.queen'] },
);

const knight = lesson(
  'the-knight', 'The knight', 'Knight', 9,
  ['Move the knight in its L-shape', 'Know that the knight jumps over pieces', 'Use the knight to capture'],
  [
    read(['The knight moves in an L: two squares in one direction, then one square at a right angle. Or one square, then two.', 'It is the only piece that can jump over others.'], board('k7/8/8/8/3N4/8/8/7K w - - 0 1', { marks: marks('b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5'), arrows: [{ from: 'd4', to: 'e6', tone: 'info' }] }), 'The L-shape'),
    reach('knight-reach', 'Click every square the white knight can move to.', 'k7/8/8/8/3N4/8/8/7K w - - 0 1', 'd4', ['Two squares one way, one square the other way.', 'A knight in the middle has eight moves.'], 'Eight squares: b3, b5, c2, c6, e2, e6, f3 and f5.'),
    reach('knight-start', 'In the starting position the knight on b1 is surrounded. Where can it go?', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'b1', ['Knights jump over the pawns.', 'One of the L-squares is occupied by your own pawn.'], 'The knight leaps over its own pawns to a3 or c3. d2 is occupied by its own pawn.'),
    read(['A knight is strongest in the middle, where it reaches the most squares. On the edge it has fewer moves. A knight in the corner has just two.', 'Remember: “a knight on the rim is dim”.']),
    move('knight-capture', 'The black queen is undefended. Capture it with your knight.', 'k7/8/4q3/8/3N4/8/8/7K w - - 0 1', ['d4e6'], ['The knight attacks the queen with its L-shape.', 'Count two squares up and one across.'], 'The knight jumped to e6 and won a queen for free.'),
  ],
  [
    choice('knight-1', 'How does a knight move?', ['In an L-shape', 'Diagonally', 'One square at a time'], 0, 'Two squares one way and one at a right angle.'),
    tf('knight-2', 'A knight can jump over other pieces.', true, 'It is the only piece that can.'),
    choice('knight-3', 'How many squares can a knight in the middle of the board reach?', ['4', '8', '14'], 1, 'Eight, one in each L-shaped direction.'),
  ],
  { concepts: ['piece.knight'] },
);

const pawn = lesson(
  'the-pawn', 'The pawn', 'Pawn', 10,
  ['Move pawns forward, one or two squares from the start', 'Capture diagonally', 'Know that pawns never move backwards'],
  [
    read(['Pawns move straight forward, one square at a time. From their starting square they may move two squares.', 'They can never move backwards, and they cannot move forward onto an occupied square.'], board('k7/8/8/8/8/8/4P3/7K w - - 0 1', { marks: marks('e3', 'e4') }), 'Forward, never back'),
    reach('pawn-start', 'Click every square the pawn on e2 can move to.', 'k7/8/8/8/8/8/4P3/7K w - - 0 1', 'e2', ['One step forward, or two steps from the start.'], 'From its starting square a pawn can go one or two squares forward.'),
    read(['Pawns capture differently from how they move: one square diagonally forward. They cannot capture a piece straight in front of them.'], board('k7/8/8/3p1p2/4P3/8/8/7K w - - 0 1', { arrows: [{ from: 'e4', to: 'd5', tone: 'best' }, { from: 'e4', to: 'f5', tone: 'best' }] }), 'Capturing'),
    reach('pawn-captures', 'Click every square where the white pawn can capture.', 'k7/8/8/3p1p2/4P3/8/8/7K w - - 0 1', 'e4', ['Captures go diagonally forward.', 'Two black pawns stand on the right squares.'], 'The pawn on e4 attacks d5 and f5. It moves straight to e5, but it captures only diagonally.', { which: 'captures' }),
    ask('pawn-blocked', 'The black pawn is directly in front of your pawn. What can the white pawn do?', ['Capture it', 'Nothing: it is blocked', 'Jump over it'], 1, ['Pawns capture diagonally, not straight ahead.'], 'Two pawns facing each other block one another. Neither can move forward or capture.', { board: board('k7/8/8/4p3/4P3/8/8/7K w - - 0 1'), wrong: { 0: 'Pawns only capture diagonally.', 2: 'Only knights jump.' } }),
    move('pawn-take', 'Capture the black knight with your pawn.', 'k7/8/8/8/3n4/4P3/8/7K w - - 0 1', ['e3d4'], ['The knight is diagonally in front of your pawn.'], 'A pawn captures one square diagonally forward. Taking a knight with a pawn wins material.'),
  ],
  [
    choice('pawn-1', 'How does a pawn capture?', ['Straight ahead', 'One square diagonally forward', 'Sideways'], 1, 'Pawns capture diagonally forward.'),
    tf('pawn-2', 'A pawn can move backwards if it is in danger.', false, 'Pawns only ever move forward.'),
    choice('pawn-3', 'How far can a pawn move on its first move?', ['One or two squares', 'Only one square', 'Any number of squares'], 0, 'From its starting square, one or two squares.'),
  ],
  { concepts: ['piece.pawn'] },
);

const together = lesson(
  'pieces-together', 'Piece values and teamwork', 'Piece values', 9,
  ['Know the usual value of each piece', 'Choose the more valuable capture', 'See why pieces are stronger together'],
  [
    read(['Pieces are worth different amounts. Pawn 1, knight 3, bishop 3, rook 5, queen 9. The king cannot be traded, so it has no value.', 'These numbers help you decide whether a trade is good.'], undefined, 'Piece values'),
    move('value-pick', 'Two black pieces are undefended. Which capture wins more?', 'k7/8/8/6q1/8/p7/8/2B4K w - - 0 1', ['c1g5'], ['Compare a pawn (1) with a queen (9).', 'The bishop attacks both along different diagonals.'], 'The queen is worth nine pawns. Always check what is worth most.', { wrong: { c1a3: 'That wins a pawn, but the queen was the better target.' } }),
    read(['A single piece is rarely enough to checkmate. They work best together. In this example, two rooks control two ranks at once. One keeps the king boxed in, the other gives the final check.']),
    demo('Teamwork: the two-rook ladder', board('7k/R7/1R6/8/8/8/8/4K3 w - - 0 1'), [
      { uci: 'b6b8', say: 'The rook on a7 stops the king moving along the seventh rank, and the rook on b8 gives check along the eighth. The king has no escape: checkmate.', arrows: [{ from: 'b8', to: 'h8', tone: 'best' }, { from: 'a7', to: 'h7', tone: 'info' }] },
    ], 'Black’s king is stuck on the edge. Look at what each rook does.'),
    move('team-mate', 'Now you try. Find the move that gives checkmate.', '7k/R7/1R6/8/8/8/8/4K3 w - - 0 1', ['b6b8'], ['One rook covers a rank. Use the other to give check on the last rank.'], 'Any rook move to the eighth rank that keeps the other rook on the seventh is checkmate.', { anyMate: true }),
  ],
  [
    choice('pv-1', 'Which piece is worth the most?', ['Rook', 'Queen', 'Bishop'], 1, 'The queen is worth about nine pawns.'),
    choice('pv-2', 'How many pawns is a rook usually worth?', ['3', '5', '9'], 1, 'A rook is worth about five pawns.'),
    tf('pv-3', 'A bishop and a knight are worth about the same.', true, 'Both are usually counted as three pawns.'),
    mq('pv-4', 'Win the most material: capture the more valuable undefended piece.', 'k7/8/8/6q1/8/p7/8/2B4K w - - 0 1', ['c1g5'], 'The queen is worth much more than a pawn.'),
  ],
  { concepts: ['piece.values', 'piece.teamwork'] },
);

export const piecesChapter: Chapter = {
  id: 'beginner-pieces', title: 'Learn the pieces', blurb: 'How every piece moves, captures and works with the others.',
  lessons: [king, rook, bishop, queen, knight, pawn, together],
  check: [
    choice('pc-1', 'Which piece can jump over others?', ['Rook', 'Knight', 'Bishop'], 1, 'Only the knight jumps.', { lesson: 'the-knight' }),
    choice('pc-2', 'Which piece captures differently from how it moves?', ['Pawn', 'Rook', 'Queen'], 0, 'Pawns move straight but capture diagonally.', { lesson: 'the-pawn' }),
    mq('pc-3', 'Capture the undefended queen with your knight.', 'k7/8/4q3/8/3N4/8/8/7K w - - 0 1', ['d4e6'], 'The knight leaps to e6.', { lesson: 'the-knight' }),
    mq('pc-4', 'Capture the black rook with your bishop.', '7k/8/8/3r4/8/8/B7/7K w - - 0 1', ['a2d5'], 'Diagonal capture along a2–d5.', { lesson: 'the-bishop' }),
    tf('pc-5', 'A bishop on a light square can move to a dark square.', false, 'It stays on its own colour.', { lesson: 'the-bishop' }),
    choice('pc-6', 'What is the usual value of a rook?', ['3', '5', '9'], 1, 'A rook is worth about five pawns.', { lesson: 'pieces-together' }),
    sq('pc-7', 'The rook on a1 can take one piece. Where?', board('7k/8/8/8/n7/8/8/R6K w - - 0 1'), ['a4'], 'Up the a-file.', { lesson: 'the-rook' }),
  ],
};
