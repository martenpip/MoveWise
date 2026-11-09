import type { Chapter } from '../types';
import { START, ask, board, choice, demo, empty, lesson, mq, place, read, sq, square, tf } from './dsl';

const whatIs = lesson(
  'what-is-chess', 'What is chess?', 'The board and goal', 4,
  ['Know what two players are trying to do', 'Know what you play with', 'Know that you take turns'],
  [
    read(['Chess is a game for two players. One plays the white pieces and the other plays the black pieces.', 'Each side starts with sixteen pieces on a board of sixty-four squares. You take turns moving one piece at a time.'], board(START)),
    read(['You do not win by taking the most pieces. You win by trapping the enemy king so it cannot escape. That is called checkmate.', 'Pieces matter because they help you trap the king, or protect your own.']),
    ask('turns', 'Players take turns. How many pieces do you move on your turn?', ['One', 'Two', 'As many as you like'], 0, ['Think about how a turn works: you move, then your opponent moves.'], 'One piece, one move, then it is your opponent’s turn. You cannot pass.', { wrong: { 1: 'Only one piece moves per turn (castling is a special case you will meet later).' } }),
    ask('goal', 'What is the main goal of chess?', ['Capture every enemy piece', 'Trap the enemy king (checkmate)', 'Get your pawns to the far side'], 1, ['Only one piece decides the game.', 'It is the king.'], 'The game is decided by the king. Capturing pieces is only useful because it helps you trap the king.', { wrong: { 0: 'Capturing helps, but a game can be won with fewer pieces than your opponent has.', 2: 'Pawns reaching the far side can become stronger pieces, but that is not the goal.' } }),
  ],
  [
    choice('wic-1', 'How many squares does a chessboard have?', ['32', '64', '100'], 1, 'The board is eight squares by eight squares: 64 in total.'),
    choice('wic-2', 'What decides who wins a game of chess?', ['Who has captured more pieces', 'Who traps the enemy king', 'Who moves the most pawns'], 1, 'Checkmate, trapping the king, ends the game.'),
    tf('wic-3', 'You may move two different pieces on the same turn.', false, 'You move exactly one piece per turn.'),
  ],
  { concepts: ['board.goal'] },
);

const filesRanks = lesson(
  'files-ranks', 'Files, ranks and squares', 'Coordinates', 8,
  ['Know that files are letters a to h and ranks are numbers 1 to 8', 'Name any square, such as e4', 'Find a named square on the board'],
  [
    read(['Columns are called files, and they are named with letters a to h from left to right (from White’s side).', 'Rows are called ranks, and they are numbered 1 to 8 from White’s side to Black’s.'], empty({ marks: [{ sq: 'e1', tone: 'mark' }, { sq: 'e2', tone: 'mark' }, { sq: 'e3', tone: 'mark' }, { sq: 'e4', tone: 'mark' }, { sq: 'e5', tone: 'mark' }, { sq: 'e6', tone: 'mark' }, { sq: 'e7', tone: 'mark' }, { sq: 'e8', tone: 'mark' }] }), 'Files: the e-file'),
    read(['A square’s name is its file letter followed by its rank number. The highlighted square is where the file e meets rank 4: that is e4.', 'The bottom-left square, from White’s side, is a1.'], empty({ marks: [{ sq: 'e4', tone: 'good' }, { sq: 'a1', tone: 'hint' }] }), 'Square names'),
    square('find-1', 'Find these squares. The board is shown from White’s side.', empty(), ['e4', 'a1', 'h8', 'd5'], ['Letter first (left to right), then number (bottom to top).', 'a is the left edge. h is the right edge.'], 'Letter for the file, number for the rank. a1 is bottom-left and h8 is top-right.'),
    square('find-2', 'A few more. Take your time.', empty(), ['c3', 'f6', 'b7', 'g2'], ['For c3: go along to the letter c, then up to rank 3.'], 'You are doing the same thing each time: file letter, then rank number.'),
  ],
  [
    sq('fr-1', 'Click the square e4.', empty(), ['e4'], 'e4 is on the e-file (fifth from the left) and the fourth rank from the bottom.'),
    sq('fr-2', 'Click the square h1.', empty(), ['h1'], 'h1 is the far-right square on the bottom rank.'),
    choice('fr-3', 'What do we call a row of squares that runs from White’s side to Black’s side?', ['A file', 'A rank', 'A diagonal'], 0, 'A file runs up and down (letters a to h). A rank runs side to side (numbers 1 to 8).'),
  ],
  { concepts: ['board.coordinates'] },
);

