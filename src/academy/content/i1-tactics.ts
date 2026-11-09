import type { Chapter, Course } from '../types';
import { board, choice, demo, lesson, pdemo, pq, pz, read, reach, square, tf } from './dsl';

const lessonTag = (l: string) => ({ lesson: l });

/* ---------------------------------- A1: winning material ---------------------------------- */

const forks = lesson(
  'tac-forks', 'Forks', 'Forks', 14,
  ['Define a fork: one piece attacking two or more targets', 'Find a forking move', 'Check the forking piece is safe before you play it'],
  [
    read(['A fork is one move that attacks two (or more) enemy pieces at once. Your opponent can only deal with one threat, so you win the other.', 'Knights are the great forkers: they attack in an L-shape, so a target cannot capture back from where it stands. Queens, pawns and bishops fork too.'], undefined, 'One move, two targets'),
    demo('A knight fork', board('r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1'), [
      { uci: 'd5c7', say: 'The knight jumps to c7. It gives check to the king on e8 and attacks the rook on a8 at the same time.', arrows: [{ from: 'c7', to: 'e8', tone: 'best' }, { from: 'c7', to: 'a8', tone: 'best' }] },
      ['e8d7', 'The king has to move out of check. The rook cannot be protected in time.'],
      ['c7a8', 'The knight takes the rook. A check plus a second attack is the most common fork.'],
    ]),
    square('fork-targets', 'The knight on c7 forks two black pieces. Click both.', board('r3k3/2N5/8/8/8/8/8/4K3 b - - 0 1', { orientation: 'white' }), ['e8', 'a8'], ['The knight attacks squares an L-shape away: two squares and one over.', 'Black’s king and rook are both an L-shape away.'], 'From c7 the knight attacks e8 (the king) and a8 (the rook).', ['Click the first piece', 'Click the second piece']),
    pz('wnWi3', 'fork', { extra: 'Before playing a fork, check that the forking piece cannot simply be captured.' }),
    pz('QzoUZ', 'fork'),
    pz('1afHw', 'fork'),
  ],
  [pq('dkYE2', 'fork', lessonTag('tac-forks')), pq('gs7Yz', 'fork', lessonTag('tac-forks')),
    choice('fork-c1', 'Why are knights so good at forking?', ['Pieces attacked by a knight cannot capture it with the same kind of move', 'Knights are worth the most', 'Knights move twice'], 0, 'A knight attacks along an L-shape that most of the pieces it attacks cannot return along, and it can jump into the fork square.', lessonTag('tac-forks'))],
  { puzzleThemes: ['fork'], concepts: ['tactic.fork'] },
);

const pins = lesson(
  'tac-pins', 'Pins', 'Pins', 14,
  ['Explain absolute and relative pins', 'Know that a pinned piece is limited in its moves', 'Attack a pinned piece to win it'],
  [
    read(['A pin attacks a piece that cannot move without exposing something more valuable behind it. If the piece behind is the king, the pin is absolute and the pinned piece cannot legally leave the line at all.', 'If it is a queen or rook, the pin is relative: the piece can move, but at a cost.'], undefined, 'A piece stuck in the line of fire'),
    reach('pinned-rook', 'The black rook on e5 is pinned to its king by the white rook. Click every square it can move to.', '4k3/8/8/4r3/8/8/8/4RK2 b - - 0 1', 'e5', ['A pinned piece may still move along the line of the pin.', 'It may even capture the pinning piece.'], 'The rook can only slide along the e-file: e6, e7, e4, e3, e2, or capture on e1. Any other move would expose the king.'),
    pdemo('SeS5S', 'Winning a pinned piece', [
      'Black attacks the bishop on d5 with the rook. The bishop is pinned: if it moves off the d-file, Black’s rook would attack the king on d2. It also has no defender.',
      'White moves the king, but the bishop is still lost.',
      'The rook takes the bishop. Attack a pinned piece with something it cannot run away from.',
    ]),
    pz('XNF9l', 'pin'),
    pz('4q5PG', 'pin'),
  ],
  [pq('k5DZd', 'pin', lessonTag('tac-pins')), pq('tYcRa', 'pin', lessonTag('tac-pins')), pq('Yxcv7', 'pin', lessonTag('tac-pins'))],
  { puzzleThemes: ['pin'], concepts: ['tactic.pin'] },
);

