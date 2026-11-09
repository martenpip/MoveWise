import type { Chapter, Course } from '../types';
import { ask, board, choice, demo, lesson, move, read, sq, square, tf } from './dsl';

/* Positions (all reached by legal play or built so that both kings are legal; checked by validate-academy). */
const IQP = 'r2q1rk1/pp2bppp/2n1bn2/3p4/3N4/2N1B3/PP2BPPP/R2Q1RK1 w - - 0 1'; // Black has an isolated d5-pawn
const NAJ = 'r2q1rk1/1p1nbppp/p2pbn2/4p3/4P3/1NN1BP2/PPPQ2PP/2KR1B1R w - - 5 11'; // Sicilian Najdorf, English Attack
const CARL = 'r1bqr1k1/pp2bppp/2p2nn1/3p2B1/3P4/2NBPN2/PPQ2PPP/1R3RK1 w - - 10 12'; // Carlsbad structure, minority attack
const FRENCH2 = 'r1b1kbnr/pp3ppp/1qn1p3/3pP3/3P4/3B1N2/PP3PPP/RNBQK2R b KQkq - 0 7'; // after ...cxd4 cxd4: the chain is e5-d4
const TARR = 'r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 1'; // White's Bc1 is stuck: no d2-pawn, e3 pawn in the way
const FRENCH = 'r1b1kbnr/pp3ppp/1qn1p3/2ppP3/3P4/2PB1N2/PP3PPP/RNBQK2R b KQkq - 4 6';

const weaknesses = lesson(
  'strat-weaknesses', 'Identifying weaknesses', 'Strategic planning', 14,
  ['Make an inventory of weaknesses for both sides', 'Tell a target from a weakness you cannot attack', 'Find a hole: a square no pawn can ever guard'],
  [
    read(['A weakness is something the opponent can attack and you cannot easily repair: a pawn no other pawn can guard, a square no pawn can cover, a king without shelter, a piece with no good job.', 'Strategy starts with an inventory. Before you pick a plan, list the weaknesses on both sides of the board.'], board(IQP, { marks: [{ sq: 'd5', tone: 'bad' }] }), 'The inventory'),
    read(['Pawns first, because they never move back. Look for isolated, doubled and backward pawns, and for squares in front of them where an enemy piece can sit.', 'Then look at pieces (loose, or stuck behind pawns) and at the king. A weakness is only a target if you have pieces that can reach it.']),
    square('weak-iqp', 'Black has one pawn that no other Black pawn can ever defend. Click it.', board(IQP), ['d5'], ['Look at the pawns on the c-file and the e-file.', 'Pawns defend diagonally forward. Which Black pawn has no neighbour pawns?'], 'The d5-pawn is isolated: Black has no c-pawn and no e-pawn. Only pieces can guard it, so Black’s knights, bishops and queen are tied to that job. It is also a target for White’s knights, and the square in front of it, d4, is a safe outpost for White.', ['Click Black’s isolated pawn.']),
    ask('weak-iqp-why', 'Is the isolated d5-pawn a weakness White can exploit here, or only a feature of the structure?', ['It is a real target: the knight on c3 attacks it and the knight on d4 blockades it', 'It is only a feature: pawns cannot be attacked', 'It is not a weakness, because it is on a central file'], 0, ['Count how many White pieces point at d5.', 'A weakness is only worth something if you can bring attackers to it.'], 'The knight on c3 attacks d5, and the knight on d4 sits on the blockade square in front of the pawn, where no Black pawn can ever challenge it. Black must keep pieces tied to d5, which is the practical cost of an isolated pawn. The engine still rates this position as roughly balanced, because Black’s pieces are active, so treat the pawn as a long-term target, not an immediate win.', { board: board(IQP, { marks: [{ sq: 'd5', tone: 'bad' }, { sq: 'd4', tone: 'good' }, { sq: 'c3', tone: 'good' }] }) }),
    read(['A hole is a square that can no longer be guarded by a pawn. In this Sicilian position Black has played ...e5 and has no c-pawn, so no Black pawn can ever attack d5. That square is a permanent home for a White knight.'], board(NAJ, { marks: [{ sq: 'd5', tone: 'good' }, { sq: 'd6', tone: 'bad' }] }), 'A hole'),
    square('weak-hole', 'Click the hole in Black’s position: a square no Black pawn can ever guard, which a White knight can reach.', board(NAJ), ['d5'], ['Black’s pawn on e5 has passed d5’s guard square e6, and Black has no c-pawn.', 'A knight on c3 can reach it in one move.'], 'No Black pawn can guard d5 any more, since the e-pawn is on e5 and the c-pawn has gone. White’s knight can go there at once and cannot be driven away by a pawn.', ['Click the hole.']),
    move('weak-hole-go', 'White to move. Put a piece on the hole.', NAJ, ['c3d5'], ['The hole is d5. Which White piece can reach it?', 'The knight on c3 jumps to d5.'], 'Nd5 plants a knight on a square no pawn can challenge. Black can trade it off, but White then recaptures with the e-pawn and has a favourable structure. The engine finds Nd5 only a little behind its top choice, so this is a sound strategic move, not the only good one.', { soft: true, wrong: { c3b5: 'This knight move does not use the hole. The point is the square d5.' } }),
  ],
  [
    choice('sw-1', 'What is a hole?', ['A square that no pawn can ever guard again', 'A square with a piece on it', 'An empty file'], 0, 'Pawns cannot go backward, so squares in front of advanced or exchanged pawns can become permanently weak.'),
    sq('sw-2', 'Click the isolated pawn.', board(IQP), ['d5'], 'It has no friendly pawn on the c- or e-file.'),
    tf('sw-3', 'A weakness matters even if you have no piece that can attack it.', false, 'A weakness has to be reachable. Without attackers it is only a feature of the position.'),
    choice('sw-4', 'In the Sicilian position, why is d5 a hole?', ['Black has no pawn that can ever attack it', 'It is on the board’s edge', 'Black’s queen is on d8'], 0, 'No c-pawn and the e-pawn has passed e6, so only pieces can ever contest d5.', { board: board(NAJ, { marks: [{ sq: 'd5', tone: 'mark' }] }) }),
  ],
  { concepts: ['plan.weaknesses', 'position.hole'], reviewPhases: ['middlegame'] },
);

