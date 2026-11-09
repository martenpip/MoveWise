import type { Chapter } from '../types';
import { ask, board, choice, demo, lesson, move, mq, read, square, tf } from './dsl';

const capturing = lesson(
  'capturing', 'Capturing and protection', 'Captures', 9,
  ['Capture by moving onto an enemy piece', 'Check whether a piece is protected before taking it', 'Avoid trading a big piece for a small one'],
  [
    read(['To capture, move your piece onto a square occupied by an enemy piece. The enemy piece is removed from the board.', 'Capturing is never compulsory in chess: you can choose a different move.']),
    read(['Before you capture, ask: can the enemy take back? A piece that another piece can recapture on is called protected (or defended). An unprotected piece is free to take.']),
    move('free-capture', 'Two black pieces are in range of your queen. Capture the one that is not protected.', '4k3/8/4p3/3p3n/8/8/8/3QK3 w - - 0 1', ['d1h5'], ['The pawn on d5 is guarded by the pawn on e6.', 'Look at the knight on h5: does anything guard it?'], 'The knight on h5 was alone, so the queen takes it for free. The pawn on d5 is protected: taking it with the queen would lose her to exd5.', { wrong: { d1d5: 'That pawn is protected by the pawn on e6. After exd5 you would have lost your queen for a pawn.' } }),
    ask('protected-pawn', 'The pawn on e5 is protected by the pawn on d6. Should the queen capture it?', ['Yes, it wins a pawn', 'No, I would lose my queen for a pawn'], 1, ['After Qxe5, can Black recapture?', 'Count the value of what you give up.'], 'After Qxe5 dxe5 you have given a queen (9) for a pawn (1). Always check whether the capture can be answered.', { board: board('4k3/8/3p4/4p3/8/8/4Q3/4K3 w - - 0 1', { arrows: [{ from: 'd6', to: 'e5', tone: 'played' }] }) }),
  ],
  [
    tf('cap-1', 'You must always capture when a capture is available.', false, 'Capturing is allowed, not required.'),
    choice('cap-2', 'A queen captures a pawn that is protected by another pawn. What is likely to happen?', ['The queen is recaptured', 'Nothing', 'The pawn is promoted'], 0, 'The protecting pawn takes the queen, a very bad trade.'),
    mq('cap-3', 'Capture the piece that cannot be recaptured.', '4k3/8/4p3/3p3n/8/8/8/3QK3 w - - 0 1', ['d1h5'], 'The knight on h5 is unprotected. The pawn on d5 is protected by e6.'),
  ],
  { concepts: ['rules.capture', 'tactics.protection'] },
);

const check = lesson(
  'check', 'Check', 'Check and checkmate', 8,
  ['Recognise when a king is in check', 'Find the piece giving check', 'Know you must always deal with check'],
  [
    read(['When a king is attacked by an enemy piece, it is in check. Players usually say “check” aloud, but the rule applies even if nobody says it.', 'You must deal with a check immediately. No other move is allowed.'], board('4r1k1/8/8/8/8/8/8/4K3 w - - 0 1', { arrows: [{ from: 'e8', to: 'e1', tone: 'played' }], marks: [{ sq: 'e1', tone: 'bad' }] }), 'The king is attacked'),
    square('find-check', 'The white king is in check. Click the piece that gives check.', board('4r1k1/8/8/8/8/8/8/4K3 w - - 0 1'), ['e8'], ['Look for a piece attacking e1 along a line.', 'The e-file is open.'], 'The black rook on e8 attacks e1 down the open e-file.', ['Click the checking piece']),
    ask('is-check', 'Is the white king in check?', ['Yes', 'No'], 1, ['A pawn does not capture straight ahead.', 'Look at where each black piece attacks.'], 'A black pawn attacks diagonally forward (downwards for Black). The pawn on e2 does not attack e1.', { board: board('4k3/8/8/8/8/8/4p3/4K3 w - - 0 1') }),
    ask('knight-check', 'Is the white king in check?', ['Yes', 'No'], 0, ['Knights attack in an L-shape. Count from f3.'], 'The knight on f3 attacks e1 with its L-shape. Knights give check too, and they cannot be blocked.', { board: board('4k3/8/8/8/8/5n2/8/4K3 w - - 0 1', { arrows: [{ from: 'f3', to: 'e1', tone: 'played' }] }) }),
  ],
  [
    choice('chk-1', 'What must you do when your king is in check?', ['Get out of check immediately', 'Capture something else', 'Ignore it if you have a better move'], 0, 'No other move is allowed.'),
    tf('chk-2', 'You may make a move that leaves your own king in check.', false, 'Every move must leave your own king safe.'),
    choice('chk-3', 'Which piece type cannot be blocked when it gives check?', ['Rook', 'Knight', 'Bishop'], 1, 'A knight jumps, so nothing can be placed between it and the king.'),
  ],
  { concepts: ['rules.check'] },
);

