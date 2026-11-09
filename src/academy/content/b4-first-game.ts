import type { Chapter } from '../types';
import { START, ask, board, choice, demo, lesson, move, mq, read, sq, square, tf } from './dsl';

const OPEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'; // 1.e4 e5 2.Nf3 Nc6
const ITALIAN = 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'; // 3.Bc4 Bc5
const ITALIAN6 = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 6 5'; // 3...Bc5 4.? Nf6 (white to castle)
const MIDDLE = 'r2q1rk1/pp2bppp/2n1pn2/3p4/3P1B2/2NBPN2/PP3PPP/R2Q1RK1 w - - 0 9';
const ENDGAME = '8/5pk1/6p1/8/8/6P1/5PK1/8 w - - 0 1';

const phases = lesson(
  'game-phases', 'The three phases of a game', 'Game phases', 8,
  ['Name the opening, middlegame and endgame', 'Know the main goal of each phase', 'Recognise which phase a position is in'],
  [
    read(['Every chess game moves through three phases. In the opening you bring your pieces into play. In the middlegame the pieces clash, with tactics and plans. In the endgame few pieces are left, and kings and pawns become important.'], undefined, 'Opening, middlegame, endgame'),
    read(['Opening goals: control the centre, develop your pieces and make your king safe.', 'Middlegame goals: attack weaknesses, defend, and make plans.', 'Endgame goals: use the king actively, push passed pawns and promote.']),
    ask('phase-1', 'Which phase is this position in?', ['Opening', 'Middlegame', 'Endgame'], 0, ['Count how many pieces have moved.', 'Most pieces are still at home.'], 'Few pieces have moved and both players are still developing.', { board: board('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4') }),
    ask('phase-2', 'And this one?', ['Opening', 'Middlegame', 'Endgame'], 1, ['Are most pieces developed? Are the kings safe?'], 'Both sides have developed and castled; now the fight begins with plans and tactics.', { board: board(MIDDLE) }),
    ask('phase-3', 'And this one?', ['Opening', 'Middlegame', 'Endgame'], 2, ['Where are the queens, rooks and minor pieces?'], 'Only kings and pawns remain. The kings will be important fighters.', { board: board(ENDGAME) }),
  ],
  [
    choice('gp-1', 'Which is a main goal of the opening?', ['Develop your pieces', 'Checkmate quickly with the queen', 'Trade all the pieces'], 0, 'Develop your pieces, control the centre, and make your king safe.'),
    choice('gp-2', 'In which phase do kings usually become active fighters?', ['Opening', 'Middlegame', 'Endgame'], 2, 'In endgames there is little danger to the king, so it can step forward.'),
    choice('gp-3', 'Both sides have developed and castled, and the pieces are about to clash. Which phase is this?', ['Opening', 'Middlegame', 'Endgame'], 1, 'Both sides are developed and castled: this is the middlegame.', { board: board(MIDDLE) }),
  ],
  { concepts: ['game.phases'] },
);