const worst = lesson(
  'strat-worst-piece', 'Improving your worst-placed piece', 'Strategic planning', 12,
  ['Find the piece that does the least', 'Choose a route that improves it without creating a weakness', 'Know when to trade it instead'],
  [
    read(['When there is no tactic and no clear plan, find your worst-placed piece and improve it. A single stuck piece means you are playing a piece down in the fight that matters.', 'Ask of each piece: how many useful squares does it have, and does it point at anything? The answer for the worst one is usually “almost none”.'], board(TARR, { marks: [{ sq: 'c1', tone: 'bad' }] }), 'One piece out of the game'),
    square('wp-find', 'White has developed everything except one piece. Click White’s worst-placed piece.', board(TARR), ['c1'], ['Compare how many squares each White piece can use.', 'One bishop is closed in by its own pawns on b2 and e3.'], 'The bishop on c1 is hemmed in by the pawns on b2 and e3 and has only the d2-square. White’s other pieces already have jobs. Bringing the bishop into play is the natural plan.', ['Click White’s worst-placed piece.']),
    move('wp-fix', 'White to move. Improve the stuck bishop with one pawn move that opens a diagonal for it.', TARR, ['b2b3'], ['The bishop wants a long diagonal.', 'Which pawn move lets it go to b2?'], 'b3 followed by Bb2 puts the bishop on the long diagonal, aimed at the black kingside. Other ideas (Re1, Qe2) are also reasonable, but this one improves the worst piece directly.', { soft: true, alt: ['d3e2'] }),
    read(['There is a second way: trade the piece. A bad bishop that cannot be freed is best exchanged for an enemy piece that is doing something. Sometimes the “worst piece” is the one you should offer, not improve.'], undefined, 'Improve or exchange'),
    ask('wp-q', 'You cannot find a tactic or a clear plan. What is a good practical question to ask?', ['Which of my pieces is doing the least, and how can I improve it?', 'Which pawn can I push next?', 'How can I trade my best piece?'], 0, ['Think about a plan that is almost always useful.'], 'Improving the worst piece is almost never a mistake. Pushing pawns weakens squares permanently, and trading your best piece gives away your advantage.', { wrong: { 1: 'Pawn moves are permanent. Make sure you want them before you play them.' } }),
  ],
  [
    choice('wp-1', 'Which piece should you usually improve first?', ['The one doing the least', 'The queen', 'The most advanced pawn'], 0, 'Raising the worst piece adds the most to the position.'),
    sq('wp-2', 'Click White’s least active piece.', board(TARR), ['c1'], 'The c1-bishop sees only one square.'),
    tf('wp-3', 'Trading a bad bishop is sometimes better than rerouting it.', true, 'If it cannot be freed, exchanging it for a good enemy piece solves the problem.'),
    choice('wp-4', 'A pawn move that frees a bishop should also…', ['Not create a new weakness', 'Always be a double step', 'Be played on the kingside'], 0, 'Every pawn move is permanent, so check what squares it leaves behind.'),
  ],
  { concepts: ['plan.worst-piece', 'principle.activity'], reviewPhases: ['middlegame'] },
);