const escape = lesson(
  'escaping-check', 'Getting out of check', 'Check and checkmate', 9,
  ['Know the three ways to escape check', 'Move, block or capture as the position allows', 'Spot which ways are available'],
  [
    read(['There are three ways to answer a check: move the king to a safe square, block the line between the attacker and the king, or capture the attacking piece.', 'Blocking works only against rooks, bishops and queens. Knights and pawns cannot be blocked.']),
    move('escape-move', 'Your king is in check from the rook. Move it to safety.', '4r1k1/8/8/8/8/8/PPP5/4K3 w - - 0 1', ['e1d1'], ['Get off the e-file.', 'Any square next to the king that the rook does not attack will do.'], 'The king steps off the file. Any of d1, f1 or f2 works (d2 too, since the rook does not attack it).', { alt: ['e1f1', 'e1d2', 'e1f2'], soft: true }),
    move('escape-block', 'The king cannot move. Block the check with your bishop.', '7k/8/8/8/2B5/8/5PPP/4r1K1 w - - 0 1', ['c4f1'], ['The rook attacks along the first rank.', 'Put your bishop on the square between the rook and your king.'], 'The bishop on f1 stands between rook and king. (It will often be taken, but the king is safe for now.)'),
    move('escape-capture', 'A knight gives check. Capture it with your pawn.', '4k3/8/8/8/8/5n2/6P1/4K3 w - - 0 1', ['g2f3'], ['A knight cannot be blocked, but it can be captured.', 'Your pawn on g2 captures diagonally.'], 'The pawn on g2 captures the knight on f3. Capturing the attacker is often the best answer.', { wrong: { e1d1: 'That also escapes check. For this exercise, capture the knight.', e1e2: 'That also escapes check. For this exercise, capture the knight.', e1f1: 'That also escapes check. For this exercise, capture the knight.', e1f2: 'That also escapes check. For this exercise, capture the knight.' } }),
  ],
  [
    choice('esc-1', 'How many ways are there to answer a check?', ['One', 'Two', 'Three'], 2, 'Move the king, block the line, or capture the checking piece.'),
    tf('esc-2', 'You can block a check from a knight.', false, 'Knights jump, so there is nothing to block. Move the king or capture the knight.'),
    mq('esc-3', 'Escape the check by capturing the knight.', '4k3/8/8/8/8/5n2/6P1/4K3 w - - 0 1', ['g2f3'], 'The pawn captures the checking knight.'),
  ],
  { concepts: ['rules.escape-check'] },
);

const mate = lesson(
  'checkmate', 'Checkmate', 'Check and checkmate', 10,
  ['Recognise checkmate', 'Tell checkmate from a check that can be escaped', 'Deliver checkmate in one move'],
  [
    read(['If a king is in check and none of the three answers is possible, the position is checkmate. The game ends immediately and the player who gave mate wins.', 'Checkmate is the goal of every game.']),
    ask('mate-yes', 'Black to move is in check from the rook. Is this checkmate?', ['Yes', 'No, Black has an escape'], 0, ['Can the king move? Can anything block or capture?', 'The pawns in front of the king are its own.'], 'The king’s own pawns block its escape squares, the rook covers the eighth rank, and nothing can capture or block. This is a back-rank mate.', { board: board('R5k1/5ppp/8/8/8/8/8/4K3 b - - 0 1', { arrows: [{ from: 'a8', to: 'g8', tone: 'played' }] }) }),
    ask('mate-no', 'Black to move is in check. Is this checkmate?', ['Yes', 'No, Black has an escape'], 1, ['Look at the squares around the king.', 'One pawn is missing.'], 'The king can step to g7: the g-pawn is missing, so there is a hole. It is only check.', { board: board('R5k1/5p1p/8/8/8/8/8/4K3 b - - 0 1', { marks: [{ sq: 'g7', tone: 'good' }] }) }),
    move('mate-in-one', 'White to move. Give checkmate in one move.', '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', ['a1a8'], ['Use the rook along the first rank, then up to the last.', 'The black pawns block the king’s escape squares.'], 'Ra8 is mate. The king cannot move, block or capture. This pattern is called a back-rank mate.', { anyMate: true }),
    move('mate-queen', 'White to move. Give checkmate in one move with the queen.', '7k/8/5K2/8/8/8/8/6Q1 w - - 0 1', ['g1g7'], ['Your king protects the square the queen should land on.', 'Put the queen next to the black king, on a square your king guards.'], 'Qg7 is mate. The queen is protected by the white king, so Black cannot capture it, and g8 and h7 are covered.', { anyMate: true }),
  ],
  [
    choice('mate-1', 'What is checkmate?', ['A king in check with no escape', 'Capturing the queen', 'Any check'], 0, 'Checkmate is check with no legal way out.'),
    mq('mate-2', 'Find the move that gives checkmate.', '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', ['a1a8'], 'The back-rank rook is mate because the pawns trap the king.', { mate: true }),
    mq('mate-3', 'Find the queen move that checkmates.', '7k/8/5K2/8/8/8/8/6Q1 w - - 0 1', ['g1g7'], 'Qg7#, protected by the king.', { mate: true }),
    tf('mate-4', 'A check that the king can escape is checkmate.', false, 'It is checkmate only when no escape, block or capture exists.'),
  ],
  { concepts: ['rules.checkmate', 'mate.back-rank'] },
);