const skewers = lesson(
  'tac-skewers', 'Skewers', 'Skewers', 12,
  ['Explain a skewer as a pin in reverse', 'Attack a valuable piece that has to move', 'Win the piece behind it'],
  [
    read(['A skewer is like a pin in reverse. You attack a valuable piece, often the king, and when it moves out of the way, you capture the piece behind it.', 'Rooks, bishops and queens skewer along lines.']),
    pdemo('djgUm', 'A skewer on the back rank', [
      'The rook checks the king along the eighth rank. The rook on b8 stands behind the king on the same rank.',
      'The king has to leave the line.',
      'The rook captures the rook that was behind the king.',
    ]),
    pz('NsiHJ', 'skewer'),
    pz('tZA9h', 'skewer'),
  ],
  [pq('k5dbN', 'skewer', lessonTag('tac-skewers')), pq('KgseK', 'skewer', lessonTag('tac-skewers')), pq('Cl5v3', 'skewer', lessonTag('tac-skewers')),
    choice('skew-c1', 'What is the difference between a pin and a skewer?', ['In a skewer the front piece is the more valuable one', 'In a pin the front piece is the more valuable one', 'There is no difference'], 0, 'In a pin the front piece is the less valuable. In a skewer the front piece is the more valuable and must move.', lessonTag('tac-skewers'))],
  { puzzleThemes: ['skewer'], concepts: ['tactic.skewer'] },
);

const doubles = lesson(
  'tac-double-attacks', 'Double attacks', 'Double attacks', 12,
  ['Spot a move that creates two separate threats', 'Combine a check with another threat', 'Recognise that a double attack is more than a fork'],
  [
    read(['A double attack is any move that creates two threats at once. It can be a fork, but it can also be a check combined with an attack on a piece, or a threat of mate combined with a threat to win material.', 'Your opponent can only stop one.']),
    pdemo('7yGGz', 'Check and a second target', [
      'The rook captures a pawn with check. At the same time it attacks the bishop on h3 along the h-file.',
      'The king steps aside. It cannot do anything about the bishop.',
      'The rook takes the bishop. The check made the second threat impossible to meet.',
    ]),
    pz('B9GPG', 'fork'),
    pz('R4ciN', 'fork'),
  ],
  [pq('XMivn', 'fork', lessonTag('tac-double-attacks')),
    choice('dbl-c1', 'A check that also attacks another piece is…', ['A double attack', 'Always a mistake', 'A stalemate'], 0, 'The king must answer the check, so the second target cannot be defended.', lessonTag('tac-double-attacks')),
    tf('dbl-c2', 'A double attack needs two pieces to be attacked by the same piece.', false, 'Any move that creates two threats is a double attack, including a check plus a threat to capture something.', lessonTag('tac-double-attacks'))],
  { puzzleThemes: ['fork'], concepts: ['tactic.double-attack'] },
);

const discovered = lesson(
  'tac-discovered', 'Discovered attacks', 'Discovered attacks', 14,
  ['Explain how moving one piece uncovers an attack by another', 'Combine the move with a threat of its own', 'Find a discovered attack'],
  [
    read(['In a discovered attack you move a piece out of the way so that a piece behind it attacks. The piece that moved can itself make a threat, often a check or a capture, so your opponent faces two problems.']),
    pdemo('YyZOz', 'The bishop moves with check', [
      'The bishop on e4 captures on c2 with check. It also moves away from the e-file, where it stood in front of Black’s rook.',
      'White has to deal with the check, so the king takes the bishop.',
      'The rook that was uncovered takes the rook on e1. The discovered attack won a rook.',
    ]),
    pz('vCSPV', 'discoveredAttack'),
    pz('Vnf35', 'discoveredAttack'),
  ],
  [pq('B9XeA', 'discoveredAttack', lessonTag('tac-discovered')), pq('k3ma8', 'discoveredAttack', lessonTag('tac-discovered')), pq('s30LC', 'discoveredAttack', lessonTag('tac-discovered'))],
  { puzzleThemes: ['discoveredAttack'], concepts: ['tactic.discovered-attack'] },
);