const plans = lesson(
  'strat-plans', 'Creating and executing plans', 'Strategic planning', 15,
  ['Turn an inventory of weaknesses into a plan', 'Follow the order: assess, choose a plan, prepare, execute', 'Recognise the minority attack as a plan that follows from the structure'],
  [
    read(['A plan is a series of moves with one aim. A good one comes from the position, not from the pieces you like. The method: assess both sides, choose the aim, then ask what has to happen first.', 'The aim is usually to create or attack a weakness, or to improve your pieces towards that.'], undefined, 'From inventory to plan'),
    read(['This is the Carlsbad structure. On the queenside White has two pawns (a2, b2) against Black’s three (a7, b7, c6): a minority.', 'The plan that follows is the minority attack: advance the b-pawn to b5 to trade it for Black’s c6-pawn, leaving Black a weak pawn on c6 (or an isolated pawn on d5) to attack.'], board(CARL, { marks: [{ sq: 'b2', tone: 'good' }, { sq: 'a2', tone: 'good' }, { sq: 'c6', tone: 'bad' }] }), 'The Carlsbad structure'),
    demo('The minority attack', board(CARL), [
      ['b2b4', 'The plan starts: the b-pawn advances. Two pawns (a and b) go forward against three.'],
      ['a7a6', 'Black prepares to meet b5 with ...axb5 or ...cxb5.'],
      ['a2a4', 'The a-pawn supports b5. White wants to get b5 in.'],
      ['f6e4', 'Black seeks counterplay in the centre with a knight on e4.'],
      ['g5e7', 'White trades the bishop on g5 for Black’s bishop, removing a defender and keeping the b-pawn plan going.'],
      ['d8e7', 'Black recaptures; White’s plan is still intact.'],
    ], 'A line from the position. The engine’s own choice on move one is b4, followed by a4.'),
    move('plan-b4', 'White to move. Begin the minority attack.', CARL, ['b2b4'], ['The plan needs the b-pawn to advance.', 'Your rook is already on the b-file to support it.'], 'b4 starts the minority attack. The engine also picks b4 as its top choice here, which is a good check that the plan follows from the structure.'),
    ask('plan-why', 'Why attack with fewer pawns (a minority) on the queenside?', ['To exchange pawns and leave Black with a weak pawn on c6 or an isolated d5', 'To checkmate the black king directly', 'To win the c-pawn at once'], 0, ['Think about what is left after b5 and ...cxb5.'], 'After b5 the exchange of a pawn leaves Black with a backward c-pawn or an isolated pawn to defend, and White’s rooks gain the open b-file.', { wrong: { 1: 'It is a positional plan, not a direct attack on the king.' } }),
  ],
  [
    choice('pl-1', 'What is the first step in making a plan?', ['Assess the weaknesses and pieces of both sides', 'Push a pawn', 'Trade queens'], 0, 'A good plan grows out of the position.'),
    choice('pl-2', 'The minority attack is…', ['Advancing fewer pawns against more to create a target', 'Giving up material', 'An opening trap'], 0, 'The point is the structure left behind.'),
    move_q(),
    tf('pl-4', 'A plan often needs preparation moves before the key pawn advance.', true, 'Rooks, pieces and the pawn chain are arranged first.'),
  ],
  { concepts: ['plan.minority-attack', 'plan.method'], reviewPhases: ['middlegame'] },
);
function move_q() {
  return choice('pl-3', 'Which plan fits this structure for White?', ['b4-b5, the minority attack', 'f2-f4 and a kingside attack', 'Moving the king to the queenside'], 0, 'With a queenside pawn minority and a semi-open b-file, the minority attack is the structure’s natural plan.', { board: board(CARL, { marks: [{ sq: 'b2', tone: 'mark' }] }) });
}