const stalemate = lesson(
  'stalemate', 'Stalemate', 'Draws', 9,
  ['Know that stalemate is a draw', 'Spot a stalemate before you play it', 'Avoid throwing away a win'],
  [
    read(['Stalemate happens when the player to move is not in check but has no legal move at all. The game is a draw.', 'Beginners stumble into stalemate when they are far ahead. It is easy to avoid once you know to look.']),
    demo('A stalemate', board('7k/8/6K1/8/8/8/8/5Q2 w - - 0 1'), [
      { uci: 'f1f7', say: 'White has a queen against a bare king, but this is a mistake. Black is not in check, and every square the king could go to is controlled. Black has no legal move: stalemate, a draw.', arrows: [{ from: 'f7', to: 'g8', tone: 'played' }, { from: 'f7', to: 'h7', tone: 'played' }], marks: [{ sq: 'g8', tone: 'bad' }, { sq: 'g7', tone: 'bad' }, { sq: 'h7', tone: 'bad' }] },
    ]),
    move('avoid-stalemate', 'You are winning. Find the move that gives checkmate, not stalemate.', '7k/8/6K1/8/8/8/8/5Q2 w - - 0 1', ['f1f8'], ['One queen move there gives stalemate. Avoid it.', 'The queen needs to give check.'], 'Qf8 is mate: the queen checks on the eighth rank and covers g8 and g7. The king cannot reach h7 because the white king covers it.', { anyMate: true, wrong: { f1f7: 'That is stalemate: Black has no legal move and is not in check. The game is drawn!' } }),
  ],
  [
    choice('stm-1', 'Stalemate is…', ['A win for the player who caused it', 'A draw', 'A win for the player with no moves'], 1, 'Stalemate is a draw.'),
    tf('stm-2', 'In stalemate the king must be in check.', false, 'It is the opposite: the king is not in check but there is no legal move.'),
    mq('stm-3', 'Find the move that wins. Do not give stalemate.', '7k/8/6K1/8/8/8/8/5Q2 w - - 0 1', ['f1f8'], 'Qf8 is checkmate. Qf7 would be stalemate.', { mate: true }),
  ],
  { concepts: ['rules.stalemate'] },
);

