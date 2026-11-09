import type { Chapter, Course } from '../types';
import { ask, board, choice, demoSan, fenAfter, lesson, mqSan, moveSan, read, sq, square, tf } from './dsl';

/* Every position below is produced by playing the SAN line, so each move is checked for legality when the module loads. */
const ITALIAN = 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O';
const CARLSBAD = 'd4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 Be7 e3 c6 Bd3 Nbd7 Qc2 O-O Nf3 Re8 O-O Nf8';
const NAJDORF = 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O Nbd7';
const FRENCH_ADV = 'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 Bd3';
const RUY = 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3';
const KID = 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7 Ne1 Nd7 Be3';

const principles = lesson(
  'open-principles', 'Opening principles', 'Opening understanding', 14,
  ['Name the aims of the opening: centre, development, king safety', 'See each principle at work in a real game-like line', 'Recognise a move that breaks a principle'],
  [
    read(['The opening has three jobs: put a pawn or two in the centre, bring your pieces out to squares where they work, and get your king safe, usually by castling. Everything else is detail.', 'Do not move the same piece twice without a reason, and do not bring the queen out early, because it can be chased with tempo.'], undefined, 'Three jobs'),
    demoSan('The Italian Game', ITALIAN, [
      'White takes space in the centre and opens lines for the bishop and queen.', 'Black does the same, so the centre is contested.',
      'The knight develops towards the centre and attacks the e5 pawn.', 'Black develops a knight to guard e5.',
      'The bishop goes to its best square, aimed at the weak f7 point.', 'Black’s bishop mirrors it.',
      'c3 prepares d4, to build a strong pawn centre.', 'Black develops the second knight, attacking e4.',
      'd3 solidly defends the e4-pawn and opens the c1-bishop.', 'd6 supports the e5 pawn and frees the c8-bishop.',
      'White castles: king safe, rook towards the centre.', 'Black castles too. Development is complete: every minor piece out, kings safe.',
    ], { intro: 'A quiet main line, with each principle in action.' }),
    moveSan('op-develop', 'White to move. Develop a piece with a purpose, aiming at the black kingside.', 'e4 e5 Nf3 Nc6', 'Bc4', ['A knight and a pawn are out. Which piece is still at home?', 'A bishop can aim at f7.'], 'Bc4 develops with a target: the f7 pawn is only defended by the king. Bb5 (the Ruy Lopez) and d4 (the Scotch) are also good here, because they follow the same principles.', { soft: true, alt: ['Bb5', 'd4'] }),
    ask('op-queen', 'Why is bringing the queen out early usually a mistake?', ['The queen can be attacked by developing moves, so the opponent gains time', 'The queen is not allowed to leave d1 early', 'It leaves the king open on the first move'], 0, ['Think about who gets to develop with tempo.'], 'An early queen is chased by knights and bishops, each of which develops with a threat. The queen spends moves running while the opponent builds the position.', { board: board(fenAfter('e4 e5 Qh5 Nc6 Bc4 g6 Qf3 Nf6')) }),
  ],
  [
    choice('opr-1', 'Which three things should the opening achieve?', ['Centre, development, king safety', 'Win a pawn, trade queens, attack', 'Push every pawn, castle late'], 0, 'These are the opening’s standing aims.'),
    tf('opr-2', 'Moving the same piece several times early usually helps your development.', false, 'It costs time while the opponent develops other pieces.'),
    choice('opr-3', 'Why did White play c3 in the Italian line?', ['To prepare d4 and build a pawn centre', 'To attack the queen', 'To castle'], 0, 'c3 supports the d4 advance.', { board: board(fenAfter('e4 e5 Nf3 Nc6 Bc4 Bc5 c3')) }),
    mqSan('opr-4', 'White to move. Complete the opening by getting the king safe.', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6', ['O-O'], 'Castling puts the king on g1 and the rook on f1, finishing development.'),
  ],
  { concepts: ['opening.principles', 'principle.development', 'principle.centre', 'principle.castle'], reviewPhases: ['opening'] },
);

const centre = lesson(
  'open-centre', 'Control of the centre', 'Opening understanding', 14,
  ['Explain two ways to fight for the centre: occupy it or control it from a distance', 'See how a pawn exchange opens the centre', 'Know that the side with the better centre can attack on the wings'],
  [
    read(['There are two ways to fight for the centre. Classical play puts pawns on e4 and d4. Hypermodern play lets the opponent have those pawns and attacks them with pieces from the side, planning to undermine them later.', 'Both are valid. What matters is that someone controls the central squares.'], undefined, 'Two schools'),
    demoSan('Occupying the centre: the Scotch', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4', [
      'White takes the centre with a pawn.', 'Black does the same.', 'The knight develops and attacks e5.', 'It defends e5.',
      'd4 challenges Black’s centre pawn directly.', 'Black captures, so the centre is opened.', 'White recaptures with a developed knight in the middle of the board.',
    ]),
    demoSan('Controlling the centre from a distance: the King’s Indian', 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6', [
      'White takes the centre.', 'Black develops a knight to control e4 and d5.', 'White adds a second central pawn.', 'The fianchetto aims the bishop at the centre.',
      'Nc3 supports e4 and d5.', 'Black’s bishop will press on the long diagonal.', 'White has a big pawn centre.', 'Black holds back with d6 and plans ...e5 or ...c5 to challenge it.',
    ], { intro: 'Black allows White a centre and attacks it afterwards.' }),
    moveSan('cen-claim', 'Black to move after 1.d4. Take a share of the centre.', 'd4', 'd5', ['White has a pawn on d4. How can you meet it?', 'A pawn on the same file blocks its advance and controls e4.'], 'd5 puts a pawn in the centre and stops White from playing e4 for free. Nf6 is also fine: it controls e4 from a distance, the hypermodern way.', { soft: true, alt: ['Nf6', 'e6'], orientation: 'black' }),
    ask('cen-why', 'What is a good reason to control the centre?', ['Your pieces can reach both wings quickly', 'The king is always safest there', 'Pawns in the centre are worth more points'], 0, ['Think about distance.'], 'Pieces on or aiming at the centre reach both sides of the board in a move or two, so you can attack where the opponent is weak.', { wrong: { 1: 'The king is usually safest after castling, away from the centre.' } }),
  ],
  [
    choice('ce-q1', 'Hypermodern play means…', ['Controlling the centre with pieces and attacking pawns later', 'Never playing in the centre', 'Pushing all pawns'], 0, 'Pieces from the flank can be as effective as pawns.'),
    choice('ce-q2', 'Which squares are the centre?', ['d4, e4, d5, e5', 'a1, h1, a8, h8', 'b2, g2, b7, g7'], 0, 'The four central squares.'),
    sq('ce-q3', 'In this position White has built a big centre. Click White’s most advanced central pawn.', board(fenAfter('d4 Nf6 c4 g6 Nc3 Bg7 e4 d6')), ['e4'], 'The pawn on e4 backs up d4 and c4.'),
    tf('ce-q4', 'A pawn exchange in the centre can open lines for the better developed side.', true, 'After 3.d4 exd4 the centre is open and the side with more pieces developed benefits.'),
  ],
  { concepts: ['opening.centre', 'principle.centre'], reviewPhases: ['opening'] },
);