const restrict = lesson(
  'strat-restrict', 'Restricting opponent activity', 'Strategic planning', 12,
  ['Know that stopping the opponent’s plan is part of yours', 'Control the squares and breaks the opponent needs', 'Use a spatial bind to limit counterplay'],
  [
    read(['Restriction means taking away the opponent’s good moves, so that every plan they have is already answered. If you do it well, the opponent runs out of useful moves and has to weaken themselves.', 'In practice: identify the pawn break or the outpost your opponent wants, and put a piece or a pawn where it hurts the idea.'], undefined, 'Take squares away'),
    read(['In this French structure Black’s breaks are ...cxd4 (against the base of the chain) and later ...f6 (against its head). Meanwhile White’s e5 pawn cramps Black’s position and keeps the bishop on c8 out of play.'], board(FRENCH, { marks: [{ sq: 'e5', tone: 'good' }, { sq: 'd4', tone: 'good' }, { sq: 'c8', tone: 'bad' }] }), 'A bind'),
    ask('res-q', 'In the French position, which Black piece is most restricted by White’s pawn chain?', ['The bishop on c8', 'The queen on b6', 'The king on e8'], 0, ['Look at which of Black’s pieces is blocked by its own pawns and White’s chain.'], 'The c8-bishop is shut in by Black’s own pawns on e6 and d5, which White’s e5/d4 chain fixes in place. It is the French Defence’s traditional “bad bishop”.', { board: board(FRENCH), wrong: { 1: 'The queen is active on b6, attacking b2.' } }),
    move('res-break', 'Black to move. Challenge the centre with the pawn break the French is built on.', FRENCH, ['c5d4'], ['Black wants to attack White’s base pawn on d4.', 'Which pawn capture opens the c-file?'], 'cxd4 attacks the chain. If White recaptures cxd4, the pawn on d4 becomes the base of the e5-d4 chain, and Black’s queen on b6 and knight on c6 both pressure it. This is the opposite of restriction: it is how the side being restricted fights back.', { soft: true, orientation: 'black' }),
  ],
  [
    choice('re-1', 'Restricting the opponent means…', ['Taking away their useful moves and breaks', 'Trading as many pieces as possible', 'Attacking the king immediately'], 0, 'The side with fewer useful moves runs out of good plans first.'),
    tf('re-2', 'A pawn chain can restrict the opponent’s bishops.', true, 'The French chain on e5/d4 keeps Black’s light-squared bishop in.'),
    choice('re-3', 'The side being restricted usually fights back with…', ['A pawn break that attacks the chain', 'More pawn moves in front of the king', 'Giving up the queen'], 0, 'Attack the base of the chain, as with ...c5.'),
  ],
  { concepts: ['plan.restriction', 'position.space'], reviewPhases: ['middlegame'] },
);