const coordinates = lesson(
  'coordinates-practice', 'Reading the board from both sides', 'Coordinates', 8,
  ['Name squares when the board is turned around', 'Tell light squares from dark squares', 'Find a square quickly'],
  [
    read(['When you play Black, the board is turned so Black is at the bottom. The letters and numbers do not change: a1 is still a corner of White’s side.', 'It only looks different. Always read the letter and number around the edge.'], empty({ orientation: 'black', marks: [{ sq: 'a1', tone: 'hint' }, { sq: 'h8', tone: 'hint' }] }), 'Playing Black'),
    square('black-view', 'The board is turned around. Find these squares.', empty({ orientation: 'black' }), ['e5', 'a8', 'g1', 'c6'], ['The letters now run from right to left along the bottom edge.', 'a1 is now at the top-right.'], 'The names never change. Only your point of view does.'),
    read(['Squares alternate light and dark. A handy rule: the bottom-right corner (h1 for White) is always a light square.', 'Another way to remember: a1 is dark.'], empty(), 'Light and dark squares'),
    ask('colour-1', 'Is the square d4 light or dark?', ['Light', 'Dark'], 1, ['a1 is dark. Count squares along the diagonal: a1, b2, c3, d4.', 'Squares on one diagonal all share a colour.'], 'd4 is on the same diagonal as a1, so it is dark.', { board: empty({ marks: [{ sq: 'd4', tone: 'mark' }, { sq: 'a1', tone: 'hint' }] }) }),
    ask('colour-2', 'Is the square f3 light or dark?', ['Light', 'Dark'], 0, ['h1 is light. f3 is two squares up and two squares left of h1 on a diagonal.'], 'f3 is on the same diagonal as h1, so it is light.', { board: empty({ marks: [{ sq: 'f3', tone: 'mark' }, { sq: 'h1', tone: 'hint' }] }) }),
  ],
  [
    sq('cp-1', 'Black is at the bottom. Click the square b3.', empty({ orientation: 'black' }), ['b3'], 'The letters run right-to-left along the bottom when you play Black.'),
    choice('cp-2', 'Which corner square is light for White?', ['a1', 'h1', 'a8'], 1, 'h1 is light. a1 and h8 are dark.'),
    choice('cp-3', 'Is e4 light or dark?', ['Light', 'Dark'], 0, 'Add the file number (a=1 … h=8) to the rank: an odd total is a light square, an even total is dark. e4 is 5 + 4 = 9, so it is light.'),
    sq('cp-4', 'Click the square g7.', empty(), ['g7'], 'g is the seventh letter, and the square is on the seventh rank.'),
  ],
  { concepts: ['board.coordinates', 'board.colours'] },
);

const setup = lesson(
  'setting-up', 'Setting up the pieces', 'The board and goal', 8,
  ['Place every piece on its starting square', 'Remember the queen starts on her own colour', 'Know where the kings go'],
  [
    read(['Pawns fill the second rank. Behind them, from the corners inward: rook, knight, bishop, then the queen and king in the centre.', 'Black’s pieces are a mirror image of White’s.'], board(START), 'The starting position'),
    read(['Remember: “the queen starts on her own colour”. The white queen starts on a light square (d1). The black queen starts on a dark square (d8).', 'The king takes the other central square.'], board(START, { marks: [{ sq: 'd1', tone: 'good' }, { sq: 'd8', tone: 'good' }] }), 'Queen on her own colour'),
    place('place-white', 'Set up the white pieces. Follow the instruction beside the board, then click the square for each piece.', empty(), [
      { piece: 'R', color: 'w', squares: ['a1', 'h1'], count: 2, say: 'Rooks go in the corners.' },
      { piece: 'N', color: 'w', squares: ['b1', 'g1'], count: 2, say: 'Knights go next to the rooks.' },
      { piece: 'B', color: 'w', squares: ['c1', 'f1'], count: 2, say: 'Bishops go next to the knights.' },
      { piece: 'Q', color: 'w', squares: ['d1'], say: 'The queen goes on d1, a light square for a white queen.' },
      { piece: 'K', color: 'w', squares: ['e1'], say: 'The king takes the last square: e1.' },
    ], ['Rooks in the corners, then work inward.', 'The queen goes on d1, the king on e1.'], 'Rooks, knights, bishops, then the queen on d1 and the king on e1.'),
    place('place-pawns', 'Now set out the white pawns. Each one goes on the second rank.', board('rnbqkbnr/pppppppp/8/8/8/8/8/RNBQKBNR w KQkq - 0 1'), [
      { piece: 'P', color: 'w', squares: ['a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2'], count: 8 },
    ], ['The second rank is the one just in front of the pieces.'], 'Eight pawns on the second rank. Black does the same on the seventh.'),
  ],
  [
    sq('su-1', 'Click the square where the white queen starts.', empty(), ['d1'], 'The white queen starts on d1.'),
    sq('su-2', 'Click the square where the black king starts.', empty(), ['e8'], 'Black’s king starts on e8, opposite the white king on e1.'),
    choice('su-3', 'Which piece stands in the corners at the start?', ['Rooks', 'Bishops', 'Knights'], 0, 'Rooks start in the four corners.'),
    tf('su-4', 'Both queens begin on the same colour of square as their own pieces.', true, 'The white queen is on a light square and the black queen on a dark square: each on her own colour.'),
  ],
  { concepts: ['board.setup'] },
);

