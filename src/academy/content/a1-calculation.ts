import type { Chapter, Course } from '../types';
import { ask, choice, lesson, pq, pz, read, tf } from './dsl';

const L = (l: string) => ({ lesson: l });

const method = lesson(
  'calc-checks-captures', 'Checks, captures, threats', 'Calculation', 14,
  ['List forcing moves first: checks, captures and threats', 'Look for the opponent’s best reply, not the one you want', 'Stop a line when you have what you need'],
  [
    read(['Good calculation starts with forcing moves. Look at every check, then every capture, then every threat. Forcing moves limit what the opponent can do, so the tree of lines stays small.', 'For each line ask: what is the opponent’s best reply? Not the one you hope for. If your line survives it, play on.'], undefined, 'Where to start'),
    ask('calc-order', 'In which order should you look at moves when calculating?', ['Checks, captures, threats', 'Quiet moves first', 'Random order'], 0, ['Which moves force a reply?'], 'Forcing moves restrict the opponent, so they are the easiest to calculate. Quiet moves come after.'),
    pz('3DG8v', 'mateIn2'),
    pz('guhKX', 'mateIn2'),
  ],
  [pq('vCgEk', 'mateIn2', L('calc-checks-captures')), pq('B7uJo', 'mateIn2', L('calc-checks-captures')), pq('Ckhfe', 'mateIn2', L('calc-checks-captures'))],
  { puzzleThemes: ['mateIn2'], concepts: ['calc.forcing-moves'], reviewTags: ['missed-mate'] },
);

const forcing = lesson(
  'calc-forcing-lines', 'Calculating a forced line', 'Calculation', 14,
  ['Follow a line to its end', 'Check the opponent’s alternatives at each step', 'Avoid stopping one move too early'],
  [
    read(['A forcing line is one where every move of the opponent is almost forced. Follow it to the end: a checkmate, a won piece, or a position you can judge. Never stop on a move that leaves your piece hanging.', 'Before you play the first move, ask: what is the position at the end of the line, and is it good for me?'], undefined, 'Follow it to the end'),
    pz('zy8cO', 'mateIn3'),
    pz('gtE3q', 'mateIn3'),
  ],
  [pq('s0NTl', 'mateIn3', L('calc-forcing-lines')), pq('7z6Az', 'mateIn3', L('calc-forcing-lines')), pq('ryhAr', 'mateIn3', L('calc-forcing-lines'))],
  { puzzleThemes: ['mateIn3'], concepts: ['calc.forced-line'], reviewTags: ['missed-mate'] },
);

const quiet = lesson(
  'calc-quiet-moves', 'Quiet moves in a forcing world', 'Calculation', 14,
  ['Know that the best move may be neither check nor capture', 'Look for the move that stops the opponent’s idea', 'Calculate the threat the quiet move creates'],
  [
    read(['Sometimes there is no forcing move that works. A quiet move, neither check nor capture, can create a threat the opponent cannot parry, or remove their only defence.', 'When your forcing lines fail, ask what the opponent wants to do next, and whether a calm move stops it while improving your position.'], undefined, 'The quiet move'),
    pz('EL4gN', 'quietMove'),
    pz('s1Koz', 'quietMove'),
  ],
  [pq('iVdVJ', 'quietMove', L('calc-quiet-moves')), pq('KfFli', 'quietMove', L('calc-quiet-moves')), pq('XQbQm', 'quietMove', L('calc-quiet-moves'))],
  { puzzleThemes: ['quietMove'], concepts: ['calc.quiet-move'] },
);

export const calcMethod: Chapter = {
  id: 'calc-method', title: 'The method', blurb: 'Where to start, how deep to go and when quiet moves matter.',
  lessons: [method, forcing, quiet],
  check: [
    pq('yN4AF', 'mateIn2', L('calc-checks-captures')),
    pq('6QUfJ', 'mateIn3', L('calc-forcing-lines')),
    pq('9ZjMi', 'quietMove', L('calc-quiet-moves')),
    choice('cm-1', 'Which moves should you look at first when calculating?', ['Checks, captures and threats', 'Quiet moves', 'Pawn moves'], 0, 'They are forcing, so they narrow the tree.', L('calc-checks-captures')),
    tf('cm-2', 'You should assume the opponent will play the move you want.', false, 'Assume their best reply.', L('calc-forcing-lines')),
  ],
};