const castling = lesson(
  'castling', 'Castling', 'Special moves', 10,
  ['Castle on either side', 'Know the conditions for castling', 'Know why castling is useful'],
  [
    read(['Castling is a special move that moves two pieces at once. The king moves two squares towards a rook, and that rook jumps to the other side of the king.', 'It tucks the king into safety and brings the rook into the game.'], board('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1'), 'King and rook together'),
    move('castle-kingside', 'Castle kingside (short). Move the king two squares towards the h-file rook.', '4k3/8/8/8/8/8/8/4K2R w K - 0 1', ['e1g1'], ['Click the king, then the square two to the right.', 'The king goes to g1.'], 'The king went to g1 and the rook to f1: short castling.', { soft: true }),
    move('castle-queenside', 'Now castle queenside (long).', '4k3/8/8/8/8/8/8/R3K3 w Q - 0 1', ['e1c1'], ['The king goes two squares towards the a-file rook.'], 'The king went to c1 and the rook to d1: long castling.', { soft: true }),
    read(['You may castle only if: the king and that rook have never moved; there are no pieces between them; the king is not in check; and the king does not cross or land on an attacked square.']),
    ask('cant-castle', 'Can White castle kingside here?', ['Yes', 'No'], 1, ['The bishop on c4 attacks one of the squares the king passes over.', 'Follow the diagonal from c4.'], 'The bishop controls f1, which the king would cross. Castling is not allowed through an attacked square.', { board: board('4k3/8/8/8/2b5/8/8/4K2R w K - 0 1', { arrows: [{ from: 'c4', to: 'f1', tone: 'played' }], marks: [{ sq: 'f1', tone: 'bad' }] }) }),
  ],
  [
    choice('cas-1', 'Where does the king go when castling kingside as White?', ['f1', 'g1', 'h1'], 1, 'The king goes to g1 and the rook to f1.'),
    tf('cas-2', 'You can castle out of check.', false, 'The king must not be in check, and cannot pass through check.'),
    mq('cas-3', 'Castle queenside.', '4k3/8/8/8/8/8/8/R3K3 w Q - 0 1', ['e1c1'], 'The king goes to c1 and the rook to d1.', { soft: true }),
    tf('cas-4', 'You can castle if your rook has already moved.', false, 'Both the king and that rook must never have moved.'),
  ],
  { concepts: ['rules.castling', 'principle.king-safety'] },
);

const enPassant = lesson(
  'en-passant', 'En passant', 'Special moves', 8,
  ['Recognise when en passant is possible', 'Capture a pawn en passant', 'Know it must be played immediately'],
  [
    read(['When a pawn moves two squares and lands next to an enemy pawn, that enemy pawn may capture it as if it had moved only one square. This is called en passant (“in passing”).', 'You must do it at once, on the very next move, or the chance is gone.']),
    demo('How it happens', board('4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1'), [
      { uci: 'd7d5', say: 'Black moves the pawn two squares. It lands right next to the white pawn on e5.', arrows: [{ from: 'd7', to: 'd5', tone: 'played' }] },
      { uci: 'e5d6', say: 'White captures as though the pawn had only stepped to d6. The black pawn on d5 is removed.', arrows: [{ from: 'e5', to: 'd6', tone: 'best' }], marks: [{ sq: 'd5', tone: 'bad' }] },
    ]),
    move('ep-capture', 'Black has just played d7–d5. Capture the pawn en passant.', '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', ['e5d6'], ['Capture as if the pawn had moved one square.', 'Your pawn lands on d6, the square it skipped.'], 'En passant: the pawn goes to d6 and the black pawn on d5 is removed.', { wrong: { e5e6: 'You can push the pawn, but the question is about capturing en passant.' } }),
  ],
  [
    choice('ep-1', 'When can en passant be played?', ['Only on the move right after the pawn’s two-square advance', 'At any later time', 'Only by kings'], 0, 'It must be played immediately.'),
    tf('ep-2', 'En passant can capture a pawn that moved only one square.', false, 'It applies only after a two-square advance.'),
    mq('ep-3', 'Capture en passant.', '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', ['e5d6'], 'Pawn takes the pawn that has just passed.'),
  ],
  { concepts: ['rules.en-passant'] },
);

const promotion = lesson(
  'promotion', 'Promotion', 'Special moves', 8,
  ['Promote a pawn that reaches the far rank', 'Choose the best piece', 'Know that a pawn becomes a new piece immediately'],
  [
    read(['When a pawn reaches the far end of the board, it must be promoted: it turns into a queen, rook, bishop or knight of its own colour.', 'Almost always you choose a queen, the strongest piece. You can even have several queens.']),
    move('promote', 'Promote the pawn to a queen.', '7k/P7/8/8/8/8/8/K7 w - - 0 1', ['a7a8q'], ['Move the pawn forward.', 'When asked, choose the queen.'], 'The pawn became a queen on a8, and she gives check at once.'),
    read(['A pawn is worth little until it reaches the end. Then it becomes the most powerful piece. That is why a pawn close to promotion is a big threat, and why you should keep an eye on your opponent’s far-advanced pawns.']),
    ask('promote-which', 'Which piece will you nearly always choose when promoting?', ['Queen', 'Pawn', 'King'], 0, ['Think about which piece is the strongest.'], 'The queen is the strongest piece, so promoting to a queen is almost always right.', { wrong: { 1: 'A pawn cannot stay a pawn: it must become another piece.', 2: 'You can only promote to a queen, rook, bishop or knight.' } }),
  ],
  [
    choice('pro-1', 'What happens when a pawn reaches the last rank?', ['It is promoted', 'It is captured', 'It stays a pawn'], 0, 'It becomes a queen, rook, bishop or knight.'),
    tf('pro-2', 'A pawn can promote to a king.', false, 'It can become a queen, rook, bishop or knight only.'),
    mq('pro-3', 'Promote the pawn to a queen.', '7k/P7/8/8/8/8/8/K7 w - - 0 1', ['a7a8q'], 'Queen is the usual choice.'),
  ],
  { concepts: ['rules.promotion'] },
);