const exch = lesson(
  'strat-exchanges', 'Strategic exchanges', 'Strategic planning', 13,
  ['Decide which pieces to trade and which to keep', 'Trade the opponent’s best piece for your worst', 'Trade when it simplifies a won position or relieves a cramped one'],
  [
    read(['Every trade changes the position. Before you capture, ask three questions: what does this piece do for me, what does it do for my opponent, and what does the position look like afterwards?', 'The best trades remove an enemy defender, a good piece, or a piece your own pieces would otherwise be in the way of.'], undefined, 'Which pieces?'),
    read(['Here White’s dark-squared bishop on g5 pins the f6-knight and eyes the kingside. Black’s bishop on e7 defends it. The trade of White’s bishop for Black’s knight on f6 would damage Black’s structure and remove a key defender of the king.'], board(CARL, { marks: [{ sq: 'g5', tone: 'good' }, { sq: 'f6', tone: 'bad' }] }), 'Taking a defender'),
    ask('ex-q', 'You are cramped. Which kind of trade usually helps you most?', ['Trade a piece to free your position', 'Trade your best attacking piece', 'Avoid all trades'], 0, ['Think about how crowded pieces get in each other’s way.'], 'A cramped position benefits from exchanges because pieces get in each other’s way. Fewer pieces means more room for those left.', { wrong: { 2: 'Avoiding trades keeps you cramped.' } }),
    ask('ex-q2', 'You are ahead in material. What is usually good?', ['Trade pieces, not pawns', 'Trade pawns, keep pieces', 'Keep everything on the board'], 0, ['Think about what the stronger side wants to show off.'], 'When ahead, trading pieces makes your extra material count and reduces the opponent’s counterplay. Pawns are what you want to keep.', { wrong: { 1: 'Trading pawns leaves fewer pawns to promote and makes a draw likelier.' } }),
    move('ex-trade', 'White to move. Trade the bishop on g5 for the f6-knight.', CARL, ['g5f6'], ['The bishop on g5 can capture a defender.', 'Which piece is on f6?'], 'Bxf6 removes a knight that guards d5 and the kingside. It is a sound strategic trade; whether it is the engine’s very first choice is secondary to the idea of trading for a defender.', { soft: true }),
  ],
  [
    choice('se-1', 'What is a good question before a trade?', ['What does this piece do for each side afterwards?', 'How many points is it worth?', 'Is it my turn?'], 0, 'Evaluate the position after the trade.'),
    choice('se-2', 'If you are cramped, exchanges usually…', ['Help you', 'Hurt you', 'Make no difference'], 0, 'Fewer pieces means more space.'),
    tf('se-3', 'When ahead in material, trade pieces rather than pawns.', true, 'Pieces trades reduce counterplay; pawns are needed to win.'),
    choice('se-4', 'A good trade often removes…', ['An enemy defender or their best piece', 'Your own best piece', 'A random pawn'], 0, 'It should improve your position relative to theirs.'),
  ],
  { concepts: ['plan.exchanges', 'principle.activity'], reviewPhases: ['middlegame'] },
);