const discoveredChecks = lesson(
  'tac-discovered-checks', 'Discovered check and double check', 'Discovered checks', 14,
  ['Explain discovered check and double check', 'Know why a double check forces the king to move', 'Use them to win material or mate'],
  [
    read(['A discovered check is a discovered attack where the uncovered attack is on the king. The piece that moves is free to do almost anything, because the king must respond to the check.', 'A double check is when two pieces give check at once. It cannot be blocked or captured, so the king must move.']),
    pdemo('k4UW3', 'A double check that is mate', [
      'The knight captures on d6. It gives check itself, and it also uncovers the bishop on a4, which gives check along the diagonal. Two checks at once: the king cannot capture or block both and has nowhere to go.',
    ]),
    pz('nEt3r', 'doubleCheck'),
    pz('04KbJ', 'doubleCheck'),
  ],
  [pq('9XdJu', 'doubleCheck', lessonTag('tac-discovered-checks')), pq('vAsIJ', 'doubleCheck', lessonTag('tac-discovered-checks')),
    tf('dcheck-c1', 'A double check can be answered by capturing one of the checking pieces.', false, 'Neither check can be dealt with by removing just one piece, so only a king move can help.', lessonTag('tac-discovered-checks'))],
  { puzzleThemes: ['doubleCheck', 'discoveredAttack'], concepts: ['tactic.discovered-check', 'tactic.double-check'] },
);

export const tacticsWin: Chapter = {
  id: 'tactics-win', title: 'Winning material', blurb: 'Forks, pins, skewers and discovered attacks.',
  lessons: [forks, pins, skewers, doubles, discovered, discoveredChecks],
  check: [
    pq('rzRDl', 'fork', lessonTag('tac-forks')),
    pq('vBMhq', 'pin', lessonTag('tac-pins')),
    pq('6PjFH', 'skewer', lessonTag('tac-skewers')),
    pq('VmH36', 'discoveredAttack', lessonTag('tac-discovered')),
    choice('tw-1', 'Which tactic attacks a piece that cannot move without exposing a more valuable one behind it?', ['A pin', 'A fork', 'A skewer'], 0, 'That is the definition of a pin.', lessonTag('tac-pins')),
    choice('tw-2', 'Which tactic attacks one piece with a move that creates two threats?', ['A fork', 'A pin', 'En passant'], 0, 'A fork attacks two or more targets with one piece.', lessonTag('tac-forks')),
  ],
};

/* ------------------------------ A2: breaking the defence ------------------------------ */

const deflection = lesson(
  'tac-deflection', 'Deflection', 'Deflection', 14,
  ['Explain deflection: forcing a defender away', 'Find the piece that is doing two jobs', 'Use a forcing move to pull it away'],
  [
    read(['A deflection forces an enemy piece away from a square or a piece it is guarding. Usually the forcing move is a check, a capture or a threat the defender cannot ignore.', 'Look for pieces that are overloaded: doing two jobs at once.']),
    pdemo('k7oeJ', 'Pulling the king away', [
      'The knight gives check. The king has only one square to go to.',
      'The king has to go to h1, which pulls it away from the knight on f1 that it was guarding.',
      'The rook takes the knight on f1: checkmate on the back rank.',
    ]),
    pz('HWlAv', 'deflection'),
    pz('6OMzA', 'deflection'),
  ],
  [pq('yLt6H', 'deflection', lessonTag('tac-deflection')), pq('dlxYN', 'deflection', lessonTag('tac-deflection')), pq('Vo9jU', 'deflection', lessonTag('tac-deflection'))],
  { puzzleThemes: ['deflection'], concepts: ['tactic.deflection'] },
);