const tempo = lesson(
  'open-tempo', 'Development and tempo', 'Opening understanding', 13,
  ['Define a tempo and a developing move with threat', 'Count how many moves each side has spent on development', 'Know when it is worth spending a tempo'],
  [
    read(['A tempo is one move of time. In the opening, the side that develops more pieces in fewer moves has more activity when the position opens. A move that develops a piece and attacks something at the same time gains a tempo.', 'Spending tempi on pawn grabs or on moving the queen around usually loses them.'], undefined, 'Time matters'),
    demoSan('Gaining tempo: the Scandinavian', 'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6', [
      'White takes the centre.', 'Black attacks it at once.', 'White takes the pawn.', 'Black recaptures with the queen, which comes out early.',
      'Nc3 develops and attacks the queen: a tempo gained.', 'The queen must move again.', 'White builds the centre and prepares more development.', 'Black develops the knight.',
      'White has two knights out and a pawn in the centre; Black has moved the queen twice and has only one other piece developed.', 'Black supports the queen and prepares to develop the bishop.',
    ], { intro: 'The queen is chased by a developing move.' }),
    moveSan('tem-chase', 'White to move. Develop a piece and attack the black queen at the same time.', 'e4 d5 exd5 Qxd5', 'Nc3', ['The black queen stands on d5.', 'Which knight can develop with an attack?'], 'Nc3 develops a piece and attacks the queen, so White gains a tempo. The queen has to move again.'),
    ask('tem-count', 'In this position, who is ahead in development?', ['White: two minor pieces are out, and Black has spent two moves on the queen', 'Black: three pieces are developed against one', 'Neither'], 0, ['Count the minor pieces off their original squares for each side.'], 'White has two knights out and a pawn on d4. Black has one knight out, and the queen has moved twice (...Qxd5, ...Qa5). White has the lead in time.', { board: board(fenAfter('e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6')), wrong: { 1: 'Black has moved the queen twice and has only one piece developed.' } }),
    ask('tem-worth', 'When can it be worth giving up development time?', ['When you get something concrete in return, such as a strong centre or an attack', 'Never', 'Whenever you want to take a pawn'], 0, ['Gambits are the classic example.'], 'Gambits spend time and a pawn to gain an attack. The price is worth it only if the compensation is real.', { wrong: { 2: 'Taking pawns while behind in development is how many openings are lost.' } }),
  ],
  [
    choice('tm-1', 'A developing move that attacks something gains…', ['A tempo', 'A pawn', 'A castling right'], 0, 'The opponent must reply to the threat.'),
    tf('tm-2', 'Moving the queen several times early helps your development.', false, 'It usually wastes tempi.'),
    mqSan('tm-3', 'White to move. Gain a tempo with a developing move.', 'e4 d5 exd5 Qxd5', ['Nc3'], 'The knight attacks the queen as it develops.'),
    choice('tm-4', 'Which side is ahead if White has developed 3 pieces and Black 1?', ['White', 'Black', 'It depends on the colour'], 0, 'More pieces in play means more activity.'),
  ],
  { concepts: ['opening.tempo', 'principle.development'], reviewPhases: ['opening'] },
);