const breaks = lesson(
  'strat-breaks', 'Pawn breaks', 'Strategic planning', 13,
  ['Define a pawn break', 'Find the break that attacks the base of an enemy chain', 'Prepare a break before playing it'],
  [
    read(['A pawn break is a pawn move that challenges the opponent’s pawn structure and opens lines for your pieces. Closed positions are decided by breaks.', 'The principle: attack a pawn chain at its base. Attacking the head does little because the chain protects it.'], board(FRENCH, { marks: [{ sq: 'd4', tone: 'bad' }, { sq: 'c5', tone: 'good' }] }), 'Hit the base'),
    demo('Breaking the chain', board(FRENCH), [
      ['c5d4', 'Black breaks at the base of White’s chain: ...cxd4.'],
      ['c3d4', 'White recaptures, and now d4 is attacked by the knight and the queen.'],
      ['c8d7', 'Black develops the passive bishop, keeping the pressure.'],
      ['e1g1', 'White castles. The d4-pawn is defended, and the position is open for play.'],
    ]),
    ask('br-q', 'Where do you attack a pawn chain?', ['At its base', 'At its head', 'At its centre'], 0, ['Which pawn in a chain has no pawn protecting it?'], 'The base pawn is not protected by another pawn (in e5-d4 the base is d4), so removing it brings the chain down. The head pawn is protected by the next pawn in the chain.', { wrong: { 1: 'The head is protected by the pawn behind it.' } }),
    move('br-play', 'Black to move. Break at the base of White’s chain.', FRENCH, ['c5d4'], ['The base of White’s chain is the d4-pawn.', 'Which of your pawns can capture it?'], 'cxd4 hits the chain. After cxd4 the pawn on d4 is the base of the e5-d4 chain, and Black’s Nc6, Qb6 and later ...Bd7 and ...Nb4 all aim at it. Nxd4 is also possible; either way Black gets a target.', { soft: true, orientation: 'black' }),
    ask('br-prep', 'Why is it often wrong to play a pawn break at once?', ['It may leave you worse prepared than the opponent for the open position', 'Pawn breaks are always illegal early', 'A break only works on the kingside'], 0, ['What do you need in place when the position opens?'], 'A break opens lines. If your pieces are not ready (rooks on the right files, king safe) the opponent profits from the opened lines. Prepare, then break.', { wrong: { 1: 'Breaks are legal early; the issue is preparation.' } }),
  ],
  [
    choice('pb-1', 'A pawn break…', ['Challenges the opponent’s pawn structure and opens lines', 'Wins a pawn', 'Is always a sacrifice'], 0, 'Breaks change the structure.'),
    choice('pb-2', 'Where should you attack a chain?', ['At the base', 'At the head', 'Nowhere'], 0, 'The base has no pawn protection.'),
    sq('pb-3', 'White has the chain e5-d4. Click its base.', board(FRENCH2), ['d4'], 'e5 is protected by d4, but nothing protects d4. The base is the pawn that does not depend on another pawn.'),
    tf('pb-4', 'Prepare a break before playing it.', true, 'Your pieces must be ready for the open lines.'),
  ],
  { concepts: ['plan.pawn-break', 'position.pawn-chain'], reviewPhases: ['middlegame'] },
);

