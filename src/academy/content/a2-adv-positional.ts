import type { Chapter, Course } from '../types';
import { ask, board, choice, demoSan, fenAfter, lesson, mqSan, moveSan, pdemo, pz, pq, read, sq, square, tf } from './dsl';

const RUY0 = 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O';
const NAJ0 = 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3';
const BENKO = 'd4 Nf6 c4 c5 d5 b5 cxb5';
const MAR = 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 c4';
const TARR = 'd4 d5 c4 e6 Nc3 c5 cxd5 exd5 Nf3 Nc6 g3 Nf6 Bg2 Be7 O-O O-O dxc5 Bxc5';
const WIN = 'e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7';
const MARSHALL = 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5 exd5 Nxd5 Nxe5 Nxe5 Rxe5 c6';
const NAJ_COORD = 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O Nbd7 Nd5 Nxd5 exd5 Bf5';

const prophylaxis = lesson(
  'ap-prophylaxis', 'Prophylaxis', 'Advanced positional play', 14,
  ['Define prophylaxis and ask “what does my opponent want?”', 'Find the opponent’s best idea before choosing a plan', 'See prophylactic moves that also improve your own position'],
  [
    read(['Prophylaxis means preventing the opponent’s plan before it starts. The habit is a question you ask before every quiet move: what does my opponent want to do, and can I stop it with a move that is also useful for me?', 'It is the main tool of strong positional players, because stopping one plan often leaves the opponent with no good plan at all.'], undefined, 'Ask the question'),
    ask('pro-q', 'In the closed Ruy Lopez, what does Black want to play next, with White to move?', ['...Bg4, pinning the knight on f3 to the queen', '...Qh4, attacking at once', '...Nxe4, winning a pawn'], 0, ['Look at Black’s dark squares and light-squared bishop on c8.', 'The knight on f3 guards the e5 and d4 points; what would be unpleasant to lose?'], 'Black’s bishop can come to g4 and pin the f3-knight, adding pressure to e4 and d4. White’s h3 asks the bishop to decide before it gets there. The engine also likes ...Bg4 in similar positions, so h3 is a real prophylactic move, not an automatic one.', { board: board(fenAfter(RUY0)), wrong: { 1: 'The e7-bishop blocks the queen’s path to h4.', 2: 'Black cannot win the pawn: after ...Nxe4 Rxe4 White has won a knight for a pawn.' } }),
    moveSan('pro-h3', 'White to move. Make the prophylactic move that stops ...Bg4.', RUY0, 'h3', ['The pin on f3 comes from a bishop on g4.', 'A pawn can take g4 away.'], 'h3 asks the bishop to decide, and after ...Be6 or ...Bd7 White can play d4 with the centre protected. The engine checked that h3 is sound here.'),
    moveSan('pro-a6', 'Black to move. This quiet pawn move stops two of White’s ideas. Which pawn?', NAJ0, 'a6', ['White’s bishop would like to check on b5.', 'The knight on d4 could jump to b5.'], 'a6 takes b5 away from White’s bishop and knight. It also prepares ...b5 later. This is the Najdorf move, and the engine checked that it is sound.', { orientation: 'black' }),
    ask('pro-also', 'A good prophylactic move is often one that…', ['Stops the opponent’s idea and improves your own position', 'Gives up space for safety', 'Trades your best piece'], 0, ['Think of h3 and a6.'], 'Both h3 and a6 prevent a plan and are useful for later (h3 gives the king luft and the bishop a retreat square; a6 prepares ...b5).', { wrong: { 1: 'Prophylaxis is not passive; it should be useful.' } }),
  ],
  [
    choice('apq-1', 'Prophylaxis means…', ['Stopping the opponent’s plan before it starts', 'Attacking the king', 'Trading queens'], 0, 'You act before the idea arrives.'),
    tf('apq-2', 'The first step in prophylactic thinking is to find what the opponent wants.', true, 'You cannot prevent what you have not noticed.'),
    mqSan('apq-3', 'White to move. Stop ...Bg4.', RUY0, ['h3'], 'h3 takes g4 away.'),
    choice('apq-4', 'a6 in the Najdorf stops…', ['Bb5+ and Ndb5', 'Qd4', 'Nf3'], 0, 'It takes b5 away from White’s pieces.', { board: board(fenAfter(NAJ0 + ' a6')) }),
  ],
  { concepts: ['position.prophylaxis'], reviewPhases: ['middlegame'] },
);