const firstMoves = lesson(
  'first-moves', 'Your first moves', 'Opening principles', 10,
  ['Open with a centre pawn', 'Develop knights toward the centre', 'Develop bishops to active squares'],
  [
    read(['The centre of the board is the most important area. Pieces in the centre reach more squares than pieces on the edge. In the opening, claim the centre with pawns and bring your knights and bishops out.'], board(START, { marks: [{ sq: 'd4', tone: 'good' }, { sq: 'e4', tone: 'good' }, { sq: 'd5', tone: 'good' }, { sq: 'e5', tone: 'good' }] }), 'The centre'),
    move('open-pawn', 'You are White. Take space in the centre with a pawn.', START, ['e2e4'], ['Move one of your two central pawns.', 'Two squares forward opens lines for the queen and bishop.'], 'A pawn on e4 controls d5 and f5 and opens lines for your queen and bishop. The d-pawn (d4) is just as good.', { alt: ['d2d4'], soft: true }),
    move('open-knight', 'Black copied you (1…e5). Develop a knight toward the centre.', 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', ['g1f3'], ['A knight is best on f3 or c3, not on the edge.', 'It can attack the black pawn on e5.'], 'Nf3 develops a piece and attacks the pawn on e5 at the same time. Nc3 is also good.', { alt: ['b1c3'], soft: true, wrong: { g1h3: 'The knight on the edge controls fewer squares. Play it toward the centre.', d1h5: 'Moving the queen out early lets Black attack her and gain time. Develop a knight first.' } }),
    move('open-bishop', 'Black defended with …Nc6. Develop a bishop to an active diagonal.', OPEN, ['f1c4'], ['Find a diagonal that aims at Black’s position.', 'The bishop on c4 looks at f7.'], 'Bc4 points at f7, Black’s weakest square early on. Bb5 is also a good development.', { alt: ['f1b5'], soft: true, wrong: { f1e2: 'That develops, but the bishop looks at nothing. A more active diagonal is available.' } }),
  ],
  [
    choice('fm-1', 'What is a good first move for White?', ['e2–e4', 'a2–a3', 'h2–h3'], 0, 'A central pawn move takes space and opens lines. Edge-pawn moves do not.'),
    mq('fm-2', 'Develop the knight to a good square.', 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', ['g1f3', 'b1c3'], 'Knights belong toward the centre, on f3 or c3.', { soft: true }),
    tf('fm-3', 'It is a good idea to bring the queen out on move two.', false, 'The queen can be chased by smaller pieces, so develop knights and bishops first.'),
  ],
  { concepts: ['principle.centre', 'principle.development'] },
);

const safeKing = lesson(
  'safe-king', 'Keeping your king safe', 'King safety', 9,
  ['Know why the king is safer after castling', 'Castle at the right moment', 'Know what a king in the centre risks'],
  [
    read(['In the middle of the board the king is exposed. Open files and diagonals lead straight to it. Tucking it behind pawns in a corner makes it harder to attack, and castling also brings a rook toward the centre.', 'Castle early, usually once your knight and bishop on that side are developed.'], board(ITALIAN6), 'Why castle?'),
    move('castle-now', 'You have developed your kingside pieces. Castle now.', ITALIAN6, ['e1g1'], ['The king and rook can castle once the squares between them are empty.', 'Move the king two squares to the right.'], 'The king is now behind its pawns and the rook is closer to the centre.', { soft: true, wrong: { d2d3: 'A fine move, but the king is still in the centre. Castle first.', h2h3: 'Not needed yet. Castle first.' } }),
    ask('king-centre', 'Why is a king in the centre risky?', ['Open lines can lead straight to it', 'It cannot move', 'It is worth fewer points'], 0, ['Think about which lines open when pawns are exchanged in the centre.'], 'When the centre opens, files and diagonals point straight at an uncastled king.', { wrong: { 1: 'It can move one square, but may have nowhere safe to go.', 2: 'The king has no point value: its safety is what matters.' } }),
  ],
  [
    choice('sk-1', 'Why do players usually castle early?', ['To make the king safe and bring a rook into play', 'To win material', 'It is required'], 0, 'Castling does two jobs at once.'),
    mq('sk-2', 'Castle kingside.', ITALIAN6, ['e1g1'], 'The king goes to g1 and the rook to f1.', { soft: true }),
    tf('sk-3', 'A king usually stays safest in the middle of the board in the opening.', false, 'The centre is where lines are most open, so the king is most exposed.'),
  ],
  { concepts: ['principle.king-safety', 'rules.castling'] },
);

const wasted = lesson(
  'no-wasted-moves', 'Do not waste moves', 'Opening principles', 9,
  ['Spend each opening move on a new job', 'Avoid moving the same piece again and again', 'Avoid pointless pawn moves'],
  [
    read(['Every move is a chance to improve your position. In the opening, each move should do a new job: take space, develop a piece, or castle.', 'Moving the same piece twice, or making edge-pawn moves, usually gives your opponent time to catch up.']),
    move('new-job', 'You have moved your knight and bishop. Choose a move that does a new job.', ITALIAN, ['e1g1'], ['Your king is still in the centre.', 'A pawn move that opens the c1 bishop would also work.'], 'Castling makes the king safe, which is a new job. A pawn move such as d3 or c3 prepares the centre and frees the c1 bishop.', { alt: ['d2d3', 'c2c3', 'b1c3'], soft: true, wrong: { f3g5: 'The knight has already moved, and on g5 the black queen simply captures it. Spend moves on new pieces instead.', a2a3: 'This does little for the centre or the king.' } }),
    ask('pawn-grab', 'Which opening move wastes time?', ['Moving the a-pawn one step', 'Developing a knight', 'Castling'], 0, ['Which move changes very little?'], 'A rook-pawn move rarely contributes to the opening. Knights and castling do real work.', { board: board(ITALIAN) }),
  ],
  [
    choice('nw-1', 'In the opening, a good move usually…', ['Does a new job', 'Moves a piece that has already moved', 'Moves an edge pawn'], 0, 'Develop, take the centre, or castle.'),
    tf('nw-2', 'Moving the same piece several times in the opening is usually efficient.', false, 'It uses up moves your other pieces need.'),
    mq('nw-3', 'Make a move that does a new job.', ITALIAN, ['e1g1', 'd2d3', 'c2c3', 'b1c3'], 'Castling, d3, c3 or Nc3 each do a new job.', { soft: true }),
  ],
  { concepts: ['principle.tempo'] },
);

const threats = lesson(
  'spot-threats', 'Seeing threats', 'Threats', 10,
  ['Look at what your opponent’s last move attacks', 'Find an attacked piece', 'Answer a threat'],
  [
    read(['Before every move, ask: what does my opponent’s last move do? Often a piece now attacks something of mine. If you miss it, you lose material.', 'After you see a threat, you can move the attacked piece, defend it, or take the attacker.']),
    square('see-threat-1', 'Black has just moved the rook to a4. Which white piece is under attack?', board('4k3/8/8/8/r2N4/8/8/4K3 w - - 0 1', { arrows: [{ from: 'a4', to: 'd4', tone: 'played' }] }), ['d4'], ['Follow the rook along its rank.', 'The rook attacks the first piece in its way.'], 'The rook attacks along the fourth rank and the knight is in the way.', ['Click the attacked piece']),
    square('see-threat-2', 'Black just played Bc5. Which white piece does the bishop attack?', board('4k3/8/8/2b5/8/8/5R2/4K3 w - - 0 1', { arrows: [{ from: 'c5', to: 'f2', tone: 'played' }] }), ['f2'], ['Follow the diagonal from c5 towards the king’s side.'], 'The bishop on c5 attacks the rook on f2 along the diagonal.', ['Click the attacked piece']),
    move('answer-threat', 'The rook attacks your knight. Move it to a safe square.', '4k3/8/8/8/r2N4/8/8/4K3 w - - 0 1', ['d4b3'], ['Any square off the fourth rank and a-file is safe.', 'Pick one near the centre.'], 'Moving the attacked piece is the simplest answer.', { alt: ['d4b5', 'd4c2', 'd4c6', 'd4e2', 'd4f3', 'd4f5'], soft: true, wrong: { d4e6: 'The knight is safe from the rook there, but on the e-file it walks into ...Re4+, a check that also attacks it. Pick a square off the e-file.' } }),
  ],
  [
    sq('thr-1', 'Click the white piece that is attacked.', board('4k3/8/8/8/r2N4/8/8/4K3 w - - 0 1'), ['d4'], 'The rook attacks along the fourth rank.'),
    choice('thr-2', 'Which is NOT a way to meet a threat?', ['Move the attacked piece', 'Defend it', 'Pretend it is not there'], 2, 'Always respond to a real threat.'),
    tf('thr-3', 'You should check what the opponent’s last move attacks before moving.', true, 'It is the single best habit for avoiding blunders.'),
  ],
  { concepts: ['principle.threats'] },
);

const guided1 = lesson(
  'guided-game-1', 'A guided game: the Italian opening', 'Guided games', 12,
  ['Follow a sensible opening move by move', 'See how development, the centre and castling fit together', 'Make the next sensible move yourself'],
  [
    demo('Step through the opening', board(START), [
      ['e2e4', 'White takes the centre and opens lines for the queen and the f1 bishop.'],
      ['e7e5', 'Black claims the centre too.'],
      ['g1f3', 'The knight develops toward the centre and attacks the pawn on e5.'],
      ['b8c6', 'Black defends the pawn and develops a piece.'],
      ['f1c4', 'The bishop develops to an active diagonal, aiming at the weak f7 square.'],
      ['f8c5', 'Black develops the bishop to a similar diagonal.'],
      ['e1g1', 'White castles: the king is safe and the rook comes toward the centre.'],
      ['g8f6', 'Black develops the last knight, attacking the pawn on e4.'],
    ], 'This is called the Italian Game. Click through it and notice what each move does.'),
    move('defend-e4', 'Black’s knight attacks your pawn on e4. Protect it while continuing development.', 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 6 5', ['d2d3'], ['Defend the pawn with a move that helps development.', 'Opening the c1 bishop helps.'], 'd3 defends the e4 pawn and opens the diagonal for the c1 bishop. Nc3 is another good way to defend.', { alt: ['b1c3', 'd1e2'], soft: true, wrong: { f3e5: 'The knight takes a pawn, but Black simply takes back and then wins the e4 pawn too. Develop and defend first.' } }),
    move('develop-last', 'Black has played …d6. Bring out your last knight.', 'r1bqk2r/ppp2ppp/2np1n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 w kq - 0 6', ['b1c3'], ['Which piece is still on its starting square?'], 'Nc3 completes the knights’ development and defends e4 once more.', { alt: ['c2c3'], soft: true }),
  ],
  [
    choice('gg1-1', 'What was the point of 3.Bc4?', ['It develops the bishop and aims at f7', 'It captures a pawn', 'It protects the king'], 0, 'It develops the bishop to an active diagonal.'),
    choice('gg1-2', 'In the game, which move made White’s king safer?', ['Castling', 'Playing e4', 'Playing Nf3'], 0, 'Castling moves the king to safety.'),
    mq('gg1-3', 'It is your move. Make a developing move.', 'r1bqk2r/ppp2ppp/2np1n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 w kq - 0 6', ['b1c3', 'c2c3'], 'Develop the last knight or support the centre.', { soft: true }),
  ],
  { concepts: ['opening.italian', 'principle.development'] },
);

const guided2 = lesson(
  'guided-game-2', 'A guided game: facing a quick attack', 'Guided games', 12,
  ['Spot a quick-checkmate threat', 'Defend against it calmly', 'Understand why early queen attacks usually fail'],
  [
    read(['Some opponents try to checkmate quickly with the queen and bishop aiming at f7. This is called Scholar’s Mate. It beats players who do not look at what the opponent threatens.', 'Let’s see how to meet it.']),
    demo('The attack', board(START), [
      ['e2e4', 'White opens.'],
      ['e7e5', 'Black answers in the centre.'],
      ['d1h5', 'The queen comes out early, attacking e5 and f7.'],
      ['b8c6', 'Black defends the e5 pawn.'],
      { uci: 'f1c4', say: 'The bishop joins. Now both queen and bishop attack f7. White threatens Qxf7, checkmate.', arrows: [{ from: 'h5', to: 'f7', tone: 'played' }, { from: 'c4', to: 'f7', tone: 'played' }], marks: [{ sq: 'f7', tone: 'bad' }] },
    ]),
    move('stop-mate', 'You are Black. White threatens Qxf7, checkmate. Defend.', 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3', ['g7g6'], ['Find a move that stops the queen reaching f7, attacks the queen, or defends the f7 square.', 'g6 attacks the queen.'], 'g6 attacks the queen and forces it away. Qe7, Qf6 or Nh6 also defend f7. After the queen retreats, Black has gained time.', { orientation: 'black', alt: ['d8e7', 'd8f6', 'g8h6'], soft: true, wrong: { g8f6: 'This looks natural, but it does not stop Qxf7. It is checkmate!', d7d6: 'This does not stop Qxf7#: the queen still captures on f7 with the bishop’s support.' } }),
    read(['After you survive the first wave, the early queen is usually a target. Develop pieces with tempo and use the extra development you gain.']),
  ],
  [
    choice('gg2-1', 'What was the main idea of the attack?', ['Attack f7 with queen and bishop', 'Win the e5 pawn', 'Open the a-file'], 0, 'f7 is guarded only by the king at the start.'),
    mq('gg2-2', 'Black to move. Stop Qxf7 mate.', 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3', ['g7g6', 'd8e7', 'd8f6', 'g8h6'], 'Each of these stops the mate.', { orientation: 'black' }),
    tf('gg2-3', 'Developing the knight with 3…Nf6 stops the mate.', false, 'It blocks nothing and leaves f7 attacked. Qxf7 is checkmate.'),
  ],
  { concepts: ['threats.mate-in-one', 'principle.threats'] },
);

export const firstGameChapter: Chapter = {
  id: 'beginner-first-game', title: 'Your first game', blurb: 'How a game flows, and how to play your first moves sensibly.',
  lessons: [phases, firstMoves, safeKing, wasted, threats, guided1, guided2],
  check: [
    choice('fg-1', 'Which phase comes after the opening?', ['Middlegame', 'Endgame', 'Castling'], 0, 'Opening, then middlegame, then endgame.', { lesson: 'game-phases' }),
    mq('fg-2', 'You are White. Take the centre with a pawn.', START, ['e2e4', 'd2d4'], 'e4 or d4 claim the centre.', { lesson: 'first-moves', soft: true }),
    mq('fg-3', 'Castle to make your king safe.', 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 6 5', ['e1g1'], 'The king goes to g1.', { lesson: 'safe-king', soft: true }),
    sq('fg-4', 'The black rook has just moved to a4. Which white piece does it attack?', board('4k3/8/8/8/r2N4/8/8/4K3 w - - 0 1'), ['d4'], 'The rook attacks along the rank.', { lesson: 'spot-threats' }),
    tf('fg-5', 'Moving the same piece several times in the opening is usually wise.', false, 'Spend moves developing new pieces.', { lesson: 'no-wasted-moves' }),
    mq('fg-6', 'White threatens Qxf7#. Defend.', 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3', ['g7g6', 'd8e7', 'd8f6', 'g8h6'], 'Several moves stop the mate.', { lesson: 'guided-game-2', orientation: 'black' }),
  ],
};
