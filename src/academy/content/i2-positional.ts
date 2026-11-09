import type { Chapter, Course } from '../types';
import { ask, board, choice, demoSan, fenAfter, lesson, mqSan, moveSan, read, reach, sq, square, tf } from './dsl';

/* Positions: real opening lines (played from the start) or small constructed positions with a king, pieces and pawns for both sides.
   Constructed positions are teaching positions: the lessons say what the structure means, and they do not claim who is winning. */
const FR3 = fenAfter('e4 e6 d4 d5 e5');
const FRCHAIN = fenAfter('e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 Bd3 cxd4 cxd4');
const SCOTCH = fenAfter('e4 e5 Nf3 Nc6 d4');
const IQP = 'r4rk1/pp3ppp/2n5/3p4/3N4/2P5/PP3PPP/R4RK1 w - - 0 1';
const NIMZO = fenAfter('d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O Nc6 a3 Bxc3 bxc3');
const NAJ = fenAfter('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O');
const NAJ_E5 = fenAfter('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5');
const PASSED = '3r2k1/pp3ppp/8/3P4/8/6P1/PP3P1P/3R2K1 w - - 0 1'; // White has a passed d-pawn and a rook on the d-file
const MAJ = '3r2k1/pp3ppp/8/8/8/8/PPP2PPP/3R2K1 w - - 0 1'; // White 3 pawns against 2 on the queenside
const OUTPOST = 'r3kb1r/pp3ppp/3p4/3N4/4P3/8/PP3PPP/R3KB1R w KQkq - 0 1';
const BAD = '2b3k1/1p3p1p/2p1p1p1/3p4/3P4/2PBP1P1/1P3P1P/6K1 w - - 0 1'; // Black bishop shut in by its own pawns on light squares
const KID = fenAfter('d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7 Ne1 Nd7 Be3');
const OPEN_C = fenAfter('e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4 Ba6');
const FILES = 'r4rk1/pp3ppp/8/8/8/8/PP3PPP/R4RK1 w - - 0 1';
const SEVENTH = 'r5k1/5ppp/8/8/8/8/R4PPP/6K1 w - - 0 1';
const RIM = '3rk3/pp1n1ppp/2p5/8/8/N7/PPP2PPP/3RK3 w - - 0 1';
const ITALIAN = fenAfter('e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O');

const space = lesson(
  'pos-space', 'Space', 'Space and the centre', 12,
  ['Explain what “more space” means', 'See why the side with space has more room for its pieces', 'Know the risk: advanced pawns can become targets'],
  [
    read(['Space means controlling more squares, usually with pawns that stand further forward than the opponent’s. A side with space has more squares for its pieces and a cramped opponent has to wait or trade.', 'Count the squares your pieces can use, and the squares the opponent cannot use.'], board(FR3, { marks: [{ sq: 'e5', tone: 'good' }, { sq: 'd4', tone: 'good' }, { sq: 'f6', tone: 'bad' }, { sq: 'd7', tone: 'bad' }] }), 'More room'),
    ask('sp-who', 'In this French Advance position, who has more space?', ['White: the pawn on e5 takes f6 and d6 away from Black', 'Black: the pawns are on the third rank', 'Neither: the pawns are symmetrical'], 0, ['Compare how far forward each side’s pawns stand.', 'Which Black knight move is now impossible?'], 'White’s pawn on e5 attacks d6 and f6, so Black’s knight cannot go to f6 without being challenged. White’s pawns also stand further forward. That is a space advantage.', { board: board(FR3, { marks: [{ sq: 'e5', tone: 'good' }] }), wrong: { 1: 'Black has pawns on e6 and d5, which are further back than White’s e5.', 2: 'They are not symmetrical: White’s e-pawn has advanced to e5.' } }),
    moveSan('sp-gain', 'White to move. Gain space in the centre with a pawn move.', 'e4 e6 d4 d5', 'e5', ['Which pawn can go further forward?', 'The pawn on e4 can advance to e5.'], 'e5 is the Advance Variation: it takes space and cramps Black’s knight. It also fixes the pawn structure, so Black must work to break it with ...c5. Nc3 passes the engine check as a sound choice, though not the only good one.', { soft: true, alt: ['Nc3', 'Nd2'] }),
    read(['Space has a price. Pawns that have moved forward cannot go back, and the squares behind them can become weak. A cramped opponent will try to exchange pieces to gain room and to hit the pawn chain.'], undefined, 'The price of space'),
  ],
  [
    choice('sp-1', 'More space usually means…', ['Controlling more squares', 'Having more pieces', 'Having castled'], 0, 'Space is about the squares you control.'),
    tf('sp-2', 'A cramped side often benefits from exchanging pieces.', true, 'Fewer pieces means less crowding.'),
    choice('sp-3', 'A risk of advancing pawns is…', ['They can become targets and leave weak squares behind', 'They cannot be captured', 'It is illegal'], 0, 'Overextended pawns need support.'),
    sq('sp-4', 'Click the White pawn that gives White the space advantage.', board(FR3), ['e5'], 'The pawn on e5 takes d6 and f6 away from Black’s pieces.'),
  ],
  { concepts: ['position.space'], reviewPhases: ['opening', 'middlegame'] },
);