const against = lesson(
  'strat-against-weaknesses', 'Playing against weaknesses', 'Strategic planning', 14,
  ['Attack a weakness with more pieces than defend it', 'Fix the target so it cannot move away', 'Use the knight on a hole, then the rooks on the open file'],
  [
    read(['To play against a weakness: fix it (so it cannot be repaired), attack it with more pieces than defend it, and keep your own position solid.', 'A pawn that can still advance is not a stable target. Block it or the squares it needs first.'], board(NAJ, { marks: [{ sq: 'd6', tone: 'bad' }, { sq: 'd5', tone: 'good' }] }), 'Fix, then attack'),
    demo('Playing against d6', board(NAJ), [
      ['c3d5', 'The knight lands on the hole. It cannot be driven away by a pawn and it eyes f6, b6 and c7.'],
      ['f6d5', 'Black trades the knight.'],
      ['e4d5', 'The pawn recaptures and attacks the e6-bishop, gaining time.'],
      ['e6f5', 'The bishop leaves e6. White has gained a tempo and a space advantage in the centre.'],
    ]),
    square('aw-q', 'Which Black pawn can White’s heavy pieces pressure along the open d-file? Click it.', board(NAJ), ['d6'], ['It is on the same file as White’s rook and queen.', 'No pawn protects it.'], 'The d6-pawn cannot advance safely or be defended by a pawn, since Black has no c-pawn and the e-pawn has moved on. White’s queen and rook on the d-file attack it, so Black has to tie pieces to its defence.', ['Click the pawn on the d-file.']),
    ask('aw-q2', 'What is the practical test of whether a weakness is worth attacking?', ['Can I attack it with more pieces than defend it?', 'Is it on the queenside?', 'Is it a pawn?'], 0, ['Think of counting attackers and defenders.'], 'Weaknesses win games only when the attackers outnumber the defenders. Count them before you commit.', { wrong: { 2: 'Weaknesses can be squares or pieces too.' } }),
  ],
  [
    choice('aw-1', 'Before attacking a weakness, you should…', ['Fix it so it cannot be repaired', 'Ignore your own position', 'Trade your attackers'], 0, 'A moving target is hard to attack.'),
    sq('aw-2', 'Click the backward pawn that White can attack.', board(NAJ), ['d6'], 'It is attackable on the open d-file.'),
    tf('aw-3', 'You need more attackers than defenders to win a weakness.', true, 'Otherwise the defender holds.'),
    choice('aw-4', 'A knight on a hole mainly…', ['Cannot be driven away by a pawn', 'Is always worth a queen', 'Wins a pawn at once'], 0, 'Permanent outposts are strategic assets.'),
  ],
  { concepts: ['plan.attack-weakness', 'position.backward-pawn'], reviewPhases: ['middlegame'] },
);

const convert = lesson(
  'strat-converting', 'Converting positional advantages', 'Strategic planning', 14,
  ['Turn a lasting edge into something concrete', 'Increase the pressure on a second front', 'Do not rush when you have a long-term edge'],
  [
    read(['A positional advantage (better structure, more space, better pieces) does not win on its own. You must convert it into something concrete: win a pawn, create a passed pawn, or reach a winning ending.', 'The method: keep the edge, avoid unnecessary risk, and look for a second weakness. Two weaknesses overload the defence.'], undefined, 'Edge to win'),
    ask('cv-q', 'You have a lasting edge but no immediate way to win material. What is usually best?', ['Improve your position and look for a second weakness', 'Sacrifice a piece for an attack', 'Offer a draw'], 0, ['A long-term edge rewards patience.'], 'Do not give the advantage away with a rash move. Improve your pieces, restrict counterplay, and create a second target so the defender cannot cover both.', { wrong: { 1: 'A speculative sacrifice throws the advantage away.' } }),
    ask('cv-q2', 'You are better and the opponent offers a trade of queens. What should you consider?', ['Whether the endgame makes your advantage easier to win', 'Always refuse', 'Always accept'], 0, ['Think about what the structure looks like without queens.'], 'Trades are good when the resulting ending leaves you a clear structural plus such as a better pawn majority or a passed pawn.', { wrong: { 1: 'Refusing without a reason keeps risk in the position.' } }),
    read(['A concrete way to convert: create a passed pawn from a pawn majority, then use a knight to block it and your king to support it. That is exactly the kind of endgame you studied in the Positional course.']),
  ],
  [
    choice('cv-1', 'To convert an advantage you often need…', ['A second weakness to attack', 'A random pawn push', 'To avoid all trades'], 0, 'Two targets overload the defence.'),
    tf('cv-2', 'A positional edge wins on its own without effort.', false, 'It must be converted into something concrete.'),
    choice('cv-3', 'When you are better, rash sacrifices…', ['Often throw away the edge', 'Always win', 'Are required'], 0, 'Patience and safety usually beat speculation.'),
    choice('cv-4', 'A good endgame to aim for when better is…', ['One where you have a clear structural plus', 'Any endgame', 'One with all the pieces'], 0, 'Choose trades with a purpose.'),
  ],
  { concepts: ['plan.conversion', 'plan.method'], reviewPhases: ['middlegame', 'endgame'] },
);