const posSac = lesson(
  'ap-positional-sacrifice', 'Positional sacrifices', 'Advanced positional play', 16,
  ['Define a positional sacrifice: material for lasting, non-tactical benefits', 'Name what the compensation is made of', 'Judge whether the compensation is real'],
  [
    read(['A positional sacrifice gives up material not for a quick tactic but for lasting benefits: open lines, a lead in development, a strong piece, or a damaged enemy structure. No forced win is visible; the plan simply pays off over many moves.', 'The risk is real. Count what you get: the compensation must be something the opponent cannot easily fix.'], undefined, 'Pay now, collect later'),
    demoSan('The Benko Gambit', 'd4 Nf6 c4 c5 d5 b5 cxb5 a6 bxa6 Bxa6 Nc3 d6 e4 Bxf1 Kxf1 g6', [
      'White takes the centre.', 'Black develops.', 'White adds a second pawn.', 'Black challenges the centre.', 'White gains space.',
      'The gambit: Black offers a pawn.', 'White takes it.', 'Black opens the a- and b-files.', 'White takes the second pawn.', 'The bishop attacks the white bishop on f1.',
      'White develops.', 'Black opens the c8-h3 line and prepares the fianchetto.', 'White builds the centre.', 'Black trades the bishop.', 'White’s king can no longer castle.', 'Black prepares ...Bg7 on the long diagonal.',
    ], { intro: 'A pawn for lasting pressure on the queenside.' }),
    ask('ps-comp', 'What does Black get for the pawn in the Benko?', ['Open a- and b-files, a bishop on the long diagonal, and White’s king stuck in the centre', 'A direct checkmate attack', 'Nothing; the pawn is simply lost'], 0, ['Look at the files Black has opened and at White’s castling rights.'], 'The sacrifice opens the a- and b-files for Black’s rooks, the g7 bishop works on the long diagonal, and after the bishop trade on f1 White cannot castle. These benefits last because they are structural, not tactical.', { board: board(fenAfter(BENKO + ' a6 bxa6 Bxa6 Nc3 d6 e4 Bxf1 Kxf1 g6')), wrong: { 1: 'There is no forced mate; the compensation is positional.' } }),
    moveSan('ps-a6', 'Black to move. Decline to recapture and offer the second pawn: open the a-file.', BENKO, 'a6', ['Black could capture on b5 but chooses to play for files.', 'Which pawn move offers a second pawn?'], 'a6 is the point of the gambit: after bxa6, Black recaptures with the bishop and has open files with a bishop on a6. The engine rates the resulting position as playable for Black, but not as winning.', { soft: true, orientation: 'black' }),
    ask('ps-judge', 'How do you judge whether a positional sacrifice is sound?', ['Check that the compensation is long-lasting and cannot be easily removed', 'See whether it looks aggressive', 'Count how many moves it takes'], 0, ['Think about what the opponent can fix.'], 'Compensation that the opponent can neutralise in a few moves is not worth a pawn. Open files and a stuck king are lasting; a short-lived initiative is not.', { wrong: { 1: 'Aggressive-looking and sound are different things.' } }),
  ],
  [
    choice('psq-1', 'A positional sacrifice gives material for…', ['Lasting benefits such as open lines and activity', 'An immediate checkmate', 'Nothing'], 0, 'It is not a quick tactic.'),
    tf('psq-2', 'The compensation should be something the opponent cannot easily remove.', true, 'Otherwise the pawn is just lost.'),
    choice('psq-3', 'Which of these is a typical Benko Gambit benefit?', ['Open a- and b-files for Black’s rooks', 'A mating attack on h2', 'A passed pawn on h7'], 0, 'It is the file pressure.', { board: board(fenAfter(BENKO + ' a6 bxa6')) }),
    choice('psq-4', 'Why is a positional sacrifice risky?', ['The benefits are long-term and may not be enough', 'It is illegal', 'It always loses'], 0, 'You can be simply a pawn down.'),
  ],
  { concepts: ['position.sacrifice', 'dynamic.compensation'], reviewPhases: ['opening', 'middlegame'] },
);

