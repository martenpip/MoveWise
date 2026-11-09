import type { Chapter, Course } from '../types';
import { ask, board, choice, lesson, pq, pz, read, sq, tf } from './dsl';

const L = (l: string) => ({ lesson: l });

/* --------------------------------- D1: king safety --------------------------------- */

const kingSafety = lesson(
  'att-king-safety', 'What makes a king safe', 'King safety', 10,
  ['Name the three things that keep a king safe', 'Compare two kings and say which is safer', 'Know why defenders near the king matter'],
  [
    read(['A king is safe when three things are true: it has a shield of pawns in front of it, a few of your pieces stand close by to defend, and there are no open files or diagonals pointing at it.', 'Take any one of these away and an attack becomes easier.'], board('r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 1', { marks: [{ sq: 'f2', tone: 'good' }, { sq: 'g2', tone: 'good' }, { sq: 'h2', tone: 'good' }, { sq: 'f3', tone: 'good' }] }), 'Shield, defenders, closed lines'),
    ask('safer-king', 'Which king is better protected: White’s on g1, or Black’s on g8?', ['White’s: three pawns in front of it', 'Black’s: it has two rooks nearby', 'They are equally safe'], 0, ['Count the pawns directly in front of each king.', 'Black has pushed or lost two of the three shield pawns.'], 'White’s king keeps f2, g2 and h2 in front of it. Black’s king has only the pawn on f7, so files and diagonals around it are open.', { board: board('r4rk1/5p2/8/8/8/8/5PPP/R4RK1 w - - 0 1'), wrong: { 1: 'Rooks help, but they do not replace the pawn shield. Here both sides have rooks, and White also has the pawns.' } }),
    ask('near-defenders', 'Besides pawns, what helps a castled king most?', ['A knight and bishop close to it', 'Putting the queen on the far side of the board', 'Moving the king out to the centre'], 0, ['Think about who can capture an attacker or block a line.'], 'Pieces next to the king can capture attackers and block lines. A queen on the far side is no help, and a king in the centre is easy to attack.'),
  ],
  [
    choice('ks-1', 'Which is NOT a sign of a safe king?', ['Pawns directly in front of it', 'Open files pointing at it', 'Friendly pieces nearby'], 1, 'Open files and diagonals toward the king are what attackers use. The other two are what keep a king safe.'),
    tf('ks-2', 'A castled king with its f, g and h pawns in place is usually safe to start with.', true, 'The pawn shield is the first layer of protection.'),
    sq('ks-3', 'Click White’s king.', board('r4rk1/5p2/8/8/8/8/5PPP/R4RK1 w - - 0 1'), ['g1'], 'White’s king is on g1, behind the pawns on f2, g2 and h2.'),
  ],
  { concepts: ['kingsafety.basics'], reviewPhases: ['middlegame'] },
);