const draws = lesson(
  'draws', 'Ways a game can be drawn', 'Draws', 9,
  ['Know the ways a game ends in a draw', 'Recognise repetition and the fifty-move rule', 'Recognise insufficient material'],
  [
    read(['A draw is a game nobody wins. Besides stalemate, there are four more ways: both players agree, the same position happens three times, fifty moves pass without a capture or pawn move, or neither side has enough pieces to checkmate.'], undefined, 'Five kinds of draw'),
    read(['Repetition: if the same position, with the same player to move, occurs three times, a player may claim a draw. It often happens when one side keeps giving checks.', 'Fifty-move rule: if each side has made fifty moves with no capture and no pawn move, a draw can be claimed.']),
    ask('draw-material', 'White has a king and a knight. Black has only a king. Can White force checkmate?', ['Yes', 'No: this is a draw'], 1, ['Is one knight enough to trap a king?', 'You cannot force mate with a lone knight or bishop.'], 'A king and a single knight (or bishop) cannot force checkmate. The game is a draw by insufficient material.', { board: board('4k3/8/8/8/8/8/8/3NK3 w - - 0 1') }),
    ask('draw-repeat', 'The same position occurs for the third time, with the same player to move. What can happen?', ['A draw can be claimed', 'White wins', 'Nothing'], 0, ['This is the repetition rule.'], 'A threefold repetition lets a player claim a draw.', { wrong: { 1: 'Repetition does not give a win to anyone.', 2: 'Repeating the same position three times does allow a draw.' } }),
  ],
  [
    choice('dr-1', 'Which of these is NOT a way to draw?', ['Stalemate', 'Threefold repetition', 'One side has more pieces'], 2, 'Having more pieces is not a draw.'),
    tf('dr-2', 'A lone king against king and bishop is a draw.', true, 'You cannot force checkmate with just a bishop.'),
    choice('dr-3', 'How many times must a position occur for a repetition draw?', ['Two', 'Three', 'Five'], 1, 'Three times, with the same player to move.'),
    choice('dr-4', 'What does the fifty-move rule say?', ['After fifty moves with no capture or pawn move a draw can be claimed', 'The game ends after fifty moves', 'Each player gets fifty moves'], 0, 'It stops games going on forever when no progress is made.'),
  ],
  { concepts: ['rules.draws'] },
);

export const rulesChapter: Chapter = {
  id: 'beginner-rules', title: 'The rules of the game', blurb: 'Check, mate, stalemate, castling and the special moves.',
  lessons: [capturing, check, escape, mate, stalemate, castling, enPassant, promotion, draws],
  check: [
    choice('rc-1', 'What are the three ways to answer a check?', ['Move, block or capture', 'Resign, move or castle', 'Block, castle or promote'], 0, 'Move the king, block the line, or capture the attacker.', { lesson: 'escaping-check' }),
    tf('rc-2', 'Stalemate is a win for the player who stalemated.', false, 'Stalemate is a draw.', { lesson: 'stalemate' }),
    mq('rc-3', 'Give checkmate in one.', '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', ['a1a8'], 'The back-rank rook is checkmate.', { lesson: 'checkmate', mate: true }),
    mq('rc-4', 'Castle kingside.', '4k3/8/8/8/8/8/8/4K2R w K - 0 1', ['e1g1'], 'The king goes to g1.', { lesson: 'castling', soft: true }),
    mq('rc-5', 'Black just played d7–d5. Capture en passant.', '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', ['e5d6'], 'Capture as if it moved one square.', { lesson: 'en-passant' }),
    choice('rc-6', 'Which of these ends a game in a draw?', ['Insufficient material', 'Capturing a pawn', 'Castling'], 0, 'If neither side can force checkmate, the game is drawn.', { lesson: 'draws' }),
    mq('rc-7', 'Capture the piece that is not protected.', '4k3/8/4p3/3p3n/8/8/8/3QK3 w - - 0 1', ['d1h5'], 'The pawn on d5 is protected.', { lesson: 'capturing' }),
  ],
};