const attraction = lesson(
  'tac-attraction', 'Attraction and decoys', 'Attraction', 14,
  ['Explain attraction (decoy): luring a piece to a bad square', 'Use a sacrifice to drag the king into the open', 'Calculate that the follow-up works'],
  [
    read(['Attraction, or a decoy, lures an enemy piece onto a square where it can be attacked. The piece is usually the king, and the lure is usually a sacrifice.', 'It only works if the follow-up is forced, so always calculate to the end.']),
    pdemo('BBzcp', 'Dragging the king to f8', [
      'The rook sacrifices itself on f8 with check. The king captures, because there is no other way out of check.',
      'The king has been pulled to f8.',
      'The second rook gives checkmate on d8. Black’s own knight and pawns block every escape.',
    ]),
    pz('KhdSY', 'attraction'),
    pz('k3BoC', 'attraction'),
  ],
  [pq('s2oqT', 'attraction', lessonTag('tac-attraction')),
    choice('attr-c1', 'What is the typical sign that a decoy sacrifice is worth it?', ['The follow-up is forced and decisive', 'You are behind in material', 'The sacrificed piece is a pawn'], 0, 'A sacrifice is only sound if it forces the result.', lessonTag('tac-attraction')),
    tf('attr-c2', 'A decoy usually drags a piece away from the action.', false, 'It lures a piece onto a square where it can be attacked.', lessonTag('tac-attraction'))],
  { puzzleThemes: ['attraction'], concepts: ['tactic.attraction', 'tactic.decoy'] },
);

const removing = lesson(
  'tac-removing-defender', 'Removing the defender', 'Removing the defender', 14,
  ['Find which piece defends the target', 'Capture or chase it away', 'Take the target'],
  [
    read(['If a piece is protected, take away the protector first. Capture it, force it to move, or block its line, then win what it was guarding.', 'To find the idea, ask: what is defending the piece I want?']),
    pdemo('R49g6', 'Taking the defender first', [
      'The rook takes the rook on f5. The pawn on e4 must take back, because otherwise Black is simply a rook up.',
      'The pawn on e4 recaptured, so it is no longer protecting the knight on d5.',
      'The queen takes the knight: the defender was removed, so the target fell.',
    ]),
    pz('05GU4', 'capturingDefender'),
    pz('Yx6pw', 'capturingDefender'),
  ],
  [pq('9Wz0r', 'capturingDefender', lessonTag('tac-removing-defender')), pq('k7I4Q', 'capturingDefender', lessonTag('tac-removing-defender')), pq('s15So', 'capturingDefender', lessonTag('tac-removing-defender'))],
  { puzzleThemes: ['capturingDefender'], concepts: ['tactic.remove-defender'] },
);

const interference = lesson(
  'tac-interference', 'Interference', 'Interference', 12,
  ['Explain interference: cutting the line between two enemy pieces', 'Use a forcing move to block it', 'Win material because the link is broken'],
  [
    read(['Interference puts a piece on a line between two enemy pieces so that one can no longer protect or help the other. The interfering piece is often protected by a threat such as a check.']),
    pdemo('tbWT9', 'Cutting the line', [
      'The knight jumps to f2 with check. It also lands on the diagonal between White’s queen on e1 and the rook on g3, so the queen no longer protects the rook.',
      'The king has to step to g1. (Capturing with the queen would lose it to …Qxf2.)',
      'The rook on g3 is now unprotected, and the queen takes it.',
    ]),
    pz('liEqb', 'interference'),
    pz('c7k65', 'interference'),
  ],
  [pq('J3xh9', 'interference', lessonTag('tac-interference')), pq('PR2im', 'interference', lessonTag('tac-interference')), pq('k65l9', 'interference', lessonTag('tac-interference'))],
  { puzzleThemes: ['interference'], concepts: ['tactic.interference'] },
);