const centre = lesson(
  'pos-centre', 'Control of the centre', 'Space and the centre', 13,
  ['Say why central squares matter', 'Know the choice when the centre is tense: exchange, keep tension, or advance', 'Open the centre only when you are better developed'],
  [
    read(['The central squares (d4, e4, d5, e5) are close to everything. A piece there reaches both wings quickly. Controlling them gives you the ability to switch play.', 'When pawns face each other in the centre, the position is tense. You can capture, advance, or keep the tension.'], undefined, 'Why the centre'),
    square('ce-sq', 'Click the four central squares.', board('empty'), ['d4', 'e4', 'd5', 'e5'], ['They are on files d and e, ranks 4 and 5.'], 'd4, e4, d5 and e5 are the four central squares.', ['Click d4.', 'Click e4.', 'Click d5.', 'Click e5.']),
    read(['After 3.d4 Black has a choice. The pawns on d4 and e5 are in contact. Capturing with exd4 opens the centre; keeping the tension would allow dxe5 or d5.'], board(SCOTCH, { marks: [{ sq: 'd4', tone: 'mark' }, { sq: 'e5', tone: 'mark' }] }), 'Tension'),
    moveSan('ce-resolve', 'Black to move. Resolve the central tension by capturing.', 'e4 e5 Nf3 Nc6 d4', 'exd4', ['The pawns on e5 and d4 attack each other.', 'Capturing opens the e-file for Black.'], 'exd4 resolves the tension. After Nxd4 White’s knight is central, but Black develops with ...Nf6. Black could also keep the tension with ...Nxd4 or ...d6; the engine checked that exd4 is sound.', { soft: true, orientation: 'black', alt: ['Nxd4'] }),
    ask('ce-when', 'When is it a good idea to open the centre?', ['When your pieces are developed and your king is safe', 'Whenever you can', 'Never'], 0, ['An open centre rewards the better prepared side.'], 'Opening lines helps the side with better development and the safer king. If you are behind, keep the centre closed.', { wrong: { 1: 'Opening the centre early often helps the opponent.' } }),
  ],
  [
    choice('cen-1', 'Which are the central squares?', ['d4, e4, d5, e5', 'a1, a8, h1, h8', 'b2, g2, b7, g7'], 0, 'The four central squares.'),
    tf('cen-2', 'Pieces can control the centre from a distance.', true, 'Pieces from the flanks can aim at the centre.'),
    choice('cen-3', 'You should open the centre when…', ['You are better developed', 'Your king is exposed', 'You are behind'], 0, 'Open lines favour the side with better prepared pieces.'),
    mqSan('cen-4', 'Black to move. Capture to open the centre.', 'e4 e5 Nf3 Nc6 d4', ['exd4'], 'exd4 resolves the tension.', { orientation: 'black', soft: true }),
  ],
  { concepts: ['position.centre', 'principle.centre'], reviewPhases: ['opening', 'middlegame'] },
);

const structure = lesson(
  'pos-structure', 'Pawn structure basics', 'Pawn structure', 12,
  ['Know that pawns decide the shape of the game', 'Find the head and the base of a pawn chain', 'Tell why structure is permanent'],
  [
    read(['Pawns cannot move backward and only capture forward, so every pawn move is permanent. The pawn structure fixes where pieces belong and where the weaknesses are, and it stays for much of the game.', 'The four basic weaknesses are isolated, doubled, backward and (the opposite, an asset) passed pawns. The next lessons take them in turn.'], undefined, 'Permanent decisions'),
    read(['A pawn chain is a diagonal line of pawns, each protected by the one behind. The head is the front pawn; the base is the rear pawn that no pawn protects. Attack the base: if it falls, the whole chain loses its support.'], board(FRCHAIN, { marks: [{ sq: 'e5', tone: 'mark' }, { sq: 'd4', tone: 'bad' }] }), 'Head and base'),
    square('str-chain', 'White has a pawn chain e5-d4. Click the base of the chain, then its head.', board(FRCHAIN), ['d4', 'e5'], ['The base is the pawn that no other pawn protects.', 'The head is the front pawn, protected by the base.'], 'd4 is the base because nothing protects it; e5 is the head and is protected by d4.', ['Click the base of the chain.', 'Click the head of the chain.']),
    ask('str-q', 'Why attack a chain at its base?', ['The base has no pawn protecting it; if it falls the chain collapses', 'The base is the most valuable pawn', 'The head cannot be attacked'], 0, ['Which pawn is not protected by another pawn?'], 'Remove the base and the head loses its protection too. The head is protected by the pawn behind it.', { board: board(FRCHAIN), wrong: { 2: 'The head can be attacked, but it is protected by the base.' } }),
  ],
  [
    tf('stc-1', 'Pawns can move backward when needed.', false, 'They only advance.'),
    sq('stc-2', 'Click the base of White’s pawn chain.', board(FRCHAIN), ['d4'], 'Nothing protects d4.'),
    choice('stc-3', 'The pawn structure tells you…', ['Where pieces belong and where the weaknesses are', 'Who will win', 'Nothing important'], 0, 'It guides plans.'),
    choice('stc-4', 'Where do you usually attack a pawn chain?', ['At its base', 'At its head', 'Nowhere'], 0, 'The base is not protected by a pawn.'),
  ],
  { concepts: ['position.pawn-structure', 'position.pawn-chain'], reviewPhases: ['middlegame'] },
);