const shelter = lesson(
  'att-pawn-shelter', 'The pawn shelter and luft', 'King safety', 10,
  ['Know that pawn moves in front of the king are permanent', 'Make “luft”, a flight square, when it is needed', 'Avoid weakening moves without a reason'],
  [
    read(['Pawns cannot go backward. Every move of an f, g or h pawn in front of your castled king leaves squares behind it that can never be defended by that pawn again.', 'That does not mean never move them. It means know the cost, and be sure the attack is not going to arrive first.'], board('6k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1', { marks: [{ sq: 'f2', tone: 'mark' }, { sq: 'g2', tone: 'mark' }, { sq: 'h2', tone: 'mark' }] }), 'Pawn moves are permanent'),
    ask('why-risky', 'Why can moving the g-pawn in front of a castled king be risky?', ['The pawn can never come back, so the squares around the king become weaker', 'It is not allowed', 'It always loses the pawn'], 0, ['What happens to the squares a pawn leaves behind?'], 'A pawn that has moved cannot go back. The squares it used to cover, such as f3 and h3, become holes that enemy pieces can use.', { wrong: { 1: 'It is legal. The risk is positional, not a rule.' } }),
    read(['A king trapped on its back rank by its own pawns can be checkmated by a rook or queen. A small pawn move, often h3 or h6, gives the king a flight square called “luft” (German for air).', 'It is worth making when a back-rank threat is near.'], board('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', { arrows: [{ from: 'h2', to: 'h3', tone: 'info' }] }), 'Luft'),
    ask('make-luft', 'White’s rook is on the back rank and the king has no escape squares. Which move gives the king a flight square?', ['h2-h3', 'Ra1-a2', 'Kg1-f1'], 0, ['The king needs a square off the first rank.', 'A pawn in front of the king has to move.'], 'After h3 the king can step to h2, so a rook on the back rank is no longer mate.', { board: board('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'), wrong: { 1: 'The rook move does not make any room for the king.', 2: 'The king would still be on the back rank.' } }),
  ],
  [
    sq('sh-1', 'After h3, which square gives White’s king a way off the back rank?', board('6k1/5ppp/8/8/8/7P/5PP1/R5K1 w - - 0 1'), ['h2'], 'The king can step to h2, since the pawn has moved from there to h3.'),
    tf('sh-2', 'A pawn that has moved in front of the king can return to its starting square.', false, 'Pawns only move forward. Every pawn move near the king is permanent.'),
    choice('sh-3', 'What is “luft”?', ['A flight square made for the king by moving a pawn', 'A type of sacrifice', 'A rook endgame'], 0, 'Luft is a flight square, often made with h3 or h6, so a back-rank check is not mate.'),
  ],
  { concepts: ['kingsafety.pawn-shelter', 'mate.back-rank'], reviewTags: ['allowed-mate'] },
);

const openLines = lesson(
  'att-open-lines', 'Open lines toward the king', 'King safety', 14,
  ['Spot open files and diagonals aimed at a king', 'Use rooks and queens on those lines', 'Find tactics against a king in the open'],
  [
    read(['Attacks need open lines. A rook on an open or half-open file near the enemy king, or a bishop on an open diagonal, brings real force against it.', 'If you are defending, notice the lines first: they tell you where the danger will come from.'], board('5rk1/5p1p/6p1/8/8/8/5PPP/3R2K1 w - - 0 1', { arrows: [{ from: 'd1', to: 'd8', tone: 'info' }] }), 'Open lines'),
    pz('B8sM9', 'exposedKing'),
    pz('Np1K0', 'exposedKing'),
  ],
  [pq('Khhax', 'exposedKing', L('att-open-lines')), pq('J7s2x', 'exposedKing', L('att-open-lines')), pq('NtakT', 'exposedKing', L('att-open-lines'))],
  { puzzleThemes: ['exposedKing'], concepts: ['attack.open-lines'] },
);

export const attackSafety: Chapter = {
  id: 'attack-safety', title: 'King safety', blurb: 'What protects a king and what makes it vulnerable.',
  lessons: [kingSafety, shelter, openLines],
  check: [
    choice('as-1', 'Which pawn move in front of a castled king is easiest to regret?', ['One that creates holes the opponent can use', 'One that makes luft in a back-rank threat', 'Staying put'], 0, 'Moves that create holes cannot be taken back.', L('att-pawn-shelter')),
    tf('as-2', 'A king with open files pointing at it is easier to attack.', true, 'Rooks and queens use open lines to reach the king.', L('att-open-lines')),
    choice('as-3', 'Besides pawns, what protects a king?', ['Nearby pieces', 'Having castled queenside always', 'A distant queen'], 0, 'Defenders close to the king can capture attackers and block lines.', L('att-king-safety')),
    sq('as-4', 'Click the square where White’s king can step to get off the back rank after h3.', board('6k1/5ppp/8/8/8/7P/5PP1/R5K1 w - - 0 1'), ['h2'], 'h2 is the new flight square.', L('att-pawn-shelter')),
    pq('YwnyW', 'exposedKing', L('att-open-lines')),
  ],
};

/* --------------------------------- D2: attacking --------------------------------- */