const clearance = lesson(
  'tac-clearance', 'Clearance', 'Clearance', 12,
  ['Explain clearance: vacating a square or line', 'Free the way for another piece', 'Do it with tempo, usually a check'],
  [
    read(['A clearance move gets one of your own pieces out of the way so another can use the square or line. It usually comes with a threat, often a check, so the opponent has no time to prevent what follows.']),
    pdemo('gsOl6', 'Clearing h5 with a check', [
      'The knight sacrifices itself with check. It leaves h5, the square the rook wants.',
      'The h-pawn has to take the knight (the king could not escape otherwise), and that opens the h-file.',
      'With the h-file open and h5 cleared, the rook lands on h5: checkmate.',
    ]),
    pz('nFghm', 'clearance'),
    pz('zuuQ7', 'clearance'),
  ],
  [pq('1eu62', 'clearance', lessonTag('tac-clearance')), pq('vAjXu', 'clearance', lessonTag('tac-clearance')), pq('EM0qb', 'clearance', lessonTag('tac-clearance'))],
  { puzzleThemes: ['clearance'], concepts: ['tactic.clearance'] },
);

const zwischenzug = lesson(
  'tac-zwischenzug', 'The in-between move', 'Zwischenzug', 14,
  ['Explain zwischenzug (an in-between move)', 'Look before making an automatic recapture', 'Insert a forcing move first'],
  [
    read(['A zwischenzug, or in-between move, is a forcing move played before the obvious reply. It changes the situation first, usually with a check or a threat, and then you play the move that was expected.', 'Habit: before you recapture, ask whether a stronger move can be inserted.']),
    pdemo('9b6gC', 'Check first, then take the queen', [
      'Instead of the obvious capture, the bishop takes the knight with check. White must respond.',
      'White recaptures, but the knight that was protecting the queen on d5 is gone.',
      'Black’s queen takes White’s queen, which now has no protection.',
    ]),
    pz('tat7b', 'intermezzo'),
    pz('zy7ES', 'intermezzo'),
  ],
  [pq('00Htd', 'intermezzo', lessonTag('tac-zwischenzug')), pq('lhABl', 'intermezzo', lessonTag('tac-zwischenzug')), pq('XN8VW', 'intermezzo', lessonTag('tac-zwischenzug'))],
  { puzzleThemes: ['intermezzo'], concepts: ['tactic.zwischenzug'] },
);

const xray = lesson(
  'tac-xray', 'X-ray attacks', 'X-ray', 14,
  ['Explain an x-ray: a long-range piece attacking through an enemy piece', 'See why the piece in front cannot simply stay put', 'Find the forcing move that cashes in on the line behind'],
  [
    read(['An x-ray attack is when a rook, bishop or queen eyes a square or a piece on the far side of another piece. It looks like nothing is happening, because a piece stands in the way. But when that piece has to capture, move or be exchanged, the line behind it opens.', 'The question to ask: if the piece in front disappears, what do I hit?']),
    pdemo('ScW7n', 'The queen behind the queen', [
      'Black gives up a rook with check. Look at the first rank: Black’s queen on a1 and White’s queen on d1 are on the same line, with the king on h1 beyond them.',
      'White has to capture, since nothing else covers e1. The queen stays on the first rank.',
      'The black queen takes the queen with check. It was looking along the rank all the time, and the king on h1 has no escape square. Checkmate.',
    ], 'Black to move.'),
    pdemo('YzwT1', 'The rook behind the rook', [
      'The queen takes the rook on b1 with check. A rook on b8 is behind the white rook on b5.',
      'The rook on b5 has to take the queen, so it leaves the b-file.',
      'Now the b8-rook sees all the way down the file to b1 and delivers mate.',
    ], 'Black to move.'),
    pz('k6WcX', 'xRayAttack', { prompt: 'White to move. Sacrifice the queen so the rook on d1 can use the file.' }),
    pz('tZCwb', 'xRayAttack', { prompt: 'White to move. Use the rook behind the front one.' }),
  ],
  [pq('HX4bE', 'xRayAttack', lessonTag('tac-xray')), pq('NqfjI', 'xRayAttack', lessonTag('tac-xray')),
    choice('xr-3', 'What is the idea of an x-ray?', ['A long-range piece attacks through an enemy piece to a target behind it', 'A piece that cannot move', 'A pawn that attacks two squares'], 0, 'When the piece in front moves or is exchanged, the line opens.', lessonTag('tac-xray')),
    tf('xr-4', 'An x-ray works only when the piece in front is a pawn.', false, 'Any piece can stand in front; the key is what happens when it leaves the line.', lessonTag('tac-xray'))],
  { puzzleThemes: ['xRayAttack'], concepts: ['tactic.xray'] },
);