const isolated = lesson(
  'pos-isolated', 'Isolated pawns', 'Pawn structure', 14,
  ['Recognise an isolated pawn and the square in front of it', 'Know that only pieces can defend it, and that it also gives its owner activity', 'Attack it by trading the pieces that defend it'],
  [
    read(['An isolated pawn has no friendly pawns on the neighbouring files, so no pawn can ever defend it. Its defenders must be pieces, which ties them down. The square directly in front of it is a perfect post for an enemy knight.', 'The pawn also brings activity: Black’s pieces have more room, and the half-open lines can be used for attack. The balance between these is the whole story.'], board(IQP, { marks: [{ sq: 'd5', tone: 'bad' }, { sq: 'd4', tone: 'good' }] }), 'An isolated pawn'),
    square('iso-find', 'Click the isolated pawn.', board(IQP), ['d5'], ['Look for the pawn with no pawn on the c-file or e-file.'], 'Black’s d-pawn is isolated: there are no Black pawns on the c- or e-file. The square in front of it, d4, is a blockade square.', ['Click the isolated pawn.']),
    ask('iso-block', 'Which White piece already sits on the blockading square?', ['The knight on d4', 'The pawn on c3', 'The rook on a1'], 0, ['The blockade square is directly in front of the isolated pawn.'], 'The knight on d4 blocks the pawn and cannot be attacked by a pawn. Knights are the best blockaders because they do not lose power when blocked.', { board: board(IQP, { marks: [{ sq: 'd4', tone: 'good' }] }) }),
    moveSan('iso-pressure', 'White to move. Increase the pressure on the isolated pawn with a rook move.', IQP, 'Rfd1', ['The pawn is attacked best by pieces on its file.', 'Which rook belongs on the d-file?'], 'Rfd1 puts the rook behind the blockading knight, aimed at d5. White then threatens to add more attackers than Black has defenders. The engine checked that Rfd1 is sound.', { soft: true, alt: ['Rad1'] }),
    ask('iso-trade', 'How do you win an isolated pawn?', ['Attack it with more pieces than defend it, and trade the defenders', 'Push your own pawn next to it', 'Ignore it'], 0, ['Think of it as a target that needs defenders.'], 'The pawn falls when you attack it more often than it is defended, so exchanging its defenders is the plan.', { wrong: { 1: 'Pushing pawns does not remove its defenders.' } }),
  ],
  [
    sq('isq-1', 'Click the isolated pawn.', board(IQP), ['d5'], 'No friendly pawns on c or e.'),
    tf('isq-2', 'An isolated pawn can be defended by neighbouring pawns.', false, 'There are none.'),
    choice('isq-3', 'A plus of an isolated pawn is…', ['More piece activity for its owner', 'It cannot be attacked', 'It can capture backward'], 0, 'The pieces often get more room.'),
    choice('isq-4', 'The best blockader of an isolated pawn is usually…', ['A knight', 'The king', 'A pawn'], 0, 'Knights keep their power when blocked.', { board: board(IQP) }),
  ],
  { concepts: ['position.isolated-pawn'], reviewPhases: ['middlegame'] },
);

const doubled = lesson(
  'pos-doubled', 'Doubled pawns', 'Pawn structure', 13,
  ['Recognise doubled pawns', 'Say why they are usually a weakness', 'Know what compensation looks like'],
  [
    read(['Doubled pawns are two pawns of the same colour on the same file. They cannot protect each other, they can block each other, and they control fewer squares than two pawns side by side.', 'They are accepted when they give something back: an open file, the bishop pair, or control of key squares.'], board(NIMZO, { marks: [{ sq: 'c3', tone: 'bad' }, { sq: 'c4', tone: 'bad' }] }), 'Doubled c-pawns'),
    square('dbl-find', 'This is the Nimzo-Indian after ...Bxc3 and bxc3. Click White’s doubled pawn that stands further back.', board(NIMZO), ['c3'], ['There are two White pawns on the c-file.', 'Which one is on the third rank?'], 'White has pawns on c3 and c4. The pawn on c3 is the rear one. Black gave the bishop for a knight to cause this.', ['Click the rear doubled pawn.']),
    ask('dbl-comp', 'What does White get for the doubled pawns?', ['The bishop pair and the half-open b-file', 'A passed pawn', 'A mating attack'], 0, ['Look at White’s bishops and at the b-file.'], 'White has two bishops against a bishop and knight, and the b-file is open for the rook. These are the compensation. Whether it is enough depends on the position; the engine considers the lines roughly level.', { board: board(NIMZO), wrong: { 1: 'White has no passed pawn here.' } }),
    ask('dbl-why', 'Why are doubled pawns weak?', ['They cannot protect each other and they restrict each other', 'They are worth less', 'They are illegal'], 0, ['Pawns protect diagonally forward.'], 'Pawns on the same file are not diagonal neighbours, so they cannot protect one another, and the rear pawn is blocked by the front one.', { board: board(NIMZO), wrong: { 1: 'Each pawn is still worth one point; the weakness is structural.' } }),
  ],
  [
    sq('dbq-1', 'Click the rear doubled pawn.', board(NIMZO), ['c3'], 'The pawns on c3 and c4 are doubled.'),
    tf('dbq-2', 'Doubled pawns are on the same file.', true, 'That is the definition.'),
    choice('dbq-3', 'Compensation for doubled pawns can be…', ['The bishop pair and an open file', 'A castled king', 'An extra move'], 0, 'Something that offsets the weakness.'),
    choice('dbq-4', 'Why can doubled pawns be a weakness?', ['They cannot protect each other', 'They are heavy', 'They cannot be captured'], 0, 'Pawns protect diagonally.'),
  ],
  { concepts: ['position.doubled-pawn'], reviewPhases: ['middlegame'], claims: [{ fen: NIMZO, says: 'equal' }] },
);

const backward = lesson(
  'pos-backward', 'Backward pawns', 'Pawn structure', 14,
  ['Recognise a backward pawn', 'Find the hole in front of it', 'Attack it along the open file'],
  [
    read(['A backward pawn has fallen behind its neighbours and cannot advance safely, because an enemy pawn controls the square in front of it. It can no longer be defended by a pawn, and the square in front of it is a hole where an enemy piece can sit.', 'It is usually on a half-open file, so the opponent can attack it with rooks.'], board(NAJ, { marks: [{ sq: 'd6', tone: 'bad' }, { sq: 'd5', tone: 'good' }] }), 'The d6-pawn'),
    square('bk-find', 'Black’s pawn on d6 is backward. Click the hole in front of it, the square a White piece wants.', board(NAJ), ['d5'], ['The hole is the square just in front of the backward pawn.'], 'd5 is attacked by no Black pawn (there is no c-pawn and the e-pawn has passed e6). A White knight there is permanent.', ['Click the hole.']),
    moveSan('bk-rook', 'White to move. Bring a rook to the open file the backward pawn stands on.', NAJ, 'O-O-O', ['Which move both castles and puts a rook on the d-file?'], 'O-O-O puts a rook on d1 aimed at d6 and brings the king away from the kingside. The engine checked that it is sound. Castling long is also the start of White’s kingside pawn storm in the English Attack.'),
    ask('bk-defend', 'How can the owner of a backward pawn defend it?', ['With pieces, or by exchanging the attackers', 'With a pawn on the next file', 'By pushing it'], 0, ['A backward pawn cannot be defended by a pawn.'], 'Pieces defend it, or its owner trades the attackers or advances it with a pawn break such as ...d5.', { wrong: { 1: 'A pawn would have to stand beside it, which is exactly what it lacks.' } }),
  ],
  [
    sq('bkq-1', 'Click the backward pawn.', board(NAJ), ['d6'], 'It cannot be defended by a pawn and cannot advance safely.'),
    sq('bkq-2', 'Click the hole in front of it.', board(NAJ), ['d5'], 'No Black pawn can attack d5.'),
    tf('bkq-3', 'The square in front of a backward pawn is often a good post for an enemy piece.', true, 'It is a hole.'),
    choice('bkq-4', 'How do you attack a backward pawn?', ['Pressure it along the open file', 'Ignore it', 'Advance it'], 0, 'Rooks and the queen belong on that file.'),
  ],
  { concepts: ['position.backward-pawn', 'position.hole'], reviewPhases: ['middlegame'] },
);

