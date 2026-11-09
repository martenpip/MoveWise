import type { Course, Path } from '../types';
import { beginnerCourse } from './beginner';
import { positionalCourse } from './i2-positional';
import { strategyCourse } from './i3-strategy';
import { openingCourse } from './a4-openings';
import { advPositionalCourse } from './a2-adv-positional';
import { calculationCourse } from './a1-calculation';
import { endgameCourse } from './a3-endgames';
import { attackCourse } from './i4-attack';
import { tacticsCourse } from './i1-tactics';

export const CONTENT_COURSES: Course[] = [beginnerCourse, tacticsCourse, positionalCourse, strategyCourse, attackCourse, calculationCourse, endgameCourse, advPositionalCourse, openingCourse];

/** Learning paths. A path lists only courses that exist; `startAdvice` points a new learner at one of these ids. */
export const CONTENT_PATHS: Path[] = [
  { id: 'beginner', title: 'Beginner path', blurb: 'From the board and the pieces to your first complete games.', courses: ['beginner'] },
  { id: 'advanced', title: 'Advanced path', blurb: 'Tactics, positional play, attack, calculation and endgame theory for experienced players.', courses: ['tactics', 'positional', 'strategy', 'adv-positional', 'openings', 'attack', 'calculation', 'endgames'] },
  { id: 'strategist', title: 'Strategist path', blurb: 'Pawn structures, plans and long-term positional play.', courses: ['positional', 'strategy', 'adv-positional'] },
  { id: 'tactician', title: 'Tactician path', blurb: 'Recognise and calculate the patterns behind winning combinations.', courses: ['beginner', 'tactics', 'attack'] },
];