const exSac = lesson(
  'ap-exchange-sacrifice', 'Exchange sacrifices', 'Advanced positional play', 16,
  ['Define an exchange sacrifice (giving a rook for a bishop or knight)', 'See the tactical version: the sacrifice that wins more', 'Know the positional reasons: structure, dark squares, a blockade'],
  [
    read(['An exchange sacrifice gives a rook (5) for a minor piece (3), losing about two points of material. There are two families.', 'The tactical kind wins more back by force, with a fork, pin or attack on the king. The positional kind trades the rook for a lasting benefit such as wrecked pawns, a dominant knight, or a safe blockade.'], undefined, 'Rook for a minor piece'),
    pdemo('PR8k5', 'A tactical exchange sacrifice', ['The rook takes a defended knight, offering the exchange.', 'White takes the rook with the queen. The queen is pulled away and a fork appears.', 'The knight checks the king and forks the queen on c3.', 'The king steps aside.', 'The knight takes the queen. Black has given a rook for a knight and won the queen for it.'], 'Black to move wins the queen.'),
    pz('PR8k5', 'sacrifice', { prompt: 'Black to move. Give up the rook to win a much bigger prize.' }),
    pdemo('VpOez', 'Another tactical exchange sacrifice', ['The rook takes the knight on c3. The pinned White pieces must now recapture.', 'The b-pawn is forced to take, opening the b-file and the king.', 'The rook uses the pin on the b-file.'], 'The rook trades itself for the key defender.'),
    ask('exs-positional', 'Which of these is a positional reason for an exchange sacrifice?', ['Wrecking the opponent’s pawn structure and gaining a dominant piece', 'Winning the opponent’s queen in two moves', 'Giving a check'], 0, ['Positional reasons last; tactical ones are forcing.'], 'The positional exchange sacrifice pays in structure and piece activity, often over many moves. Capturing on c3 so that bxc3 doubles the pawns is a classical example. Giving the engine’s opinion, such sacrifices are rarely clear-cut, so check concrete lines first.', { wrong: { 1: 'That is a tactical reason.' } }),
  ],
  [
    choice('exq-1', 'An exchange sacrifice is…', ['A rook given for a bishop or knight', 'A queen trade', 'Giving up a pawn'], 0, 'Rook (5) for a minor piece (3).'),
    pq('PR8k5', 'sacrifice', { prompt: 'Black to move. Which move starts the winning combination?', lesson: 'ap-exchange-sacrifice' }),
    tf('exq-3', 'Every exchange sacrifice is sound if it looks attacking.', false, 'It must be calculated; many are simply a loss of material.'),
    choice('exq-4', 'A positional reason for an exchange sacrifice is…', ['Damaging the pawn structure or gaining a blockade', 'Gaining a check', 'Saving time'], 0, 'Lasting structural benefits.'),
  ],
  { concepts: ['position.exchange-sacrifice'], puzzleThemes: ['sacrifice'], reviewPhases: ['middlegame'] },
);