export const tacticsBreak: Chapter = {
  id: 'tactics-break', title: 'Breaking the defence', blurb: 'Deflection, decoys, removing defenders, interference, x-rays, clearance and the in-between move.',
  lessons: [deflection, attraction, removing, interference, xray, clearance, zwischenzug],
  check: [
    pq('k4sMM', 'deflection', lessonTag('tac-deflection')),
    pq('zvR2O', 'capturingDefender', lessonTag('tac-removing-defender')),
    pq('rz0SM', 'intermezzo', lessonTag('tac-zwischenzug')),
    pq('tZCwb', 'xRayAttack', lessonTag('tac-xray')),
    pq('nHHxC', 'clearance', lessonTag('tac-clearance')),
    choice('tb-1', 'You want to win a protected piece. What can you try?', ['Remove or deflect the protector', 'Wait', 'Trade queens'], 0, 'Remove or deflect the defender, then take the target.', lessonTag('tac-removing-defender')),
    choice('tb-2', 'A move played before the expected reply, usually with a check or threat, is called…', ['A zwischenzug', 'A skewer', 'A fork'], 0, 'An in-between move.', lessonTag('tac-zwischenzug')),
  ],
};

/* ------------------------------ A3: attacking the king ------------------------------ */

const backRank = lesson(
  'tac-back-rank', 'Back-rank tactics', 'Back-rank tactics', 12,
  ['Recognise a king trapped by its own pawns', 'Deliver or avoid a back-rank mate', 'Use a sacrifice to break the defence'],
  [
    read(['If a king sits behind its own pawns and has no escape square, a rook or queen on the back rank can give checkmate. This is the back-rank mate, and it is one of the most common ways to lose.', 'Give your king luft (a flight square) by moving a pawn once the game gets sharp.']),
    pdemo('wkRk6', 'Check, block, mate', [
      'The rook checks along the eighth rank. The king’s own pawns on g7 and h7 block its escape.',
      'Black can only block with the knight.',
      'The rook takes the blocking knight. It is checkmate, because there is nothing left to capture or block.',
    ]),
    pz('ldvoC', 'backRankMate'),
    pz('EMaKp', 'backRankMate'),
  ],
  [pq('NrpKE', 'backRankMate', lessonTag('tac-back-rank')), pq('fKzEz', 'backRankMate', lessonTag('tac-back-rank')), pq('orwZ1', 'backRankMate', lessonTag('tac-back-rank'))],
  { puzzleThemes: ['backRankMate'], concepts: ['mate.back-rank', 'tactic.back-rank'], reviewTags: ['allowed-mate'] },
);

const sacrifices = lesson(
  'tac-sacrifices', 'Tactical sacrifices', 'Sacrifices', 14,
  ['Know that a sacrifice must have a concrete purpose', 'Calculate the forced line', 'Compare what you give with what you get'],
  [
    read(['A tactical sacrifice gives up material to gain something bigger: checkmate, a decisive material win, or a winning position. It is not a gamble if you can calculate the forced line to its end.', 'Count what you give, then count what you win.']),
    pdemo('9a2RG', 'Queen for a mate', [
      'The queen takes the rook on a1 with check. It looks like a blunder, but the check is forcing.',
      'The bishop must capture the queen, and that pulls it away.',
      'The rook gives checkmate on the first rank. The sacrifice was forced and decisive.',
    ]),
    pz('KgIs1', 'sacrifice'),
    pz('Yz2lr', 'sacrifice'),
  ],
  [pq('PPKNd', 'sacrifice', lessonTag('tac-sacrifices')), pq('6NJMR', 'sacrifice', lessonTag('tac-sacrifices')), pq('gsE6I', 'sacrifice', lessonTag('tac-sacrifices'))],
  { puzzleThemes: ['sacrifice'], concepts: ['tactic.sacrifice'] },
);