const passed = lesson(
  'pos-passed', 'Passed pawns', 'Pawn structure', 14,
  ['Define a passed pawn', 'Know why it gets stronger as it advances', 'Know how to block it'],
  [
    read(['A passed pawn has no enemy pawn in front of it or on the neighbouring files, so no pawn can stop it. It forces the opponent to keep a piece nearby, and it becomes more dangerous as it moves closer to promotion.', 'A passed pawn must be pushed, but not carelessly: it needs its own king or pieces behind it to make progress.'], board(PASSED, { marks: [{ sq: 'd5', tone: 'good' }] }), 'A passed pawn'),
    square('pp-find', 'Click White’s passed pawn.', board(PASSED), ['d5'], ['Black has no pawn on the c-, d- or e-file.'], 'The d5-pawn has no Black pawn in front or on the neighbouring files, so it is passed.', ['Click the passed pawn.']),
    ask('pp-block', 'What is the standard defence against a passed pawn?', ['Block it with a piece on the square in front', 'Push your own pawn next to it', 'Trade all the pieces'], 0, ['Which square stops the pawn from advancing?'], 'A piece (best a knight, or the rook behind it) on the square in front of the pawn blockades it. Nimzowitsch called the passed pawn a criminal that must be kept under lock and key.', { board: board(PASSED, { marks: [{ sq: 'd6', tone: 'good' }] }), wrong: { 2: 'Trading pieces often helps the side with the passed pawn.' } }),
    ask('pp-rook', 'Where should a rook stand to support a passed pawn?', ['Behind it', 'In front of it', 'On the first rank'], 0, ['Think about which side keeps pushing without blocking.'], 'A rook behind a passed pawn supports it all the way and does not get in its way. In front it blocks the pawn.', { board: board(PASSED), wrong: { 1: 'A rook in front blocks the pawn from advancing.' } }),
  ],
  [
    sq('ppq-1', 'Click the passed pawn.', board(PASSED), ['d5'], 'No Black pawn can stop it by capture.'),
    tf('ppq-2', 'A passed pawn becomes stronger as it advances.', true, 'It is nearer to promotion.'),
    choice('ppq-3', 'A passed pawn has…', ['No enemy pawns in front or on the neighbouring files', 'A queen behind it', 'Reached the 8th rank'], 0, 'That is the definition.'),
    choice('ppq-4', 'Where should the rook be relative to a passed pawn?', ['Behind it', 'In front of it', 'It does not matter'], 0, 'Behind it supports without blocking.'),
  ],
  { concepts: ['position.passed-pawn'], reviewPhases: ['middlegame', 'endgame'] },
);

const majority = lesson(
  'pos-majority', 'Pawn majorities', 'Pawn structure', 13,
  ['Define a pawn majority', 'Know that its purpose is to create a passed pawn', 'Use the right pawn to start'],
  [
    read(['A pawn majority is more pawns on one wing than the opponent has there. On the other wing you have fewer. The purpose of a majority is to create a passed pawn.', 'The method: advance the pawn that is not opposed first (the candidate), supported by the others, and exchange so that one pawn is left unopposed.'], board(MAJ, { marks: [{ sq: 'a2', tone: 'good' }, { sq: 'b2', tone: 'good' }, { sq: 'c2', tone: 'good' }, { sq: 'a7', tone: 'bad' }, { sq: 'b7', tone: 'bad' }] }), 'Three against two'),
    square('mj-find', 'White has a queenside pawn majority. Click the three White pawns on the queenside.', board(MAJ), ['a2', 'b2', 'c2'], ['Count the pawns on the a-, b- and c-files for each side.', 'Black has only two there.'], 'White has pawns on a2, b2 and c2 against Black’s a7 and b7: three against two. On the kingside both sides have three pawns.', ['Click the first.', 'Click the second.', 'Click the third.']),
    ask('mj-aim', 'What do you try to create with a pawn majority?', ['A passed pawn', 'A mate threat', 'A doubled pawn'], 0, ['Think about the pawn that has no one to oppose it.'], 'Advance and exchange until one of your pawns has no opposing pawn in front of it or on the neighbouring files. That is a passed pawn.', { board: board(MAJ), wrong: { 2: 'Doubled pawns are a flaw, not a goal.' } }),
    ask('mj-which', 'In the majority a2-b2-c2 against a7-b7, which pawn should usually start?', ['The c-pawn, the one without an opposing pawn on its file', 'The a-pawn', 'The b-pawn'], 0, ['Black has pawns on a7 and b7 but none on c7.'], 'The c-pawn faces no Black pawn on its own file. It is the candidate that becomes passed first with the help of the b-pawn.', { board: board(MAJ), wrong: { 1: 'The a-pawn is opposed by a7 and is on the edge.', 2: 'The b-pawn is opposed by b7; it comes second to support c.' } }),
  ],
  [
    choice('mjq-1', 'A majority means…', ['More pawns on one wing than the opponent', 'More pieces', 'More space'], 0, 'Counted on a particular side of the board.'),
    tf('mjq-2', 'A majority is used to create a passed pawn.', true, 'That is its purpose.'),
    sq('mjq-3', 'Click the White pawn that has no opposing pawn on its file.', board(MAJ), ['c2'], 'Black has no c-pawn, so the c-pawn is the candidate.'),
    choice('mjq-4', 'The side with the majority should…', ['Advance it with support and exchange', 'Leave it at home', 'Trade all pawns'], 0, 'It has to be used.'),
  ],
  { concepts: ['position.majority'], reviewPhases: ['endgame'] },
);