const dynamic = lesson(
  'ap-dynamic', 'Dynamic compensation', 'Advanced positional play', 15,
  ['Tell static from dynamic advantages', 'Recognise compensation for a pawn: time, activity, an attack', 'Know that dynamic compensation fades if the opponent consolidates'],
  [
    read(['Static advantages last: a better pawn structure, a bishop pair, a weak enemy square. Dynamic advantages are about activity and time: a lead in development, an open file, an attack on the king.', 'Dynamic factors are strongest early and fade if the opponent consolidates. So a side that sacrifices for activity must keep pushing.'], undefined, 'Static or dynamic'),
    demoSan('The Marshall Attack', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5 exd5 Nxd5 Nxe5 Nxe5 Rxe5 c6', [
      'White takes the centre.', 'Black does the same.', 'The knight attacks e5.', 'The knight defends it.', 'The Ruy Lopez.', 'The Morphy Defence.', 'The bishop retreats.', 'Black attacks e4.', 'White castles.', 'Black develops the bishop.', 'The rook protects e4.', 'Black gains space.', 'The bishop retreats again.', 'Black castles. White could now play d4 (the anti-Marshall), but chooses the main line.', 'White prepares d4.', 'The Marshall: Black sacrifices a pawn for activity.', 'White takes the pawn.', 'The knight recaptures.', 'White takes the e5 pawn.', 'Black takes the knight.', 'White recaptures the knight. White is a pawn up.', 'Black plays c6, preparing ...Bd6 to chase the rook and opening the queen’s diagonal.',
    ], { intro: 'Black gives a pawn for lasting activity. The engine rates the position as roughly equal: Black’s activity pays for the pawn.' }),
    ask('dyn-q', 'Why is the Marshall a dynamic, not a static, sacrifice?', ['Black’s compensation is activity and an attack, not a structural advantage', 'Black has won the pawn back', 'Black has a better pawn structure'], 0, ['Look at the pieces, not the pawns.'], 'Black is a pawn down and has no structural plus; the compensation is activity and king pressure. If White neutralises it (as the engine thinks he can), the pawn is simply White’s.', { board: board(fenAfter(MARSHALL)), wrong: { 1: 'Black is a pawn down.', 2: 'Black’s structure is not better here.' } }),
    ask('dyn-fade', 'What usually happens to dynamic compensation if the opponent consolidates?', ['It fades', 'It grows', 'It stays constant'], 0, ['Think about time.'], 'Activity is a temporary advantage. If the defender covers the weak squares and completes development, the extra pawn starts to count.', { wrong: { 1: 'It would grow only if the attacker continues to add threats.' } }),
  ],
  [
    choice('dyq-1', 'A static advantage is…', ['A lasting feature like a better pawn structure', 'An open file', 'A lead in development'], 0, 'It does not fade.'),
    choice('dyq-2', 'Dynamic compensation depends on…', ['Activity and time', 'The number of pawns', 'The pawn structure only'], 0, 'It fades if the opponent consolidates.'),
    tf('dyq-3', 'In the Marshall, Black has more material.', false, 'Black is a pawn down and plays for activity.'),
    choice('dyq-4', 'To keep dynamic compensation, the side sacrificing must…', ['Keep making threats', 'Trade pieces', 'Retreat'], 0, 'The initiative is the compensation.'),
  ],
  { concepts: ['dynamic.compensation', 'position.activity'], reviewPhases: ['opening', 'middlegame'], claims: [{ fen: fenAfter(MARSHALL), says: 'equal' }] },
);

const colour = lesson(
  'ap-colour-complex', 'Weak-colour complexes', 'Advanced positional play', 14,
  ['Define a weak-colour complex', 'See how trading a bishop creates one', 'Find a target on the weakened colour'],
  [
    read(['A colour complex is all the squares of one colour. If you trade your bishop of that colour and your pawns stand on the other colour, the squares of the bishop’s colour in your camp become permanently weak.', 'The side with the matching bishop (and a queen or knight that can reach those squares) attacks them.'], undefined, 'Squares of one colour'),
    read(['In the Winawer French Black has given up the dark-squared bishop for the c3 knight. Black’s dark squares, especially g7 and the h8 corner, are now harder to defend. White’s dark-squared bishop and queen can aim at them.'], board(fenAfter(WIN), { marks: [{ sq: 'g7', tone: 'bad' }, { sq: 'h8', tone: 'bad' }] }), 'Dark squares'),
    moveSan('wc-qg4', 'White to move. Aim at the weakened dark squares.', WIN, 'Qg4', ['The pawn on g7 is only defended by the rook.', 'Which piece can hit it from g4?'], 'Qg4 attacks g7. It cannot be defended by a bishop, since Black gave it up. The engine rates this Winawer line as slightly better for White, and the standard replies (...Qc7, ...Rg8) show the weakness is real.', { soft: true }),
    square('wc-find', 'Click the Black pawn that White’s queen attacks.', board(fenAfter(WIN + ' Qg4')), ['g7'], ['Draw the line from g4 down the file.', 'It is the pawn that the dark-squared bishop used to guard.'], 'The pawn on g7 is attacked by the queen, and Black no longer has the dark-squared bishop to defend it.', ['Click the attacked pawn.']),
    ask('wc-q', 'Which statement about colour complexes is right?', ['A complex gets weak when you trade the bishop of that colour and your pawns are on the other colour', 'A complex is weak if you have two bishops', 'Only the king can be attacked on a colour complex'], 0, ['Think about the bishop that used to protect those squares.'], 'Without the bishop, no piece can control the squares in question except the queen and the knights, and pawns on the opposite colour do not help.', { wrong: { 1: 'Two bishops help, not hurt.' } }),
  ],
  [
    choice('wcq-1', 'A weak colour complex arises when…', ['You trade your bishop of that colour and your pawns are on the other colour', 'You have a bishop pair', 'You castle early'], 0, 'The squares lose their guardian.'),
    sq('wcq-2', 'Click the pawn White attacks.', board(fenAfter(WIN + ' Qg4')), ['g7'], 'It cannot be defended by a bishop.'),
    tf('wcq-3', 'The side with the matching bishop can exploit a weak colour complex.', true, 'The bishop controls the weakened squares.'),
    choice('wcq-4', 'In the Winawer French, which squares are weakened for Black?', ['Dark squares', 'Light squares', 'None'], 0, 'Black gave up the dark-squared bishop.'),
  ],
  { concepts: ['position.colour-complex', 'position.weak-square'], reviewPhases: ['middlegame'] },
);