const kingsideAttack = lesson(
  'att-kingside-attack', 'Attacking a castled king', 'Attacking', 16,
  ['Bring more attackers than the defender has defenders', 'Open lines near the king', 'Calculate forcing lines before you sacrifice'],
  [
    read(['Attack a castled king when your pieces point at it and the centre is stable. Bring pieces first, then open lines with a pawn push or a sacrifice.', 'Before any sacrifice, calculate: checks, captures and threats, to the end. If the line is forced, go.'], board('r1bq1rk1/pp1nbppp/2p1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 1', { arrows: [{ from: 'd3', to: 'h7', tone: 'info' }] }), 'Aim at the king'),
    pz('UBR8l', 'kingsideAttack'),
    pz('opj8z', 'kingsideAttack'),
  ],
  [pq('lg9Oc', 'kingsideAttack', L('att-kingside-attack')), pq('zyACd', 'kingsideAttack', L('att-kingside-attack')), pq('4ng57', 'kingsideAttack', L('att-kingside-attack'))],
  { puzzleThemes: ['kingsideAttack'], concepts: ['attack.kingside'], reviewTags: ['missed-mate'] },
);

const f2f7 = lesson(
  'att-f2f7', 'The weak squares f2 and f7', 'Attacking', 12,
  ['Know why f2 and f7 are targets early on', 'Spot a queen and bishop aimed at f7', 'Find the mating pattern'],
  [
    read(['In the opening the pawn on f2 (or f7) is guarded only by the king. A bishop on c4 and a queen or knight can aim at it, and if it falls with check the game may end quickly.', 'Always count attackers and defenders on your own f-pawn too.'], board('r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', { arrows: [{ from: 'c4', to: 'f7', tone: 'info' }] }), 'The f7 pawn'),
    pz('gx9Ws', 'attackingF2F7'),
    pz('Clce3', 'attackingF2F7'),
  ],
  [pq('9bFcr', 'attackingF2F7', L('att-f2f7')), pq('MI2jJ', 'attackingF2F7', L('att-f2f7')), pq('PSGfr', 'attackingF2F7', L('att-f2f7'))],
  { puzzleThemes: ['attackingF2F7'], concepts: ['attack.f2-f7'], reviewPhases: ['opening'] },
);

const opposite = lesson(
  'att-opposite-castling', 'Opposite-side castling', 'Attacking', 14,
  ['Recognise a game where the kings are on opposite sides', 'Know the plan: push pawns at the enemy king', 'Know that speed matters'],
  [
    read(['When the kings castle on opposite sides, each player can push pawns toward the enemy king without weakening their own. The game becomes a race.', 'Open lines against the king quickly, before the other side does it to you.'], board('2kr3r/ppp2ppp/8/8/8/8/PPP2PPP/R4RK1 w - - 0 1', { marks: [{ sq: 'g1', tone: 'mark' }, { sq: 'c8', tone: 'mark' }] }), 'A race'),
    ask('storm', 'The kings are on opposite sides. What is usually the right plan?', ['Push pawns toward the enemy king to open files', 'Keep every pawn at home', 'Trade all the queens at once'], 0, ['Your own king is far from the action.'], 'With the kings apart, pawns can advance at the enemy king without exposing your own. Speed matters, because both players are doing the same.', { board: board('2kr3r/ppp2ppp/8/8/8/8/PPP2PPP/R4RK1 w - - 0 1'), wrong: { 2: 'Trading queens reduces your attacking chances, and the pawn storm usually needs the queen.' } }),
    pz('MGm4s', 'queensideAttack'),
    pz('B7vZt', 'queensideAttack'),
  ],
  [pq('Vp6ix', 'queensideAttack', L('att-opposite-castling')), pq('wmmDr', 'queensideAttack', L('att-opposite-castling')), tf('oc-1', 'In opposite-side castling, a slow plan usually loses the race.', true, 'Both sides attack, so the faster one usually wins.', L('att-opposite-castling'))],
  { puzzleThemes: ['queensideAttack'], concepts: ['attack.opposite-castling'] },
);