const structures = lesson(
  'open-structures', 'Common opening structures', 'Opening understanding', 16,
  ['Recognise four standard pawn structures', 'Know the plan that goes with each structure', 'Use the structure to decide where your pieces go'],
  [
    read(['After a few moves of the opening, the pawns usually settle into a recognisable shape. That shape tells you what to do next. Learn the common ones and you know the plans before you learn any theory.'], undefined, 'The pawns tell you the plan'),
    read(['The Carlsbad structure: White has pawns on a2, b2, d4 and e3; Black has a7, b7, c6 and d5. White’s plan is the minority attack on the queenside. Black plays on the kingside or in the centre with ...e5.'], board(fenAfter(CARLSBAD), { marks: [{ sq: 'b2', tone: 'good' }, { sq: 'c6', tone: 'bad' }] }), 'Carlsbad'),
    read(['The open Sicilian: White has traded the d-pawn for Black’s c-pawn, so the d-file is open for White and the c-file for Black. In this line Black has played ...e5 and holds the d5-hole; White can occupy it with a knight.'], board(fenAfter(NAJDORF), { marks: [{ sq: 'd5', tone: 'good' }] }), 'Open Sicilian'),
    read(['The French Advance: White’s e5 pawn is supported by d4 and c3, giving White space. Black’s plan is to attack the base of the chain with ...c5 and ...Nc6, and to challenge e5 with ...f6.'], board(fenAfter(FRENCH_ADV), { marks: [{ sq: 'e5', tone: 'good' }, { sq: 'd4', tone: 'bad' }] }), 'French Advance'),
    read(['The closed Ruy Lopez: both sides have central pawns on e4/e5 and d4-d6 behind. White’s plan is to play d4 at the right moment; Black’s is to prepare ...c5, ...Nc6-a5, or ...d5 to challenge the centre.'], board(fenAfter(RUY), { marks: [{ sq: 'e4', tone: 'mark' }, { sq: 'e5', tone: 'mark' }] }), 'Closed Ruy Lopez'),
    ask('st-id', 'Which structure is this?', ['The French Advance chain', 'The Carlsbad structure', 'The King’s Indian'], 0, ['Look at White’s pawns on e5, d4 and c3.'], 'A chain of pawns e5-d4-c3 with Black pawns on e6 and d5 is the French Advance structure.', { board: board(fenAfter(FRENCH_ADV)), wrong: { 1: 'In the Carlsbad White has no c-pawn.' } }),
    ask('st-plan', 'Which plan belongs with the Carlsbad structure for White?', ['The minority attack with b4-b5', 'A kingside pawn storm', 'Trading all the pawns'], 0, ['White has fewer queenside pawns than Black.'], 'White’s two queenside pawns against Black’s three create a target when they advance and exchange on c6.', { board: board(fenAfter(CARLSBAD)), wrong: { 1: 'That is more typical when kings are on opposite sides.' } }),
  ],
  [
    sq('os-1', 'Click the square White’s knight can occupy in the open Sicilian position.', board(fenAfter(NAJDORF)), ['d5'], 'It is a hole: no Black pawn can ever attack it.'),
    choice('os-2', 'In the French Advance, Black usually attacks…', ['The base of White’s chain with ...c5', 'The h2-pawn at once', 'The f1-bishop'], 0, 'Undermine the chain at its base.', { board: board(fenAfter(FRENCH_ADV)) }),
    choice('os-3', 'A pawn structure tells you…', ['What plans and piece placements make sense', 'Who will win', 'How many moves the game lasts'], 0, 'It gives direction.'),
    tf('os-4', 'The minority attack belongs to the Carlsbad structure.', true, 'It is the traditional plan for White there.'),
  ],
  { concepts: ['opening.structures', 'position.pawn-structure'], reviewPhases: ['opening', 'middlegame'] },
);