const restriction = lesson(
  'ap-restriction', 'Restriction and the bind', 'Advanced positional play', 15,
  ['Define a bind: a clamp on key squares or pawn breaks', 'Find the squares the bind takes away', 'Know how the other side breaks it'],
  [
    read(['A bind (or clamp) is a grip on the position that takes away the opponent’s useful moves, usually by controlling key squares with pawns. A cramped opponent cannot free themselves, and often runs out of safe moves.', 'The classic bind is the Maroczy: pawns on c4 and e4 take the squares d5 and b5 away.'], board(fenAfter(MAR), { marks: [{ sq: 'c4', tone: 'good' }, { sq: 'e4', tone: 'good' }, { sq: 'd5', tone: 'bad' }, { sq: 'b5', tone: 'bad' }] }), 'The Maroczy bind'),
    square('rs-find', 'Black wants to break with ...d5 but cannot. Click the central square that White’s two pawns both control.', board(fenAfter(MAR)), ['d5'], ['One pawn is on c4, the other on e4.', 'Pawns attack diagonally forward.'], 'Both the c4- and e4-pawns attack d5, so ...d5 loses a pawn. The pawns restrict Black’s freeing move.', ['Click the square both pawns control.']),
    moveSan('rs-nf6', 'Black to move. Challenge the bind with piece play: attack e4.', MAR, 'Nf6', ['A pawn break is not available; use a piece.', 'A knight move attacks e4.'], 'Nf6 attacks e4 and invites Nc3, after which Black plays ...d6 and aims at the queenside breaks ...a6/…b5 or the central ...Nxd4. The engine checked that Nf6 is sound.', { orientation: 'black' }),
    ask('rs-q', 'How does the cramped side usually fight a bind?', ['By exchanging pieces to gain room and preparing a pawn break', 'By waiting', 'By pushing every pawn'], 0, ['Think about the earlier lesson on cramped positions.'], 'Exchanges give the cramped pieces room, and a well-prepared break (like ...b5 in the Maroczy) opens the position.', { wrong: { 1: 'Waiting lets the bind tighten.' } }),
  ],
  [
    choice('rsq-1', 'A bind is…', ['A grip on key squares that restricts the opponent', 'A pin on a piece', 'A capture sequence'], 0, 'It takes away the opponent’s useful moves.'),
    sq('rsq-2', 'Click the square both White pawns attack.', board(fenAfter(MAR)), ['d5'], 'c4 and e4 both attack d5.'),
    tf('rsq-3', 'Exchanging pieces helps the cramped side.', true, 'It gains room.'),
    choice('rsq-4', 'The Maroczy bind takes away…', ['d5 and b5', 'h4 and h5', 'a3 and a4'], 0, 'The c4 and e4 pawns control them.'),
  ],
  { concepts: ['position.restriction', 'position.space'], reviewPhases: ['middlegame'] },
);