export const stratAssess: Chapter = {
  id: 'strat-chapter-assess', title: 'See, plan, restrict', blurb: 'Weaknesses, the worst piece, plans and restriction.',
  lessons: [weaknesses, worst, plans, restrict],
  check: [
    choice('sc1-1', 'What is a hole?', ['A square no pawn can ever guard', 'An empty file', 'A captured pawn'], 0, 'Pawns cannot go backward.'),
    sq('sc1-2', 'Click White’s worst-placed piece.', board(TARR), ['c1'], 'Hemmed in by b2 and e3.'),
    choice('sc1-3', 'The first step in making a plan is…', ['Assess the weaknesses of both sides', 'Push a pawn', 'Trade queens'], 0, 'Plans grow from the position.'),
    choice('sc1-4', 'The French pawn chain restricts…', ['Black’s light-squared bishop', 'White’s knights', 'Both kings'], 0, 'The e6 and d5 pawns plus White’s chain keep it shut in.', { board: board(FRENCH) }),
  ],
};
export const stratExecute: Chapter = {
  id: 'strat-chapter-execute', title: 'Exchanges, breaks and conversion', blurb: 'Carrying a plan through.',
  lessons: [exch, breaks, against, convert],
  check: [
    choice('sc2-1', 'When ahead, trade…', ['Pieces, not pawns', 'Pawns, not pieces', 'Nothing'], 0, 'Pawns matter for the win.'),
    choice('sc2-2', 'Where do you attack a pawn chain?', ['At its base', 'At its head', 'Nowhere'], 0, 'The base has no pawn protection.'),
    sq('sc2-3', 'Click the backward pawn White can attack on the d-file.', board(NAJ), ['d6'], 'The queen and rook are on the d-file.'),
    tf('sc2-4', 'A positional advantage must be converted into something concrete.', true, 'It wins only when it becomes material, a passed pawn or a winning ending.'),
  ],
};

export const strategyCourse: Course = {
  id: 'strategy', title: 'Strategic planning', level: 'intermediate',
  blurb: 'How to choose a plan: find weaknesses, improve your pieces, restrict the opponent, trade with purpose, prepare pawn breaks and convert an edge.',
  requires: ['positional'],
  chapters: [stratAssess, stratExecute],
  assessment: [
    choice('sa-1', 'What do you look for first when forming a plan?', ['Weaknesses on both sides', 'A flashy sacrifice', 'A pawn to push'], 0, 'Plans come from the position.', { lesson: 'strat-weaknesses' }),
    sq('sa-2', 'Click the isolated pawn.', board(IQP), ['d5'], 'No pawns on c or e.', { lesson: 'strat-against-weaknesses' }),
    choice('sa-3', 'The minority attack aims to…', ['Create a weakness in the opponent’s structure', 'Win a piece at once', 'Mate the king'], 0, 'The structure left behind is the target.', { lesson: 'strat-plans' }),
    tf('sa-4', 'A weakness is only useful if you can attack it.', true, 'You need reachable targets.', { lesson: 'strat-weaknesses' }),
    choice('sa-5', 'The best trades often remove…', ['An enemy defender or their best piece', 'Your own best piece', 'Random pawns'], 0, 'Trade with a purpose.', { lesson: 'strat-exchanges' }),
    choice('sa-6', 'To play a pawn break safely you need…', ['Preparation: pieces and king ready', 'Nothing', 'A queen trade'], 0, 'Open lines help the better prepared side.', { lesson: 'strat-breaks' }),
    sq('sa-7', 'Click the hole in the Sicilian position.', board(NAJ), ['d5'], 'No Black pawn can guard it.', { lesson: 'strat-worst-piece' }),
    choice('sa-8', 'When you are cramped, exchanges…', ['Usually help', 'Usually hurt', 'Make no difference'], 0, 'Pieces get more room.', { lesson: 'strat-restrict' }),
  ],
};