const breaks = lesson(
  'open-breaks', 'Typical pawn breaks', 'Opening understanding', 14,
  ['Name the standard break for several openings', 'Know that a break is prepared, not played at once', 'Use the break to open the lines your pieces want'],
  [
    read(['Every opening structure has typical pawn breaks: pawn moves that challenge the opponent and open lines for your pieces. Learning them tells you what the opening is trying to achieve.', 'The French: ...c5 and ...f6. The Sicilian: ...d5. The King’s Indian: ...f5. The Queen’s Gambit: e4 and the minority attack.'], undefined, 'Break by structure'),
    moveSan('pbk-french', 'Black to move. Break at the base of White’s chain.', FRENCH_ADV, 'cxd4', ['White’s chain is e5-d4-c3. Which Black pawn can capture on d4?', 'Open the c-file for your queen and knight.'], 'cxd4 is the French’s thematic break. After cxd4 White recaptures cxd4, the pawn on d4 is the base of the e5-d4 chain, and Black’s queen and knight attack it.', { soft: true, alt: ['Bd7'], orientation: 'black' }),
    moveSan('pbk-kid', 'Black to move. This King’s Indian structure calls for the standard break on the kingside.', KID, 'f5', ['The centre is blocked, so Black attacks on the kingside.', 'Which pawn move opens the f-file for the rook?'], 'f5 is the King’s Indian’s signature break: the f-pawn attacks e4 and prepares ...f4 and a kingside attack. White meanwhile attacks on the queenside with c5.', { soft: true, orientation: 'black' }),
    ask('pbk-q', 'Why do you prepare a break before you play it?', ['Your pieces need to be ready for the lines that open', 'Breaks are not allowed early', 'A break always loses a pawn'], 0, ['Think about what happens when the position opens.'], 'Open lines help the better prepared side. Develop and castle first, then break.', { wrong: { 2: 'A good break exchanges pawns; it does not lose them.' } }),
  ],
  [
    choice('pk-1', 'The King’s Indian break is…', ['...f5', '...b5', '...h5'], 0, 'Together with ...f4 it drives the kingside attack.', { board: board(fenAfter(KID), { marks: [{ sq: 'f7', tone: 'mark' }] }) }),
    choice('pk-2', 'The French break against the chain is…', ['...c5', '...a5', '...g5'], 0, 'It hits the base of the chain.'),
    tf('pk-3', 'Pawn breaks should be played before developing pieces.', false, 'Develop first so the opened lines help you.'),
    choice('pk-4', 'A pawn break…', ['Challenges the opponent’s structure and opens lines', 'Wins a pawn for free', 'Is a king move'], 0, 'That is its purpose.'),
  ],
  { concepts: ['opening.pawn-break', 'plan.pawn-break'], reviewPhases: ['opening', 'middlegame'] },
);