const transform = lesson(
  'ap-structure-change', 'Pawn structure transformations', 'Advanced positional play', 14,
  ['Know that pawn structures change through exchanges', 'Predict the new structure before you exchange', 'Choose your plan for the new structure'],
  [
    read(['A pawn structure is not fixed. A capture can turn one structure into another, and each has its own plans. Strong players choose exchanges because of the structure that results, not only the material.', 'Before you capture, picture the pawns after the recapture and ask who benefits.'], undefined, 'Capture, then ask what you get'),
    demoSan('From the Tarrasch to an isolated pawn', 'd4 d5 c4 e6 Nc3 c5 cxd5 exd5 Nf3 Nc6 g3 Nf6 Bg2 Be7 O-O O-O dxc5 Bxc5', [
      'White takes the centre.', 'Black does the same.', 'The Queen’s Gambit.', 'Black declines it.', 'White develops.', 'The Tarrasch Defence: Black challenges d4 at once.', 'White takes on d5.', 'Black recaptures; the e-pawn is now on d5.', 'White develops.', 'Black develops.', 'The fianchetto.', 'Black develops.', 'The bishop eyes d5.', 'Black develops.', 'White castles.', 'Black castles.', 'White captures: the pawn on c5 is gone.', 'Black recaptures with the bishop. The structure has changed: Black’s pawn on d5 is now isolated.',
    ], { intro: 'Two captures change the structure.' }),
    square('sc-iso', 'The exchanges have left Black with an isolated pawn. Click it.', board(fenAfter(TARR)), ['d5'], ['Look for the Black pawn with no neighbour pawns.', 'The c-pawn and the e-pawn are gone.'], 'Black’s d5-pawn has no friendly pawn on the c- or e-file: an isolated queen’s pawn (IQP). White can blockade on d4 and attack d5 with pieces; Black has active pieces in compensation.', ['Click the isolated pawn.']),
    moveSan('sc-na4', 'White to move. Challenge the active bishop and prepare to use the structure.', TARR, 'Na4', ['The bishop on c5 is the most active Black piece.', 'A knight can attack it from a4.'], 'Na4 attacks the bishop on c5, so Black must decide whether to retreat. The engine picks Na4 as best. After Bd6 or Be7, White heads for the d4 blockade square.', { soft: true }),
    ask('sc-q', 'Why check the resulting pawn structure before you capture?', ['Each structure comes with its own plans, and you want the right one', 'Captures are always forced', 'Structures do not matter in the middlegame'], 0, ['Think about the Carlsbad and the IQP.'], 'The structure after the capture decides your plan. Choosing a capture because of the structure you get is a strategic skill.', { wrong: { 2: 'They matter most there.' } }),
  ],
  [
    sq('stq-1', 'Click Black’s isolated pawn.', board(fenAfter(TARR)), ['d5'], 'No c- or e-pawn.'),
    choice('stq-2', 'Structure changes through…', ['Captures and pawn exchanges', 'Piece moves only', 'Castling'], 0, 'Pawns change structure when they capture.'),
    tf('stq-3', 'You should consider the structure that results before you capture.', true, 'It tells you which plan applies.'),
    choice('stq-4', 'A typical plan against an isolated pawn is…', ['Blockade the square in front of it and attack it with pieces', 'Push it forward', 'Ignore it'], 0, 'Knights on d4 are the classic.'),
  ],
  { concepts: ['position.structure-change', 'position.isolated-pawn'], reviewPhases: ['opening', 'middlegame'] },
);

const coord = lesson(
  'ap-coordination', 'Strategic piece coordination', 'Advanced positional play', 14,
  ['Make pieces support each other’s targets', 'Use batteries and pawn support', 'Time a pawn advance so the pieces are ready'],
  [
    read(['Coordination means your pieces work on the same target and support each other. A queen and rook on the same file, a knight supported by a pawn, a pawn storm backed by the pieces: each piece multiplies the others.', 'A single active piece is not enough. A plan works when the pieces are all pointing the same way.'], undefined, 'Pieces in concert'),
    read(['White has the queen and rook on the d-file behind the d5-pawn, the king on c1 away from the kingside, and the bishop on e3. The plan is a pawn storm with g4, backed by the h-pawn and the pieces.'], board(fenAfter(NAJ_COORD), { marks: [{ sq: 'd2', tone: 'good' }, { sq: 'd1', tone: 'good' }, { sq: 'e3', tone: 'good' }] }), 'One plan'),
    moveSan('co-g4', 'White to move. Advance the pawn with tempo against the bishop on f5.', NAJ_COORD, 'g4', ['A pawn can attack the bishop.', 'It also starts the storm against Black’s king.'], 'g4 attacks the bishop and begins the kingside pawn storm, with the queen, rooks and bishop behind it. The engine picks g4. It is equal in evaluation, but the piece setup shows coordination rather than just a pawn push.', { soft: true }),
    ask('co-q', 'What makes a pawn storm work?', ['The pieces are ready to use the lines the pawns open', 'The pawns move as fast as possible', 'The king stays in the middle'], 0, ['Think about what happens when the lines open.'], 'The pawns open lines; the pieces must be placed to use them. A storm without piece support only weakens your own king.', { wrong: { 1: 'Speed without support just creates weaknesses.' } }),
  ],
  [
    choice('coq-1', 'Coordination means…', ['Pieces working on the same target', 'Moving all pieces once', 'Trading all pieces'], 0, 'Pieces support each other.'),
    tf('coq-2', 'A pawn storm should be backed by pieces.', true, 'Otherwise it only weakens your own king.'),
    mqSan('coq-3', 'White to move. Hit the bishop and start the storm.', NAJ_COORD, ['g4'], 'The g-pawn attacks the bishop and begins the attack.', { soft: true }),
    choice('coq-4', 'A battery is…', ['Two pieces on the same line, one behind the other', 'A pawn chain', 'A castled king'], 0, 'Like a queen and rook on one file.'),
  ],
  { concepts: ['position.coordination', 'plan.method'], reviewPhases: ['middlegame'] },
);