const outposts = lesson(
  'pos-outposts', 'Outposts', 'Pieces and squares', 14,
  ['Define an outpost', 'Create one with a pawn and a free hole', 'Know that a knight is the best occupant'],
  [
    read(['An outpost is a square in the opponent’s half that your pawn protects and no enemy pawn can ever attack. A knight on an outpost cannot be driven away and often outplays a rook.', 'To make one, look for a hole in the enemy pawn structure and a pawn of yours that can support it.'], board(OUTPOST, { marks: [{ sq: 'd5', tone: 'good' }, { sq: 'e4', tone: 'good' }] }), 'The knight on d5'),
    square('out-find', 'Click the outpost: the square the knight on it stands on, which the e4-pawn protects and no Black pawn can attack.', board(OUTPOST), ['d5'], ['Black has no pawn on the c- or e-file.', 'The pawn on e4 protects the square.'], 'd5 is protected by the e4-pawn, and Black has no c- or e-pawn to attack it. It is an outpost.', ['Click the outpost.']),
    moveSan('out-go', 'White to move. Occupy the outpost.', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7', 'Nd5', ['The hole is d5.', 'The knight on c3 is one jump away.'], 'Nd5 plants a knight on the d5 hole. Black can trade it, but then White recaptures with the e-pawn and has a favourable structure. The engine finds this sound, if not the only good move.', { soft: true }),
    ask('out-q', 'Why is a knight so good on an outpost?', ['It cannot be attacked by a pawn and attacks key squares', 'Knights move in straight lines', 'It is worth a queen there'], 0, ['Think about what drives knights away.'], 'Pawns drive knights away. If no pawn can, the knight stays and controls up to eight squares around it.', { board: board(OUTPOST), wrong: { 1: 'Knights jump in L-shapes.' } }),
  ],
  [
    sq('oq-1', 'Click the knight on the outpost.', board(OUTPOST), ['d5'], 'It is protected by e4 and cannot be challenged by a pawn.'),
    tf('oq-2', 'An outpost can be attacked by enemy pawns.', false, 'That is what makes it an outpost.'),
    choice('oq-3', 'Which piece is best on an outpost?', ['A knight', 'The king', 'A pawn'], 0, 'Knights thrive on protected central squares.'),
    choice('oq-4', 'To create an outpost you need…', ['A hole and a supporting pawn', 'Two bishops', 'An open h-file'], 0, 'The square must be safe from pawns and protected by yours.'),
  ],
  { concepts: ['position.outpost'], reviewPhases: ['middlegame'] },
);

const bishops = lesson(
  'pos-bishops', 'Good and bad bishops', 'Pieces and squares', 14,
  ['Tell a good bishop from a bad one', 'Use the rule: your pawns on its colour block it', 'Know how to improve or exchange a bad bishop'],
  [
    read(['A bishop is bad when many of your own pawns stand on its colour. They block its diagonals. A bishop is good when your pawns are on the other colour, so it has open lines to the enemy camp.', 'Here Black’s pawns on b7, c6, d5, e6, f7, g6 and h7 are all on light squares. The Black bishop on c8 is a light-squared bishop, so it is shut in.'], board(BAD, { marks: [{ sq: 'c8', tone: 'bad' }, { sq: 'd3', tone: 'good' }] }), 'Two bishops'),
    square('bb-find', 'Click the bad bishop.', board(BAD), ['c8'], ['Which bishop is surrounded by its own pawns on the same colour?'], 'Black’s light-squared bishop on c8 has only the d7-square, since its own pawns on b7 and e6 block it. White’s bishop on d3 has open diagonals and White’s pawns are on dark squares.', ['Click the bad bishop.']),
    ask('bb-fix', 'How could Black improve the bad bishop?', ['Trade it, or play it outside the pawn chain before the pawns close', 'Push more pawns onto light squares', 'Leave it'], 0, ['It cannot get out through its own pawns now.'], 'The classic solution is to trade it for an enemy bishop or knight, or to develop it outside the chain before the structure closes. Adding pawns on light squares makes it worse.', { board: board(BAD), wrong: { 1: 'More pawns on light squares block it further.' } }),
    ask('bb-engine', 'Does a bad bishop always lose the game?', ['No: it is a long-term handicap, not a decisive one', 'Yes, always', 'Only in endgames'], 0, ['Stockfish rates this position as roughly level.'], 'This position is close to equal for the engine because Black’s structure is solid. A bad bishop is something to improve, not an automatic loss.', { board: board(BAD), wrong: { 1: 'It is a handicap, but with correct play it is not decisive.' } }),
  ],
  [
    sq('bbq-1', 'Click the bad bishop.', board(BAD), ['c8'], 'It is blocked by its own pawns on light squares.'),
    choice('bbq-2', 'A bad bishop is blocked by…', ['Its own pawns on the same colour', 'The enemy king', 'The rook'], 0, 'They stand on the squares it wants to use.'),
    tf('bbq-3', 'A bishop can switch colours.', false, 'It stays on its colour forever.'),
    choice('bbq-4', 'Fixing a bad bishop can mean…', ['Trading it or placing it outside the pawn chain', 'Moving the king', 'Giving up a rook'], 0, 'Either remove it or free it.'),
  ],
  { concepts: ['position.good-bad-bishop'], reviewPhases: ['middlegame'], claims: [{ fen: BAD, says: 'equal' }] },
);

const knightBishop = lesson(
  'pos-knight-bishop', 'Knight or bishop?', 'Pieces and squares', 13,
  ['Know when a knight is stronger', 'Know when a bishop is stronger', 'Judge by the structure, not by points'],
  [
    read(['Both pieces are worth about three pawns, but they like different positions. Knights jump, so they thrive in closed positions with outposts. Bishops move at long range, so they thrive in open positions with play on both wings.', 'Two bishops together (the bishop pair) are a lasting advantage in open positions.'], undefined, 'Different tastes'),
    square('kb-find', 'This is a King’s Indian. Black’s bishop on g7 is blocked by its own pawn. Click that pawn.', board(KID), ['e5'], ['The bishop looks along the long diagonal g7-a1.', 'Which Black pawn stands on that diagonal?'], 'The pawn on e5 blocks the g7-bishop. In closed positions like this one, knights are often the better pieces.', ['Click the blocking pawn.']),
    ask('kb-open', 'In this open position, which piece would you prefer?', ['A bishop', 'A knight', 'No difference'], 0, ['There are open diagonals and play on both wings.'], 'The centre is open and there is play on both sides, so the bishop’s long range is valuable.', { board: board(OPEN_C), wrong: { 1: 'The knight is a short-range piece, less effective when the board is open.' } }),
    ask('kb-closed', 'In the King’s Indian structure above, which piece is usually better?', ['A knight', 'A bishop', 'A rook'], 0, ['The pawn centre is locked.'], 'With a locked centre, bishops lose diagonals, but knights can jump over the pawns and use outposts.', { board: board(KID), wrong: { 1: 'The bishop is the one hemmed in by pawns.' } }),
  ],
  [
    choice('kbq-1', 'Knights are best in…', ['Closed positions', 'Open positions', 'Endings only'], 0, 'They jump over pawns.'),
    choice('kbq-2', 'Bishops are best in…', ['Open positions', 'Closed positions', 'Nowhere'], 0, 'They use long diagonals.'),
    tf('kbq-3', 'Having both bishops can be a lasting advantage.', true, 'The bishop pair covers both colours.'),
    sq('kbq-4', 'Click the pawn that blocks Black’s g7 bishop.', board(KID), ['e5'], 'It stands on the long diagonal.'),
  ],
  { concepts: ['position.knight-vs-bishop', 'position.bishop-pair'], reviewPhases: ['middlegame'] },
);

const files = lesson(
  'pos-files', 'Open files and the seventh rank', 'Pieces and squares', 14,
  ['Place rooks on open files', 'Contest or double on the file', 'Know why the seventh rank is strong'],
  [
    read(['Rooks belong on open files, where no pawns block them. A file with no pawns at all is open; with only the opponent’s pawns it is half-open. If both sides want a file, the side that controls it gets in first and can double rooks.', 'The seventh rank is the goal: a rook there attacks pawns from behind and confines the enemy king to the back rank.'], board(FILES, { marks: [{ sq: 'c1', tone: 'good' }, { sq: 'c8', tone: 'bad' }] }), 'Open files'),
    ask('fl-which', 'In this position the c-, d- and e-files are open. What should White do with the rooks?', ['Put them on open files', 'Leave them in the corners', 'Move them to the a-file'], 0, ['Rooks need open lines.'], 'Rooks on the c-, d- or e-file have scope. Left in the corners, they do nothing.', { board: board(FILES), wrong: { 1: 'They have no open lines there.' } }),
    moveSan('fl-take', 'White to move. Take control of an open file with a rook.', FILES, 'Rac1', ['Which rook moves to a file without pawns?', 'Contest the c-file.'], 'Rac1 takes the c-file; Rfd1 or Rfe1 would take other open files. The engine checked that Rac1 is sound, with Black’s answer ...Rfc8 contesting it.', { soft: true, alt: ['Rfc1', 'Rfd1', 'Rad1'] }),
    read(['A rook on the seventh rank is worth a pawn or more when it can take pawns. Here White’s rook on a2 can go to the seventh rank. Black must watch the back rank.'], board(SEVENTH, { marks: [{ sq: 'a2', tone: 'mark' }] }), 'The seventh'),
    ask('fl-7', 'Why is a rook on the seventh rank strong?', ['It attacks pawns from behind and confines the king', 'It is next to the queen', 'It is safe from capture'], 0, ['Think about where the enemy pawns and king are.'], 'On the seventh rank the rook attacks the pawns that are still on their starting squares and restricts the king to the back rank.', { board: board(SEVENTH), wrong: { 2: 'It can still be attacked there.' } }),
  ],
  [
    sq('flq-1', 'Click a White rook that can use the open c-file.', board(FILES), ['a1', 'f1'], 'Either rook can contest the file.'),
    tf('flq-2', 'A rook on the seventh rank can be very strong.', true, 'It attacks pawns and confines the king.'),
    choice('flq-3', 'A file with no pawns is…', ['Open', 'Closed', 'Half-open'], 0, 'No pawns of either colour.'),
    mqSan('flq-4', 'White to move. Place a rook on an open file.', FILES, ['Rac1', 'Rfc1', 'Rfd1', 'Rad1'], 'Any rook move to the c- or d-file takes an open file.', { soft: true }),
  ],
  { concepts: ['position.open-file', 'position.seventh-rank'], reviewPhases: ['middlegame', 'endgame'] },
);

const weak = lesson(
  'pos-weak-squares', 'Weak squares and holes', 'Pieces and squares', 14,
  ['Define a weak square', 'See how a pawn move creates a hole', 'Aim a piece at it'],
  [
    read(['A weak square is one that can no longer be protected by a pawn. When it lies in front of an enemy pawn it is a hole. A weak square matters only if an enemy piece can reach it.', 'Pawn moves create holes, because pawns cannot go back. That is why a pawn move should always be asked: what does it leave behind?'], undefined, 'What a pawn leaves behind'),
    demoSan('How ...e5 makes a hole', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5', [
      'White takes the centre.', 'Black challenges it.', 'White develops.', 'Black prepares to develop.', 'White opens the centre.', 'Black recaptures; the c-pawn is gone.', 'White recaptures; the knight is central.', 'Black develops.', 'White develops.', 'Black takes away b5.', 'White develops the bishop.', 'Black drives the knight back with ...e5. The pawn passes e6, so no Black pawn can ever guard d5. A hole is created.',
    ], { intro: 'A single pawn move can leave a permanent weakness.' }),
    square('wk-find', 'Click the hole that ...e5 created.', board(NAJ_E5), ['d5'], ['It is in front of the d6-pawn.', 'No Black pawn can ever attack it.'], 'd5 can no longer be attacked by a pawn: there is no c-pawn and the e-pawn has passed e6. A White knight there cannot be driven away.', ['Click the hole.']),
    ask('wk-q', 'A weak square matters when…', ['An enemy piece can reach it and settle there', 'It is in the corner', 'It is empty'], 0, ['A hole is only a target if it can be used.'], 'The value of a hole depends on whether the opponent has a piece that can get there. Knights are the usual occupants.', { board: board(NAJ_E5), wrong: { 2: 'Many empty squares are not weak.' } }),
  ],
  [
    choice('wkq-1', 'A hole is…', ['A square that can no longer be defended by a pawn', 'A captured pawn', 'An open file'], 0, 'It is permanently weak.'),
    sq('wkq-2', 'Click the hole.', board(NAJ_E5), ['d5'], 'No Black pawn can attack it.'),
    tf('wkq-3', 'Pawn moves can create weak squares.', true, 'The squares they leave behind are permanent.'),
    choice('wkq-4', 'The best use of a hole in the enemy camp is…', ['Place a knight there', 'Ignore it', 'Attack it with a pawn'], 0, 'A knight on a hole is hard to remove.'),
  ],
  { concepts: ['position.weak-square', 'position.hole'], reviewPhases: ['middlegame'] },
);