const mating = lesson(
  'tac-mating-attacks', 'Mating attacks', 'Mating attacks', 16,
  ['Combine checks to drive a king to mate', 'Count the escape squares', 'Calculate forcing lines'],
  [
    read(['A mating attack is a chain of forcing moves, usually checks, that ends in checkmate. Start with all the checks, count the squares the king can reach, and ask which of your pieces cover them.', 'You should be able to see the last move before you play the first.']),
    pdemo('ooUTL', 'Rook checks, then a mate on h7', [
      'The rook takes the pawn on h5 with check. The king is exposed on the h-file.',
      'Black’s only way to stop the check is to put the bishop on h6.',
      'The rook takes the bishop, with check again.',
      'Black’s king has just one move: g7.',
      'The rook goes to h7: checkmate, protected by the knight on f6.',
    ]),
    pz('lhZMt', 'exposedKing'),
    pz('3EkwD', 'exposedKing'),
  ],
  [pq('PQ7Qq', 'kingsideAttack', lessonTag('tac-mating-attacks')), pq('VpDEo', 'kingsideAttack', lessonTag('tac-mating-attacks')), pq('zyXvQ', 'kingsideAttack', lessonTag('tac-mating-attacks'))],
  { puzzleThemes: ['mateIn2', 'mateIn3', 'kingsideAttack'], concepts: ['attack.mating-net'], reviewTags: ['missed-mate'] },
);

export const tacticsAttack: Chapter = {
  id: 'tactics-attack', title: 'Attacking the king', blurb: 'Back-rank mates, sacrifices and mating attacks.',
  lessons: [backRank, sacrifices, mating],
  check: [
    pq('wl7dr', 'backRankMate', lessonTag('tac-back-rank')),
    pq('3Dnif', 'backRankMate', lessonTag('tac-back-rank')),
    pq('PQsOZ', 'mateIn2', lessonTag('tac-mating-attacks')),
    pq('k5Fj1', 'sacrifice', lessonTag('tac-sacrifices')),
    choice('ta-1', 'What makes a back-rank mate possible?', ['The king’s own pawns block its escape squares', 'The queen is missing', 'The king has moved'], 0, 'The king has no flight square because its own pawns are in the way.', lessonTag('tac-back-rank')),
    tf('ta-2', 'A sacrifice is justified if the follow-up is forced and decisive.', true, 'That is what separates a sacrifice from a gamble.', lessonTag('tac-sacrifices')),
  ],
};

export const tacticsCourse: Course = {
  id: 'tactics', title: 'Tactical awareness', level: 'intermediate',
  blurb: 'Learn the patterns behind winning combinations, then practise recognising them in puzzles.',
  requires: ['beginner'],
  chapters: [tacticsWin, tacticsBreak, tacticsAttack],
  assessment: [
    pq('HY3de', 'fork', lessonTag('tac-forks')),
    pq('BBDS2', 'pin', lessonTag('tac-pins')),
    pq('03Nmh', 'skewer', lessonTag('tac-skewers')),
    pq('s1H0Y', 'discoveredAttack', lessonTag('tac-discovered')),
    pq('dm3At', 'deflection', lessonTag('tac-deflection')),
    pq('opoC5', 'capturingDefender', lessonTag('tac-removing-defender')),
    pq('PSSQH', 'intermezzo', lessonTag('tac-zwischenzug')),
    pq('vDXRq', 'clearance', lessonTag('tac-clearance')),
    pq('EKZg4', 'backRankMate', lessonTag('tac-back-rank')),
    choice('tc-1', 'Which pattern attacks a piece that must move, winning the piece behind it?', ['A skewer', 'A pin', 'A fork'], 0, 'A skewer.', lessonTag('tac-skewers')),
    choice('tc-2', 'Which tactic pulls an enemy piece away from a job it is doing?', ['Deflection', 'Promotion', 'Castling'], 0, 'Deflection.', lessonTag('tac-deflection')),
    tf('tc-3', 'You should always make the obvious recapture immediately.', false, 'Check whether an in-between move is stronger.', lessonTag('tac-zwischenzug')),
  ],
};
