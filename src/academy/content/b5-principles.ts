import type { Chapter } from '../types';
import { START, ask, board, choice, empty, lesson, move, mq, read, sq, square, tf } from './dsl';

const OPEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
const ITALIAN = 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
const ITALIAN6 = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 6 5';

const centre = lesson(
  'control-centre', 'Control the centre', 'Principles', 10,
  ['Name the four central squares', 'Prefer central squares for pawns and pieces', 'Fight for the centre as Black too'],
  [
    read(['The four central squares are d4, e4, d5 and e5. Pieces placed there reach more squares and can swing to either side of the board.', 'You do not have to occupy the centre with pawns; you can also control it from a distance with pieces.'], board(START, { marks: [{ sq: 'd4', tone: 'good' }, { sq: 'e4', tone: 'good' }, { sq: 'd5', tone: 'good' }, { sq: 'e5', tone: 'good' }] })),
    square('centre-squares', 'Click the four central squares.', empty(), ['d4', 'e4', 'd5', 'e5'], ['They are the middle squares: files d and e, ranks 4 and 5.'], 'd4, e4, d5 and e5.'),
    ask('knight-where', 'Which first knight move is better?', ['Nf3', 'Nh3'], 0, ['Which square controls more of the centre?'], 'A knight on f3 eyes the centre (d4 and e5). On h3 it points at the edge.', { board: board(START, { arrows: [{ from: 'g1', to: 'f3', tone: 'best' }, { from: 'g1', to: 'h3', tone: 'played' }] }) }),
    move('black-centre', 'You are Black. White has played 1.e4. Fight for the centre.', 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', ['e7e5'], ['Take the centre with a pawn of your own.', 'More than one pawn move works.'], 'Black answers with ...e5, d5, c5 or e6, each of which fights for the centre.', { orientation: 'black', alt: ['d7d5', 'c7c5', 'e7e6'], soft: true }),
  ],
  [
    sq('cc-1', 'Click one of the four central squares: the one on the e-file nearest White.', empty(), ['e4'], 'e4 is the central square on the e-file on White’s half.'),
    choice('cc-2', 'Why is the centre important?', ['Pieces there reach more squares', 'It is where the king belongs', 'Pawns are worth more there'], 0, 'Central pieces are more mobile.'),
    mq('cc-3', 'White has played 1.e4. Fight for the centre as Black.', 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', ['e7e5', 'd7d5', 'c7c5', 'e7e6'], 'Any of these fights for the centre.', { orientation: 'black', soft: true }),
  ],
  { concepts: ['principle.centre'] },
);

const developMinor = lesson(
  'develop-minor', 'Develop your minor pieces', 'Principles', 9,
  ['Know that knights and bishops are the minor pieces', 'Bring them out before rooks and queen', 'Count what is still at home'],
  [
    read(['Knights and bishops are called minor pieces. They are your fastest way to join the game. Bring them out early, before the queen or rooks, and aim them at the centre.', 'Pieces at home are not helping you.']),
    ask('which-dev', 'Which of these moves develops a minor piece?', ['Nf3', 'a3', 'Qh5'], 0, ['Which move brings a knight or bishop into the game?'], 'Nf3 develops a knight. The other moves use the pawn or queen instead.', { wrong: { 1: 'a3 moves a pawn.', 2: 'Qh5 brings the queen out too early.' } }),
    ask('count-home', 'How many of White’s minor pieces are still on their starting squares?', ['0', '2', '4'], 1, ['Both knights are out. What about the bishops?'], 'The bishops on c1 and f1 have not moved.', { board: board('r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 4 4') }),
    move('last-minor', 'Bring out a bishop to an active square.', 'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 4 4', ['f1b5'], ['The f1 bishop has not moved yet.', 'Look for a diagonal that does something.'], 'Bb5 and Bc4 both bring the bishop to an active diagonal; Be2 is solid.', { alt: ['f1c4', 'f1e2'], soft: true, wrong: { a2a3: 'This does not develop anything.' } }),
  ],
  [
    choice('dm-1', 'Which pieces are the “minor” pieces?', ['Knights and bishops', 'Rooks and queen', 'Pawns'], 0, 'Knights and bishops are the minor pieces.'),
    tf('dm-2', 'You should develop your rooks before your knights and bishops.', false, 'Minor pieces first; rooks later, after castling.'),
    mq('dm-3', 'Develop your last bishop.', 'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 4 4', ['f1b5', 'f1c4', 'f1e2'], 'Any of these brings the bishop out.', { soft: true }),
  ],
  { concepts: ['principle.development'] },
);

const repeats = lesson(
  'avoid-repeats', 'Move each piece once', 'Principles', 9,
  ['Prefer a new piece over moving the same one again', 'Find the pieces still at home', 'Know when an exception is right'],
  [
    read(['In the opening, try to move each piece only once. Each extra move on the same piece is a move your other pieces do not get.', 'There are exceptions: win material, answer a threat, or retreat a piece that is attacked.']),
    square('home-pieces', 'In this position, click the white knight and bishop that have not moved.', board(ITALIAN), ['b1', 'c1'], ['White has moved a knight (to f3) and a bishop (to c4).', 'Look at the other knight and the other bishop on the first rank.'], 'b1 and c1 are still at home, so they should be next.', ['Click the white knight that has not moved', 'Click the white bishop that has not moved']),
    move('new-piece', 'Choose a move that develops a piece or prepares to.', ITALIAN, ['b1c3'], ['Do not move the knight or bishop that has already moved.'], 'Nc3 brings the second knight out. Castling or a pawn move such as d3 also does a new job.', { alt: ['e1g1', 'd2d3', 'c2c3'], soft: true, wrong: { f3g5: 'The knight has already moved, and on g5 it can simply be captured. Develop a new piece.' } }),
    ask('exception', 'When is it fine to move a piece twice in the opening?', ['When it wins material or meets a threat', 'Always', 'Never'], 0, ['Think about when a second move is truly necessary.'], 'Rules of thumb have exceptions. Winning material or meeting a real threat is worth a repeat move.', { wrong: { 1: 'Extra moves with the same piece usually waste time.', 2: 'Never is too strong: tactics and threats can demand it.' } }),
  ],
  [
    choice('ar-1', 'In the opening it is usually best to…', ['Move each piece only once', 'Move the same piece several times', 'Move pawns only'], 0, 'Develop a new piece with each move.'),
    tf('ar-2', 'Moving a piece twice is sometimes right.', true, 'When you win material or meet a threat, a second move can be right.'),
    sq('ar-3', 'White needs to develop. Click the bishop that has not moved yet.', board(ITALIAN), ['c1'], 'The c1 bishop is still at home.'),
  ],
  { concepts: ['principle.tempo', 'principle.development'] },
);

const castleEarly = lesson(
  'castle-early', 'Castle early', 'Principles', 8,
  ['Know when castling is available', 'Castle before the centre opens', 'Know the cases where castling is not possible'],
  [
    read(['Castle as soon as your knight and bishop on that side are out. A king that stays in the centre can be attacked quickly, especially when the centre opens.']),
    move('castle-black', 'You are Black. Make your king safe.', 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R b KQkq - 0 5', ['e8g8'], ['The king and rook can castle if the squares between are empty.', 'Move the king two squares toward the rook.'], 'Black castles kingside; the king is safe behind its pawns.', { soft: true, orientation: 'black', wrong: { d7d6: 'Fine, but the king is still in the centre. Castle first.' } }),
    ask('castle-when', 'The queen’s bishop and knight are not developed yet. Is it a good time to castle?', ['Better to develop first', 'Castle at once whatever happens'], 0, ['Castling usually follows development, not the reverse.'], 'Castling is best soon, but develop the pieces first when it is safe: the rook cannot do much until the minor pieces are out.', {}),
  ],
  [
    mq('ce-1', 'You are Black. Castle.', 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R b KQkq - 0 5', ['e8g8'], 'Kingside castling is e8–g8.', { orientation: 'black', soft: true }),
    tf('ce-2', 'A king that has already moved can still castle.', false, 'The king must never have moved.'),
    choice('ce-3', 'When is castling a good idea?', ['Soon, after developing the minor pieces on that side', 'On move one', 'Only in the endgame'], 0, 'Early, but after the key pieces are out.'),
  ],
  { concepts: ['principle.king-safety', 'rules.castling'] },
);

const connect = lesson(
  'connect-rooks', 'Connect your rooks', 'Principles', 8,
  ['Know what “connected rooks” means', 'See which pieces stand between the rooks', 'Clear the first rank'],
  [
    read(['Rooks are connected when there is nothing between them on the back rank, so they protect each other. This usually happens when you have developed every other piece and castled.', 'Rooks work best on open files, and connected rooks can move there safely.']),
    ask('between', 'Which White pieces stand between the rooks on a1 and f1?', ['The bishop on c1 and the queen on d1', 'Nothing: they are connected', 'Only the king'], 0, ['Look along the first rank.'], 'The bishop on c1 and the queen on d1 still stand between the rooks.', { board: board('r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7', { arrows: [{ from: 'a1', to: 'f1', tone: 'info' }] }) }),
    move('clear-rank', 'Develop the last minor piece so the rooks can start to connect.', 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7', ['c1g5'], ['The only undeveloped minor piece is on c1.', 'Move it off the back rank.'], 'Bg5 (or Be3 or Bd2) clears the bishop off the first rank. Next the queen can move too.', { alt: ['c1e3', 'c1d2'], soft: true }),
  ],
  [
    choice('cr-1', 'Rooks are “connected” when…', ['Nothing stands between them on the first rank', 'They are on the same file', 'They are next to the king'], 0, 'They protect each other.'),
    tf('cr-2', 'Castling helps connect the rooks.', true, 'The king leaves the back rank, which is a big step.'),
    mq('cr-3', 'Develop the last minor piece off the first rank.', 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7', ['c1g5', 'c1e3', 'c1d2'], 'Any of these moves the c1 bishop.', { soft: true }),
  ],
  { concepts: ['principle.rook-activity'] },
);

const undefended = lesson(
  'undefended-pieces', 'Never leave pieces loose', 'Principles', 10,
  ['Check whether your pieces are defended', 'Fix a piece that is attacked and loose', 'Look for the same weakness in your opponent’s camp'],
  [
    read(['A piece with no defender is loose. If it is also attacked, you will lose it. A good habit: before each move, scan your pieces for loose ones, and your opponent’s too.', 'Loose pieces drop off.']),
    ask('is-defended', 'White’s bishop on c4 is not on a defended square. Is it defended by another white piece?', ['Yes', 'No: it is loose'], 1, ['Look at which white pieces see c4.'], 'No piece of White’s guards c4, so the bishop is loose. It is not attacked yet, but a black pawn on b5 or d5 would attack it.', { board: board('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', { marks: [{ sq: 'c4', tone: 'mark' }] }) }),
    move('save-bishop', 'The knight attacks your bishop, and it is not defended. Save it.', '4k3/8/8/2n5/4B3/8/8/4K3 w - - 0 1', ['e4d5'], ['Move the bishop away from the knight’s attack, or to a protected square.', 'The knight attacks d3 and b7 as well.'], 'The bishop moves to a safe square. Avoid d3 and b7, which the knight also attacks.', { alt: ['e4c2', 'e4b1', 'e4f3', 'e4g2', 'e4h1', 'e4c6', 'e4a8', 'e4f5', 'e4g6', 'e4h7'], soft: true, wrong: { e4d3: 'The knight on c5 attacks d3.', e4b7: 'The knight on c5 attacks b7.' } }),
  ],
  [
    choice('up-1', 'A “loose” piece is…', ['A piece no other piece defends', 'A piece that has moved', 'A piece on the edge'], 0, 'Loose pieces have no defenders.'),
    tf('up-2', 'A piece that is attacked and undefended will probably be lost.', true, 'Move it, defend it, or capture the attacker.'),
    mq('up-3', 'Save the bishop.', '4k3/8/8/2n5/4B3/8/8/4K3 w - - 0 1', ['e4d5', 'e4c2', 'e4b1', 'e4f3', 'e4g2', 'e4h1', 'e4c6', 'e4a8', 'e4f5', 'e4g6', 'e4h7'], 'Any safe square works. The knight covers d3 and b7.', { soft: true }),
  ],
  { concepts: ['principle.loose-pieces', 'threats.hanging-piece'], reviewTags: ['hung-piece'] },
);

const activity = lesson(
  'piece-activity', 'Activate your pieces', 'Principles', 9,
  ['Compare active and passive squares', 'Count how many squares a piece controls', 'Improve a badly placed piece'],
  [
    read(['A piece is active when it controls many squares and takes part in the game. It is passive when it is blocked or stuck on the edge.', 'Ask yourself each move: which of my pieces is doing the least? Improve that one.']),
    ask('count-squares', 'How many squares can the knight on a3 move to?', ['2', '4', '8'], 1, ['Count the L-shapes that stay on the board.'], 'From a3 the knight reaches b1, b5, c2 and c4. In the centre it would reach eight.', { board: board('k7/8/8/8/8/N7/8/7K w - - 0 1', { marks: [{ sq: 'b1', tone: 'hint' }, { sq: 'b5', tone: 'hint' }, { sq: 'c2', tone: 'hint' }, { sq: 'c4', tone: 'hint' }] }) }),
    move('improve-knight', 'The knight on a3 is badly placed. Move it to a better square.', 'k7/8/8/8/8/N7/8/7K w - - 0 1', ['a3c4'], ['The centre gives the knight more squares.', 'Choose between c4 and b5.'], 'The knight on c4 attacks six squares (it would attack eight in the middle of the board).', { alt: ['a3b5'], soft: true }),
    move('active-bishop', 'Which bishop move aims at Black’s weakest point, f7?', OPEN, ['f1c4'], ['Find the diagonal that hits f7.'], 'Bc4 is active: it eyes f7. Be2 is safe but passive, because it aims at nothing.', { alt: ['f1b5'], soft: true, wrong: { f1e2: 'Safe, but the bishop on e2 looks at nothing. Look for a more active square.' } }),
  ],
  [
    choice('pa-1', 'An “active” piece is one that…', ['Controls many squares', 'Has just moved', 'Is on the edge'], 0, 'Active pieces control many squares and help the game.'),
    choice('pa-2', 'How many squares can a knight on the rim reach?', ['At most four', 'Eight', 'Fourteen'], 0, 'At most four. In the middle it reaches eight.'),
    mq('pa-3', 'Move the knight to a more active square.', 'k7/8/8/8/8/N7/8/7K w - - 0 1', ['a3c4', 'a3b5'], 'The knight likes to be central.', { soft: true }),
  ],
  { concepts: ['principle.activity'] },
);

const oppThreats = lesson(
  'opponent-threats', 'Think about your opponent’s threats', 'Principles', 10,
  ['Ask what your opponent is threatening', 'Find an attacked piece', 'Defend while developing'],
  [
    read(['Before each of your moves, ask three questions. What did my opponent’s last move do? What is it threatening? What can I do about it?', 'The best strategy is useless if you do not notice the opponent’s plan.']),
    square('see-pin', 'Black just played …Bg4. Click the white piece it attacks.', board('rn1qkbnr/ppp2ppp/3p4/4p3/4P1b1/5N2/PPPP1PPP/RNBQKB1R w KQkq - 1 4', { arrows: [{ from: 'g4', to: 'f3', tone: 'played' }] }), ['f3'], ['Follow the bishop’s diagonal.'], 'The bishop attacks the knight on f3, which stands in front of the queen on d1.', ['Click the attacked piece']),
    move('defend-pawn', 'Black’s knight on f6 attacks your e4 pawn. Defend it while developing.', 'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 4 4', ['b1c3'], ['The e4 pawn has no defender.', 'Find a developing move that guards it.'], 'Nc3 defends e4 and develops a piece. d3 also works.', { alt: ['d2d3'], soft: true, wrong: { f3e5: 'Taking e5 loses a knight for a pawn: Black takes back and your e4 pawn is still attacked.' } }),
  ],
  [
    choice('ot-1', 'Which question should you ask before every move?', ['What is my opponent threatening?', 'Can I move a pawn?', 'Is it Black’s move?'], 0, 'Spot threats first.'),
    mq('ot-2', 'The knight on f6 attacks e4. Defend it with a developing move.', 'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 4 4', ['b1c3', 'd2d3'], 'Nc3 or d3 guard the pawn.', { soft: true }),
    sq('ot-3', 'Black’s bishop has just moved to g4. Which white piece does it attack?', board('rn1qkbnr/ppp2ppp/3p4/4p3/4P1b1/5N2/PPPP1PPP/RNBQKB1R w KQkq - 1 4'), ['f3'], 'The bishop attacks the knight on f3.'),
  ],
  { concepts: ['principle.threats'] },
);

export const principlesChapter: Chapter = {
  id: 'beginner-principles', title: 'Essential chess principles', blurb: 'The habits that turn legal moves into good moves.',
  lessons: [centre, developMinor, repeats, castleEarly, connect, undefended, activity, oppThreats],
  check: [
    mq('pr-1', 'Fight for the centre as Black.', 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', ['e7e5', 'd7d5', 'c7c5', 'e7e6'], 'Any of these fights for the centre.', { lesson: 'control-centre', orientation: 'black', soft: true }),
    choice('pr-2', 'Which are the minor pieces?', ['Knights and bishops', 'Rooks', 'Queen'], 0, 'Knights and bishops.', { lesson: 'develop-minor' }),
    mq('pr-3', 'Castle to make your king safe.', ITALIAN6, ['e1g1'], 'The king goes to g1.', { lesson: 'castle-early', soft: true }),
    tf('pr-4', 'A piece that is attacked and not defended is in danger.', true, 'Move it, defend it, or remove the attacker.', { lesson: 'undefended-pieces' }),
    mq('pr-5', 'Defend e4 and develop.', 'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 4 4', ['b1c3', 'd2d3'], 'Guard the pawn with a developing move.', { lesson: 'opponent-threats', soft: true }),
    choice('pr-6', 'Connected rooks…', ['Have nothing between them on the back rank', 'Stand on the same file', 'Are next to the king'], 0, 'They protect each other.', { lesson: 'connect-rooks' }),
    mq('pr-7', 'Move the knight to a more active square.', 'k7/8/8/8/8/N7/8/7K w - - 0 1', ['a3c4', 'a3b5'], 'Central squares are better.', { lesson: 'piece-activity', soft: true }),
    choice('pr-8', 'A good habit before each move is to ask…', ['What does my opponent threaten?', 'Which pawn can I push?', 'Can I resign?'], 0, 'Always check the opponent’s threats.', { lesson: 'opponent-threats' }),
  ],
};