const activity = lesson(
  'pos-activity', 'Piece activity', 'Pieces and squares', 13,
  ['Measure a piece’s activity by the squares it controls', 'Reroute a passive piece to an active square', 'Prefer activity to a small material gain'],
  [
    read(['Activity is the number of useful squares a piece controls and how much it points at. A knight in the centre controls up to eight squares; the same knight on the rim controls four. Activity matters more than the count of moves.', 'When you can improve a piece or win a pawn, ask how active your pieces are afterwards.'], undefined, 'Count the squares'),
    reach('act-rim', 'The White knight on a3 is on the rim. Click every square it can move to.', RIM, 'a3', ['A knight moves in an L-shape.', 'From a3 there are only four squares: two forward, two sideways.'], 'From a3 the knight can go to b1, c2, c4 and b5: only four squares, and none of them is central. On c4 it would control six.'),
    moveSan('act-fix', 'White to move. Reroute the rim knight to a central square.', RIM, 'Nc4', ['A knight is better in the centre than on the rim.', 'Which of its four moves reaches the fourth rank?'], 'Nc4 brings the knight to a central square, where it controls d6, b6, e5, a5, d2 and e3. The engine checked that Nc4 is sound. Nb5 looks active too, but the c6-pawn takes it.', { wrong: { a3b5: 'The pawn on c6 attacks b5, so the knight would be lost.' } }),
    ask('act-q', 'You could win a pawn but your knight would be left on the rim. What do you consider?', ['Whether the activity you give up costs more than the pawn is worth', 'Always take the pawn', 'Never take pawns'], 0, ['Think about the position after the pawn is won.'], 'Pawns are worth taking when the cost in activity is small. If a piece is left out of the game, the pawn may cost more than it earns.', { wrong: { 1: 'Some pawns are poisoned, not because of tactics but because of activity.' } }),
  ],
  [
    choice('acq-1', 'Piece activity means…', ['Pieces control many squares and point at targets', 'Moving pieces often', 'Having many pieces'], 0, 'Quality, not quantity.'),
    tf('acq-2', 'A knight is usually stronger in the centre than on the rim.', true, 'It controls more squares.'),
    mqSan('acq-3', 'White to move. Improve the knight on a3.', RIM, ['Nc4'], 'Nc4 centralises the knight; Nb5 would lose it to ...cxb5.'),
    choice('acq-4', 'When choosing between a pawn and activity, you should…', ['Compare the two in the resulting position', 'Always take the pawn', 'Always take activity'], 0, 'It depends on what you give up.'),
  ],
  { concepts: ['position.activity', 'principle.activity'], reviewPhases: ['middlegame'] },
);

