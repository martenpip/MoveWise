// Dev helper: validates all bundled Academy content and prints the problems. `npx tsx scripts/validate-academy.mts`
import { COURSES, PATHS } from '../src/academy/curriculum';
import { validateCurriculum } from '../src/academy/validate';
const problems = validateCurriculum(COURSES, PATHS);
const lessons = COURSES.reduce((n, c) => n + c.chapters.reduce((m, ch) => m + ch.lessons.length, 0), 0);
console.log(`${COURSES.length} courses, ${lessons} lessons, ${problems.length} problems`);
for (const p of problems) console.log(' -', p);
process.exit(problems.length ? 1 : 0);