export const apIdeas: Chapter = {
  id: 'ap-chapter-ideas', title: 'Preventing and sacrificing', blurb: 'Prophylaxis and the three kinds of sacrifice.',
  lessons: [prophylaxis, posSac, exSac, dynamic],
  check: [
    choice('ap1-1', 'Prophylaxis means…', ['Preventing the opponent’s plan', 'Attacking the king', 'Trading queens'], 0, 'You act before the idea arrives.'),
    choice('ap1-2', 'A positional sacrifice gives material for…', ['Lasting benefits', 'A quick mate', 'Nothing'], 0, 'It is not a quick tactic.'),
    tf('ap1-3', 'An exchange sacrifice gives a rook for a minor piece.', true, 'Rook (5) for bishop or knight (3).'),
    choice('ap1-4', 'Dynamic compensation depends on…', ['Activity and time', 'Pawn structure', 'Material'], 0, 'It fades if the opponent consolidates.'),
  ],
};
export const apStructure: Chapter = {
  id: 'ap-chapter-structure', title: 'Squares, binds and structure', blurb: 'Colour complexes, restriction, structure change and coordination.',
  lessons: [colour, restriction, transform, coord],
  check: [
    sq('ap2-1', 'Click the pawn White attacks.', board(fenAfter(WIN + ' Qg4')), ['g7'], 'Black has no dark-squared bishop to defend it.'),
    sq('ap2-2', 'Click the square both White pawns control.', board(fenAfter(MAR)), ['d5'], 'c4 and e4 both attack it.'),
    sq('ap2-3', 'Click Black’s isolated pawn.', board(fenAfter(TARR)), ['d5'], 'No c- or e-pawn.'),
    tf('ap2-4', 'Pieces should be coordinated before a pawn storm.', true, 'They use the opened lines.'),
  ],
};

export const advPositionalCourse: Course = {
  id: 'adv-positional', title: 'Advanced positional play', level: 'advanced',
  blurb: 'Prophylaxis, positional and exchange sacrifices, dynamic compensation, colour complexes, restriction, structure changes and piece coordination.',
  requires: ['positional'],
  chapters: [apIdeas, apStructure],
  assessment: [
    choice('apa-1', 'Prophylaxis means…', ['Preventing the opponent’s plan', 'Attacking the king', 'Trading queens'], 0, 'You act before the idea arrives.', { lesson: 'ap-prophylaxis' }),
    mqSan('apa-2', 'White to move. Stop ...Bg4.', RUY0, ['h3'], 'h3 takes g4 away.', { lesson: 'ap-prophylaxis' }),
    choice('apa-3', 'A positional sacrifice gives material for…', ['Lasting benefits', 'A quick mate', 'Nothing'], 0, 'It is not a quick tactic.', { lesson: 'ap-positional-sacrifice' }),
    tf('apa-4', 'Dynamic compensation can fade if the opponent consolidates.', true, 'Time is its main ingredient.', { lesson: 'ap-dynamic' }),
    sq('apa-5', 'Click the pawn White attacks.', board(fenAfter(WIN + ' Qg4')), ['g7'], 'Black has no dark-squared bishop.', { lesson: 'ap-colour-complex' }),
    sq('apa-6', 'Click the square both White pawns control.', board(fenAfter(MAR)), ['d5'], 'c4 and e4 control it.', { lesson: 'ap-restriction' }),
    choice('apa-7', 'A good prophylactic move often…', ['Also improves your own position', 'Only retreats', 'Gives up the centre'], 0, 'Like h3 or a6.', { lesson: 'ap-coordination' }),
    sq('apa-8', 'Click Black’s isolated pawn.', board(fenAfter(TARR)), ['d5'], 'No neighbouring pawns.', { lesson: 'ap-structure-change' }),
  ],
};