const visual = lesson(
  'calc-visualisation', 'Seeing deeper lines', 'Calculation', 16,
  ['Hold a position in your head after several moves', 'Check what changed on the board', 'Re-check each move for hanging pieces'],
  [
    read(['Calculating deeper means visualising: picture the board after your move and the reply, and ask what has changed. Which pieces moved, which lines opened, which squares are now attacked?', 'Practise by solving puzzles without moving the pieces. Say the whole line before you play.'], undefined, 'Picture the board'),
    pz('VozgW', 'mateIn4'),
    pz('Vlv4F', 'mateIn4'),
  ],
  [pq('iVnDt', 'mateIn4', L('calc-visualisation')), pq('EHR4U', 'mateIn3', L('calc-visualisation')), pq('vD0eq', 'mateIn3', L('calc-visualisation'))],
  { puzzleThemes: ['mateIn4', 'mateIn3'], concepts: ['calc.visualisation'], reviewTags: ['missed-mate'] },
);

const traps = lesson(
  'calc-traps', 'Trapped pieces and loose pieces', 'Calculation', 14,
  ['Spot a piece with no safe squares', 'Count attackers and defenders', 'Check your own pieces for the same danger'],
  [
    read(['A piece with no safe squares is trapped: it can be attacked and won. Before you move, check every piece: do the opponent’s next moves attack something that cannot escape?', 'Do the same for your own pieces before each move.'], undefined, 'Loose and trapped'),
    pz('Kh6vA', 'trappedPiece'),
    pz('gu056', 'trappedPiece'),
  ],
  [pq('CjFDv', 'trappedPiece', L('calc-traps')), pq('c9BXV', 'trappedPiece', L('calc-traps')), pq('1fsek', 'trappedPiece', L('calc-traps'))],
  { puzzleThemes: ['trappedPiece', 'hangingPiece'], concepts: ['calc.trapped-piece'], reviewTags: ['hung-piece'] },
);

export const calcPractice: Chapter = {
  id: 'calc-practice', title: 'Deeper calculation', blurb: 'Longer lines and loose pieces.',
  lessons: [visual, traps],
  check: [
    pq('zymiS', 'hangingPiece', L('calc-traps')),
    pq('SaKo7', 'hangingPiece', L('calc-traps')),
    pq('aZOxV', 'mateIn2', L('calc-visualisation')),
    choice('calc-cp-1', 'What is a trapped piece?', ['A piece with no safe squares', 'A piece that is pinned', 'A pawn on the seventh'], 0, 'It cannot move anywhere safe.', L('calc-traps')),
  ],
};

export const calculationCourse: Course = {
  id: 'calculation', title: 'Calculation', level: 'advanced',
  blurb: 'A method for looking ahead: forcing moves first, follow the line to the end, and know when a quiet move is better.',
  requires: ['tactics'],
  chapters: [calcMethod, calcPractice],
  assessment: [
    choice('ca-a1', 'What comes first when calculating?', ['Checks, captures, threats', 'Quiet moves', 'The pawn structure'], 0, 'Forcing moves restrict the opponent.', L('calc-checks-captures')),
    tf('ca-a2', 'Stop calculating on a move that leaves your piece hanging.', false, 'Follow the line to the end.', L('calc-forcing-lines')),
    choice('ca-a3', 'What can a quiet move do?', ['Create a threat that cannot be parried', 'Nothing', 'Only defend'], 0, 'It may have no check or capture but still win.', L('calc-quiet-moves')),
    tf('ca-a4', 'A piece with no safe squares can be won.', true, 'It is trapped.', L('calc-traps')),
    pq('k7kvQ', 'mateIn2', L('calc-checks-captures')),
    pq('3DkKl', 'quietMove', L('calc-quiet-moves')),
    choice('ca-a6', 'Before playing the first move of a line, you should ask…', ['What is the position at the end of the line?', 'How many pieces are left?', 'Which pawn is oldest?'], 0, 'Judge the final position, not just the first move.', L('calc-forcing-lines')),
    choice('ca-a5', 'How do you improve visualisation?', ['Solve puzzles by saying the whole line first', 'Play faster', 'Avoid endgames'], 0, 'Practise holding the position in your head.', L('calc-visualisation')),
  ],
};