const goal = lesson(
  'white-black-goal', 'White, Black and the goal', 'The board and goal', 6,
  ['Know that White always moves first', 'Know that kings are never captured', 'See what checkmate looks like'],
  [
    read(['White always moves first. After that, you alternate. There is no passing and no skipping a turn.', 'Whichever side you play, the board and the rules are the same.'], board(START)),
    read(['The king is never actually captured. If the king is attacked, that is called check, and the player must deal with it immediately.', 'If the king is attacked and there is no escape, it is checkmate and the game is over.']),
    demo('A very fast checkmate', board(START), [
      ['f2f3', 'White plays a weak move on purpose.'],
      ['e7e5', 'Black takes space in the centre.'],
      ['g2g4', 'Another weak move: White has opened a line to its own king.'],
      { uci: 'd8h4', say: 'The black queen attacks the white king. The king cannot move away, nothing can block, and nothing can capture the queen. This is checkmate.', arrows: [{ from: 'h4', to: 'e1', tone: 'best' }], marks: [{ sq: 'e1', tone: 'bad' }] },
    ], 'This is called Fool’s mate. You will not play it, but it shows what the goal looks like.'),
    ask('first', 'Who moves first?', ['White', 'Black', 'Whoever chooses'], 0, ['Remember the first rule.'], 'White always moves first.'),
  ],
  [
    choice('wg-1', 'Which side moves first?', ['White', 'Black'], 0, 'White always moves first.'),
    tf('wg-2', 'In chess, the king is captured to win the game.', false, 'The king is never captured. The game ends in checkmate, when the king is attacked and cannot escape.'),
    mq('wg-3', 'This is the last moment of the game from the previous demonstration. Black to move: play the checkmating move.', 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2', ['d8h4'], 'The queen on h4 gives checkmate: the king cannot escape.', { mate: true, orientation: 'black' }),
  ],
  { concepts: ['board.goal', 'rules.checkmate'] },
);

export const boardChapter: Chapter = {
  id: 'beginner-board', title: 'Meet the chessboard', blurb: 'The board, the squares and what the game is about.',
  lessons: [whatIs, filesRanks, coordinates, setup, goal],
  check: [
    sq('bc-1', 'Click the square d5.', empty(), ['d5'], 'File d, rank 5.', { lesson: 'files-ranks' }),
    sq('bc-2', 'The board is turned around. Click the square f2.', empty({ orientation: 'black' }), ['f2'], 'Read the letters and numbers on the edge; they never change.', { lesson: 'coordinates-practice' }),
    sq('bc-3', 'Click the square where the white king starts.', empty(), ['e1'], 'The white king starts on e1.', { lesson: 'setting-up' }),
    choice('bc-4', 'What is a “file”?', ['A row, numbered 1 to 8', 'A column, lettered a to h', 'A diagonal line'], 1, 'Files are columns (letters). Ranks are rows (numbers).', { lesson: 'files-ranks' }),
    tf('bc-5', 'The white queen starts on a light square.', true, 'She starts on d1, a light square. The queen starts on her own colour.', { lesson: 'setting-up' }),
    choice('bc-6', 'How do you win a game of chess?', ['Capture the most pieces', 'Checkmate the enemy king', 'Move all your pawns forward'], 1, 'Checkmate ends the game.', { lesson: 'white-black-goal' }),
  ],
};