const variations = lesson(
  'open-variations', 'Understanding opening variations', 'Opening understanding', 14,
  ['Know that an opening is a tree of variations, not one line', 'Recognise a transposition: different move orders, same position', 'Learn ideas, not only moves'],
  [
    read(['An opening is a tree. At each move the opponent can deviate, so memorised moves run out. What lasts is the idea behind them: the structure, the typical plans and the typical mistakes.', 'Different move orders can reach the same position: a transposition. Knowing that lets you choose the order that gives the opponent the fewest options.'], undefined, 'A tree, not a line'),
    demoSan('One position, two move orders (1)', 'd4 d5 c4 e6 Nc3 Nf6', ['White takes the centre.', 'Black does the same.', 'The Queen’s Gambit.', 'Black declines it.', 'White develops.', 'The Queen’s Gambit Declined.'], { intro: 'Order one reaches the Queen’s Gambit Declined.' }),
    demoSan('One position, two move orders (2)', 'd4 Nf6 c4 e6 Nc3 d5', ['White takes the centre.', 'Black develops a knight first.', 'The Queen’s pawn is played.', 'Black prepares d5 and the Nimzo option.', 'White develops.', 'The same position arises.'], { intro: 'Order two reaches exactly the same position.' }),
    ask('var-same', 'Do the two move orders end in the same position?', ['Yes, same pieces on the same squares', 'No, the knights are on different squares', 'No, the bishops differ'], 0, ['Compare the final squares of every piece.'], 'Both orders leave White with pawns on c4 and d4 and a knight on c3, and Black with pawns on d5 and e6 and a knight on f6. The position is identical, so it is a transposition. Move order still matters: in the second order Black can choose ...Bb4 (the Nimzo-Indian) at move three instead of ...d5, so the first move orders give the opponent different options.', { board: board(fenAfter('d4 d5 c4 e6 Nc3 Nf6')), wrong: { 1: 'Both knights are on c3 and f6 in both orders.' } }),
    moveSan('var-choose', 'Black to move after 3.Bb5. Choose the Morphy Defence, the main way to challenge the bishop.', 'e4 e5 Nf3 Nc6 Bb5', 'a6', ['The bishop on b5 pins nothing yet but pressures c6.', 'Ask the bishop what it wants to do.'], 'a6 asks the bishop to decide: take on c6 (giving up the bishop pair) or retreat to a4. It is the most common reply. Nf6 (the Berlin) is another sound variation.', { soft: true, alt: ['Nf6', 'Nge7'], orientation: 'black' }),
  ],
  [
    choice('va-1', 'A transposition is…', ['The same position reached by different move orders', 'A drawn game', 'An illegal move'], 0, 'The final position is identical.'),
    tf('va-2', 'It is enough to memorise a long line of moves without understanding it.', false, 'The opponent will deviate, and you need ideas to continue.'),
    mqSan('va-3', 'Black to move. Challenge the bishop on b5.', 'e4 e5 Nf3 Nc6 Bb5', ['a6'], 'The Morphy Defence.', { orientation: 'black' }),
    choice('va-4', 'Which is more useful to learn?', ['The ideas behind the moves', 'The longest possible line', 'Only trap lines'], 0, 'Ideas transfer when the opponent deviates.'),
  ],
  { concepts: ['opening.variations', 'opening.transposition'], reviewPhases: ['opening'] },
);