const defending = lesson(
  'att-defending', 'Defending against an attack', 'Defending', 14,
  ['List your defensive options before you panic', 'Trade the attacker or add a defender', 'Look for a counter-attack'],
  [
    read(['When you are attacked: first, find the threat. Then ask three questions. Can I capture or trade the attacker? Can I add a defender or block the line? Can I counter-attack something bigger?', 'Do not make weakening pawn moves in a panic.'], undefined, 'A calm checklist'),
    ask('defend-checklist', 'You face a serious threat. What do you do first?', ['Find exactly what the opponent threatens', 'Make a pawn move near your king', 'Sacrifice a piece at random'], 0, ['You cannot defend against a threat you have not identified.'], 'Always begin with the threat. Only then can you pick between capturing, defending, blocking or counter-attacking.'),
    pz('Sd2aU', 'defensiveMove'),
    pz('4nWc5', 'defensiveMove'),
  ],
  [pq('1dbkC', 'defensiveMove', L('att-defending')), pq('s0JOd', 'defensiveMove', L('att-defending')), pq('aaTxF', 'defensiveMove', L('att-defending'))],
  { puzzleThemes: ['defensiveMove'], concepts: ['defence.basics'], reviewTags: ['hung-piece', 'threw-away-advantage'] },
);

export const attackPlay: Chapter = {
  id: 'attack-play', title: 'Attacking and defending', blurb: 'Attack a castled king, use the weak squares near it, and defend when it is your turn to suffer.',
  lessons: [kingsideAttack, f2f7, opposite, defending],
  check: [
    pq('gs0oC', 'kingsideAttack', L('att-kingside-attack')),
    pq('SbKqE', 'kingsideAttack', L('att-kingside-attack')),
    pq('Kicw9', 'attackingF2F7', L('att-f2f7')),
    pq('c6amS', 'queensideAttack', L('att-opposite-castling')),
    choice('ap-1', 'What should you do first when you are attacked?', ['Work out the threat', 'Move a pawn near the king', 'Sacrifice a piece'], 0, 'You can only choose a defence once you know what the threat is.', L('att-defending')),
    tf('ap-2', 'Before a sacrifice, you should calculate the forcing lines to the end.', true, 'A sacrifice is only sound if the follow-up works.', L('att-kingside-attack')),
  ],
};

export const attackCourse: Course = {
  id: 'attack', title: 'King safety and attacking play', level: 'intermediate',
  blurb: 'Keep your own king safe, then learn how attacks on a castled king are built, and how to defend against them.',
  requires: ['tactics'],
  chapters: [attackSafety, attackPlay],
  assessment: [
    choice('att-a1', 'What are the three things that keep a king safe?', ['Pawn shield, nearby defenders, closed lines', 'A queen, two rooks and a bishop', 'Being in the centre'], 0, 'Shield, defenders and closed lines.', L('att-king-safety')),
    tf('att-a2', 'A pawn that has moved in front of the king can be moved back.', false, 'Pawns only go forward.', L('att-pawn-shelter')),
    choice('att-a3', 'What is a good plan when the kings castled on opposite sides?', ['Push pawns at the enemy king', 'Never move a pawn', 'Trade queens immediately'], 0, 'Open lines against the enemy king before they do it to you.', L('att-opposite-castling')),
    choice('att-a4', 'Why are f2 and f7 weak early in the game?', ['Only the king guards them', 'They are on the edge', 'Pawns there cannot be captured'], 0, 'Until a rook or other piece defends it, the pawn depends on the king alone.', L('att-f2f7')),
    sq('att-a5', 'Click the flight square the king gets after h3.', board('6k1/5ppp/8/8/8/7P/5PP1/R5K1 w - - 0 1'), ['h2'], 'h2 is the new square.', L('att-pawn-shelter')),
    tf('att-a6', 'Open files pointing at a king are a danger sign.', true, 'Rooks and queens use them to attack.', L('att-open-lines')),
    pq('vAlr5', 'kingsideAttack', L('att-kingside-attack')),
    pq('gwio3', 'queensideAttack', L('att-opposite-castling')),
  ],
};