const prophylaxis = lesson(
  'pos-prophylaxis', 'Prophylaxis', 'Pieces and squares', 13,
  ['Define prophylaxis', 'Ask “what does my opponent want?” before a quiet move', 'See that a good prophylactic move is also useful'],
  [
    read(['Prophylaxis means preventing the opponent’s plan before it starts. Before each quiet move, ask: what does my opponent want to do next? If there is a move that stops it and is also useful, play it.', 'It is not passive. The best prophylactic moves improve your own position too.'], undefined, 'Prevent, then improve'),
    ask('pr-idea', 'In this Italian position, Black’s pieces point at f2 and g4. Which Black idea is White’s h3 aimed at?', ['...Bg4 or ...Ng4, pressuring f3 and f2', '...Qh4, attacking at once', '...d5, opening the centre'], 0, ['Look for squares Black’s bishop and knight can reach on the kingside.', 'Which squares does h3 take away?'], 'h3 takes g4 away from Black’s bishop (which would pin the f3-knight) and from Black’s knight (which, with the bishop on c5, would attack f2). It prevents the idea and keeps the bishop on c4 safe from a pin.', { board: board(ITALIAN, { marks: [{ sq: 'g4', tone: 'bad' }, { sq: 'f2', tone: 'bad' }] }), wrong: { 1: 'The queen cannot reach h4 here.', 2: 'The central ...d5 break is not what h3 prevents.' } }),
    moveSan('pr-h3', 'White to move. Prevent ...Bg4 and ...Ng4 with a useful pawn move.', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O', 'h3', ['Which squares do you want to take away from Black?', 'A pawn on h3 attacks g4.'], 'h3 is a prophylactic move. It is not the engine’s first choice (Nbd2 is), but both are sound, and the lesson is the way of thinking.', { soft: true }),
    ask('pr-always', 'Is prophylaxis always the best move?', ['No: concrete threats and tactics come first', 'Yes, always', 'Only in endgames'], 0, ['If there is a tactic, you should find it first.'], 'Prophylaxis is the choice for quiet positions. If you can win material or checkmate, do that first.', { wrong: { 1: 'It is for quiet moments; calculation comes first.' } }),
  ],
  [
    choice('prq-1', 'Prophylaxis means…', ['Preventing the opponent’s plan', 'Attacking the king', 'Trading queens'], 0, 'Stop it before it starts.'),
    tf('prq-2', 'Prophylactic moves can also improve your position.', true, 'The best ones do both.'),
    choice('prq-3', 'The first step in prophylactic thinking is to…', ['Find the opponent’s idea', 'Make a pawn move', 'Castle'], 0, 'You cannot prevent what you have not noticed.'),
    sq('prq-4', 'Click the square h3 takes away from Black’s knight and bishop.', board(ITALIAN), ['g4'], 'A pawn on h3 attacks g4.'),
  ],
  { concepts: ['position.prophylaxis'], reviewPhases: ['middlegame'] },
);

const byId = (id: string) => [space, centre, structure, isolated, doubled, backward, passed, majority, outposts, bishops, knightBishop, files, weak, activity, prophylaxis].find((l) => l.id === id)!;

export const posStructure: Chapter = {
  id: 'pos-chapter-structure', title: 'Space, centre and pawn structure', blurb: 'How pawns shape the game.',
  lessons: ['pos-space', 'pos-centre', 'pos-structure', 'pos-isolated', 'pos-doubled', 'pos-backward', 'pos-passed', 'pos-majority'].map(byId),
  check: [
    choice('pc1-1', 'More space usually means…', ['Controlling more squares', 'Owning more pieces', 'Having castled'], 0, 'Space is about the squares you control.'),
    sq('pc1-2', 'Click the isolated pawn.', board(IQP), ['d5'], 'It has no pawns on the c- or e-file.'),
    sq('pc1-3', 'Click the rear doubled pawn.', board(NIMZO), ['c3'], 'The pawns on c3 and c4 are doubled.'),
    sq('pc1-4', 'Click the backward pawn.', board(NAJ), ['d6'], 'It cannot be defended by a pawn.'),
    sq('pc1-5', 'Click the passed pawn.', board(PASSED), ['d5'], 'No Black pawn can stop it by capture.'),
    choice('pc1-6', 'Where do you attack a pawn chain?', ['At its base', 'At its head', 'Nowhere'], 0, 'The base has no pawn protection.'),
  ],
};
export const posPieces: Chapter = {
  id: 'pos-chapter-pieces', title: 'Pieces and squares', blurb: 'Outposts, bishops, knights, open files and weak squares.',
  lessons: ['pos-outposts', 'pos-bishops', 'pos-knight-bishop', 'pos-files', 'pos-weak-squares', 'pos-activity', 'pos-prophylaxis'].map(byId),
  check: [
    sq('pc2-1', 'Click the knight on the outpost.', board(OUTPOST), ['d5'], 'It is protected by e4 and cannot be challenged by a pawn.'),
    sq('pc2-2', 'Click the bad bishop.', board(BAD), ['c8'], 'It is blocked by its own pawns.'),
    choice('pc2-3', 'Knights are best in…', ['Closed positions', 'Open positions', 'Endings only'], 0, 'They jump over pawns.'),
    sq('pc2-4', 'Click the hole.', board(NAJ_E5), ['d5'], 'No Black pawn can attack it.'),
    choice('pc2-5', 'A rook on the seventh rank…', ['Attacks pawns and confines the king', 'Is always safe', 'Cannot be attacked'], 0, 'That is why it is strong.'),
    choice('pc2-6', 'Prophylaxis starts with…', ['Finding the opponent’s idea', 'A pawn move', 'Castling'], 0, 'You cannot prevent what you have not noticed.'),
  ],
};

export const positionalCourse: Course = {
  id: 'positional', title: 'Positional understanding', level: 'intermediate',
  blurb: 'Fifteen ideas behind quiet, strategic chess: space, pawn structure, outposts, good and bad pieces, weak squares, activity and prophylaxis. Each lesson has a real position to work on.',
  requires: ['beginner'],
  chapters: [posStructure, posPieces],
  assessment: [
    choice('pos-a1', 'More space usually means…', ['Controlling more squares', 'Owning more pieces', 'Having castled'], 0, 'Space is about the squares you control.', { lesson: 'pos-space' }),
    sq('pos-a2', 'Click the isolated pawn.', board(IQP), ['d5'], 'It has no pawns on the c- or e-file.', { lesson: 'pos-isolated' }),
    sq('pos-a3', 'Click the passed pawn.', board(PASSED), ['d5'], 'No Black pawn can stop it by capture.', { lesson: 'pos-passed' }),
    sq('pos-a4', 'Click the outpost knight.', board(OUTPOST), ['d5'], 'Protected by e4, unattackable by pawns.', { lesson: 'pos-outposts' }),
    sq('pos-a5', 'Click the bad bishop.', board(BAD), ['c8'], 'Blocked by its own pawns.', { lesson: 'pos-bishops' }),
    choice('pos-a6', 'Knights are best in…', ['Closed positions', 'Open positions', 'Endings only'], 0, 'They jump over pawns.', { lesson: 'pos-knight-bishop' }),
    sq('pos-a7', 'Click the hole.', board(NAJ_E5), ['d5'], 'No Black pawn can attack it.', { lesson: 'pos-weak-squares' }),
    choice('pos-a8', 'Prophylaxis means…', ['Preventing the opponent’s plan', 'Attacking the king', 'Trading queens'], 0, 'Stop it before it starts.', { lesson: 'pos-prophylaxis' }),
    tf('pos-a9', 'A pawn majority is used to create a passed pawn.', true, 'That is its purpose.', { lesson: 'pos-majority' }),
    choice('pos-a10', 'A rook on the seventh rank…', ['Attacks pawns and confines the king', 'Is always safe', 'Cannot be attacked'], 0, 'That is why it is strong.', { lesson: 'pos-files' }),
  ],
};