const traps = lesson(
  'open-traps', 'Opening traps and tactical mistakes', 'Opening understanding', 16,
  ['Recognise three classic opening traps', 'Know the basic tactical alert: before you capture or move, check what the move allows', 'See that a trap works only if the opponent is careless'],
  [
    read(['An opening trap is a natural-looking move that loses to a tactic. They teach one habit: before you move, ask “what does this allow?” and look at checks and captures.', 'Do not play for traps against a careful opponent. Play sound moves, and punish the mistake if it comes.'], undefined, 'What does this allow?'),
    demoSan('Scholar’s Mate', 'e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7', ['The centre.', 'Black does the same.', 'The queen eyes f7.', 'A natural developing move.', 'The bishop also aims at f7.', 'A natural-looking move that ignores the threat.', 'The queen takes on f7 with checkmate: the bishop supports it and the king has no escape.'], { intro: 'The simplest trap.' }),
    moveSan('trap-scholar', 'White to move. Black has just played ...Nf6, ignoring the threat. Find the mate.', 'e4 e5 Qh5 Nc6 Bc4 Nf6', 'Qxf7#', ['The f7 pawn is attacked twice: by the queen and by the bishop.', 'Is it defended enough?'], 'Qxf7 is checkmate. The bishop on c4 protects the queen and the king cannot capture it or escape. Black could have prevented it with ...g6 or ...Qe7.', { anyMate: true }),
    demoSan('Légal’s Mate', 'e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6 Nxe5 Bxd1 Bxf7 Ke7 Nd5', ['The centre.', 'Black does the same.', 'The knight develops.', 'A solid defence of e5.', 'The bishop eyes f7.', 'Black pins the knight to the queen.', 'The knight develops.', 'A weakening move that does not stop the idea.', 'White sacrifices the queen: the knight takes the pawn, ignoring the pin.', 'Black takes the queen. But now the position is set.', 'The bishop captures with check.', 'The king is forced to e7.', 'The knight delivers mate: the king is surrounded by its own pieces and pawns.'], { intro: 'A queen sacrifice that ends in a mating net.' }),
    moveSan('trap-legal', 'White to move. Black has taken the queen on d1. Find the check that starts the mating attack.', 'e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6 Nxe5 Bxd1', 'Bxf7+ Ke7 Nd5#', ['You are a queen down but there is a forcing sequence.', 'Which pawn is only defended by the king?'], 'Bxf7+ forces Ke7 (the only move), then Nd5 is checkmate: the king cannot reach any free square. The pin on the knight did not matter, because the Black queen’s bishop captured the queen, giving White time for the mate.'),
    demoSan('The Elephant Trap', 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Nbd7 cxd5 exd5 Nxd5 Nxd5 Bxd8 Bb4 Qd2 Bxd2 Kxd2 Kxd8', ['White takes the centre.', 'Black does the same.', 'The Queen’s Gambit.', 'Declined.', 'White develops.', 'Black develops.', 'The bishop pins the f6 knight.', 'Black prepares to meet the pin.', 'White takes the pawn.', 'Black recaptures.', 'A greedy capture: White takes the d5-pawn.', 'Black takes the knight, even though the f6-knight is pinned to the queen: the d8-queen is now attacked by the bishop on g5.', 'White takes the queen.', 'But Black has a check: the bishop attacks the king.', 'White must block or move the king.', 'Black takes the queen on d2 with check.', 'White recaptures.', 'Black takes the bishop. Black has won a knight for a pawn.'], { intro: 'A trap for White.' }),
    ask('trap-q', 'What is the best way to avoid falling for traps?', ['Check checks, captures and threats before every move', 'Memorise every trap', 'Never develop your queen'], 0, ['Traps are tactics.'], 'Traps are tactics. Asking what a move allows works against traps you have never seen.', { wrong: { 1: 'You cannot know every trap, and the habit is more useful.' } }),
  ],
  [
    mqSan('otr-1', 'White to move. Find the checkmate.', 'e4 e5 Qh5 Nc6 Bc4 Nf6', ['Qxf7#'], 'The queen takes f7 with mate, supported by the bishop.', { mate: true }),
    choice('otr-2', 'In Légal’s Mate, White wins because…', ['The queen sacrifice leads to a mating attack', 'Black blunders a rook', 'White castles'], 0, 'After Bxd1 the knights and bishop deliver mate.', { board: board(fenAfter('e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6 Nxe5 Bxd1')) }),
    tf('otr-3', 'You should play a known trap against every opponent.', false, 'A careful opponent punishes bad moves; play sound chess and take what is offered.'),
    choice('otr-4', 'What question defends against traps?', ['What does this move allow?', 'How many points is it?', 'Is it my favourite?'], 0, 'Check forcing moves for both sides.'),
  ],
  { concepts: ['opening.traps', 'tactic.opening-mistakes'], reviewPhases: ['opening'], reviewTags: ['allowed-mate'] },
);

const middlegame = lesson(
  'open-middlegame', 'Transitioning into the middlegame', 'Opening understanding', 14,
  ['Finish the opening with a checklist', 'Choose a plan based on the pawn structure', 'Know which pieces are still undeveloped'],
  [
    read(['The opening ends when your pieces are developed, your king is safe and your rooks are connected. At that point you stop following theory and start making a plan.', 'The checklist: are all pieces out, is the king safe, are the rooks connected, and what does the pawn structure suggest?'], undefined, 'When the opening is over'),
    square('mid-undev', 'White has castled and played h3. Which two White pieces are still on their starting squares? Click each.', board(fenAfter(RUY)), ['b1', 'c1'], ['Count the White minor pieces.', 'One is a knight and one is a bishop.'], 'The knight on b1 and the bishop on c1 have not moved. White’s next moves, such as Nbd2 and Bc2 or d4 and Bd2, complete development.', ['Click White’s undeveloped knight.', 'Click White’s undeveloped bishop.']),
    ask('mid-plan', 'In the closed Ruy Lopez, what is a standard plan for Black?', ['Prepare ...c5 and ...Nc6-a5 or ...d5 to challenge the centre', 'Trade all the pieces immediately', 'Attack the king with ...h5'], 0, ['Black needs to challenge White’s centre.'], 'The closed Ruy Lopez is a battle for the centre. Black’s Chigorin and Breyer setups (...Na5, ...c5, ...Nb8-d7) all prepare to challenge d4 or play ...d5.', { board: board(fenAfter(RUY)), wrong: { 1: 'Black is not worse; there is no need to trade everything.' } }),
    moveSan('mid-na5', 'Black to move. Play the standard developing move that attacks the bishop and prepares ...c5.', RUY, 'Na5', ['The bishop on b3 is the target.', 'A knight move to the rim can gain a tempo here.'], 'Na5 attacks the bishop and, after Bc2, ...c5 challenges the centre. This is the Chigorin Variation. Knights on the rim are usually bad, but here it has a clear purpose.', { soft: true, orientation: 'black' }),
  ],
  [
    choice('mt-1', 'When is the opening over?', ['Pieces developed, king safe, rooks connected', 'After 10 moves', 'When queens are traded'], 0, 'Then the plan begins.'),
    sq('mt-2', 'Click White’s undeveloped bishop.', board(fenAfter(RUY)), ['c1'], 'It is still on its starting square.'),
    tf('mt-3', 'The pawn structure helps choose the plan.', true, 'The structure tells you where to play.'),
    choice('mt-4', 'Na5 in the Ruy Lopez…', ['Attacks the bishop and prepares ...c5', 'Hangs a piece', 'Castles'], 0, 'It has a clear purpose.', { board: board(fenAfter(RUY + ' Na5')) }),
  ],
  { concepts: ['opening.middlegame', 'plan.method'], reviewPhases: ['opening', 'middlegame'] },
);

export const openFoundations: Chapter = {
  id: 'open-chapter-foundations', title: 'Principles, centre and tempo', blurb: 'What the opening is for.',
  lessons: [principles, centre, tempo, structures],
  check: [
    choice('oc1-1', 'The opening’s three jobs are…', ['Centre, development, king safety', 'Win a pawn, trade queens, attack', 'Sacrifice, check, mate'], 0, 'These are the opening’s standing aims.'),
    choice('oc1-2', 'A developing move that attacks something gains…', ['A tempo', 'A pawn', 'Nothing'], 0, 'The opponent must respond.'),
    choice('oc1-3', 'The French Advance chain is…', ['e5-d4-c3', 'f4-e3-d2', 'a4-b3-c2'], 0, 'White’s pawns support each other diagonally.', { board: board(fenAfter(FRENCH_ADV)) }),
    tf('oc1-4', 'Hypermodern play controls the centre from a distance.', true, 'Pieces from the flank attack the centre.'),
  ],
};
export const openPractice: Chapter = {
  id: 'open-chapter-practice', title: 'Breaks, variations and traps', blurb: 'Where openings go from here.',
  lessons: [breaks, variations, traps, middlegame],
  check: [
    choice('oc2-1', 'The King’s Indian break is…', ['...f5', '...a5', '...h5'], 0, 'It opens the f-file and attacks e4.'),
    choice('oc2-2', 'A transposition is…', ['The same position from different move orders', 'A drawn game', 'A pawn promotion'], 0, 'The final position is identical.'),
    mqSan('oc2-3', 'White to move. Find the checkmate.', 'e4 e5 Qh5 Nc6 Bc4 Nf6', ['Qxf7#'], 'Qxf7 is mate.', { mate: true }),
    choice('oc2-4', 'The opening ends when…', ['Pieces are developed, king safe, rooks connected', 'Queens are traded', 'You castle'], 0, 'Then plan from the structure.'),
  ],
};

export const openingCourse: Course = {
  id: 'openings', title: 'Opening understanding', level: 'advanced',
  blurb: 'Opening principles, the centre, development and tempo, standard pawn structures and breaks, move orders, traps, and how to enter the middlegame with a plan.',
  requires: ['beginner'],
  chapters: [openFoundations, openPractice],
  assessment: [
    choice('oa-1', 'What are the opening’s three jobs?', ['Centre, development, king safety', 'Win pawns, trade queens, attack', 'Push pawns'], 0, 'These are the standing aims.', { lesson: 'open-principles' }),
    choice('oa-2', 'Why is an early queen move usually a mistake?', ['Opponent gains time by attacking it with developing moves', 'It is illegal', 'It makes castling impossible'], 0, 'It spends tempi.', { lesson: 'open-tempo' }),
    mqSan('oa-3', 'White to move. Find the checkmate.', 'e4 e5 Qh5 Nc6 Bc4 Nf6', ['Qxf7#'], 'The queen takes f7 with mate.', { lesson: 'open-traps', mate: true }),
    choice('oa-4', 'Hypermodern play…', ['Attacks the centre from a distance', 'Ignores the centre', 'Pushes all pawns'], 0, 'Pieces control the centre.', { lesson: 'open-centre' }),
    choice('oa-5', 'The Carlsbad plan for White is…', ['The minority attack', 'A kingside storm', 'Queen trade'], 0, 'b4-b5.', { lesson: 'open-structures', board: board(fenAfter(CARLSBAD)) }),
    choice('oa-6', 'A transposition is…', ['The same position reached by different move orders', 'An illegal move', 'A rook trade'], 0, 'The final position is identical.', { lesson: 'open-variations' }),
    choice('oa-7', 'What question defends against opening traps?', ['What does this move allow?', 'How many points?', 'Is it my favourite?'], 0, 'Check checks and captures.', { lesson: 'open-traps' }),
    sq('oa-8', 'Click White’s undeveloped bishop.', board(fenAfter(RUY)), ['c1'], 'Still on c1.', { lesson: 'open-middlegame' }),
  ],
};
