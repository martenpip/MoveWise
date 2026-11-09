import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, parseAcademy, parseBackup, validateAcademy, validateActivity } from '../src/storage/backup';
import { MemoryStore } from '../src/storage/store';
import { BACKUP_VERSION, DEFAULT_SETTINGS } from '../src/storage/types';
import { newAssessmentRecord, newLessonRecord, recordAssessment, recordCheck, evidenceFrom } from '../src/academy/progress';
import { CURRICULUM_INDEX } from '../src/academy/curriculum';
import { evaluateAchievements } from '../src/profile/achievements';
import { buildRating } from '../src/profile/rating';
import { assessments, lessons } from '../src/profile/training';
import type { AcademyRecord, MetaRecord } from '../src/academy/types';
import type { ActivityEvent } from '../src/profile/types';

const NOW = new Date(2026, 3, 1, 10).getTime();
const lesson = CURRICULUM_INDEX.lessons.get('what-is-chess')!.lesson;

function lessonRecord(at = NOW) {
  const rec = newLessonRecord(lesson.id, at);
  for (const s of lesson.steps) if ('id' in s) rec.exercises[s.id] = { attempts: 2, solved: true, clean: false, hints: 1 };
  rec.step = lesson.steps.length;
  return recordCheck(lesson, rec, { at, total: lesson.check.length, correct: lesson.check.map((q) => q.id), score: 1 });
}
const meta = (at: number, level: MetaRecord['level'] = 'new'): MetaRecord => ({ id: 'meta', kind: 'meta', updatedAt: at, opened: ['tactics'], level, lastLessonId: lesson.id });

test('the academy store holds lesson, assessment and meta records, and replaces by id', async () => {
  const s = new MemoryStore();
  assert.deepEqual(await s.listAcademy(), []);
  await s.putAcademy(lessonRecord());
  await s.putAcademy(meta(NOW));
  await s.putAcademy(newAssessmentRecord('beginner', 'course', NOW));
  assert.equal((await s.listAcademy()).length, 3);
  await s.putAcademy({ ...lessonRecord(), step: 99 });
  const all = await s.listAcademy();
  assert.equal(all.length, 3, 'same id replaces');
  assert.equal((all.find((r) => r.kind === 'lesson') as { step: number }).step, 99);
  await s.clearAll();
  assert.deepEqual(await s.listAcademy(), []);
});

test('backups carry Academy progress and restore it exactly', async () => {
  const a = new MemoryStore();
  const rec = lessonRecord();
  await a.putAcademy(rec);
  await a.putAcademy(meta(NOW, 'rules'));
  const json = JSON.parse(JSON.stringify(await a.exportAll()));
  assert.equal(json.version, BACKUP_VERSION);
  assert.equal(json.academy.length, 2);
  const b = new MemoryStore();
  await b.importAll(json);
  assert.deepEqual(await b.listAcademy(), await a.listAcademy());
});

test('a backup made before the Academy existed still imports, and leaves existing Academy progress alone', async () => {
  const old = JSON.parse(JSON.stringify(buildBackup(DEFAULT_SETTINGS, [], null, null, [], null, [], null, [])));
  delete old.academy;
  const parsed = parseBackup(old);
  assert.deepEqual(parsed.academy, []);
  const s = new MemoryStore();
  await s.putAcademy(lessonRecord());
  await s.importAll(old);
  assert.equal((await s.listAcademy()).length, 1);
});

test('importing merges by newest update: older backups never overwrite newer progress, newer ones do', async () => {
  const s = new MemoryStore();
  await s.putAcademy({ ...lessonRecord(NOW + 1000), step: 5 });
  const olderBackup = JSON.parse(JSON.stringify(await (async () => { const t = new MemoryStore(); await t.putAcademy({ ...lessonRecord(NOW), step: 1 }); return t.exportAll(); })()));
  await s.importAll(olderBackup);
  assert.equal((await s.listAcademy()).find((r) => r.kind === 'lesson')!.updatedAt, NOW + 1000, 'newer local record kept');
  const newerBackup = JSON.parse(JSON.stringify(await (async () => { const t = new MemoryStore(); await t.putAcademy({ ...lessonRecord(NOW + 5000), step: 9 }); return t.exportAll(); })()));
  await s.importAll(newerBackup);
  assert.equal((await s.listAcademy()).find((r) => r.kind === 'lesson')!.updatedAt, NOW + 5000, 'newer backup record wins');
});

test('damaged Academy records are rejected or cleaned, never stored as they came', () => {
  assert.throws(() => validateAcademy({ id: 'lesson:x', kind: 'lesson' }), 'a lesson record needs its lesson id');
  assert.throws(() => validateAcademy({ ...lessonRecord(), id: 'wrong' }), 'the id must match the lesson');
  assert.throws(() => validateAcademy({ id: 'meta', kind: 'other' }));
  assert.throws(() => validateAcademy(null));
  assert.deepEqual(validateAcademy(lessonRecord()), lessonRecord(), 'a good record round-trips unchanged');
  // unreadable parts are dropped, the rest kept
  const cleaned = validateAcademy({ ...lessonRecord(), checks: 'no', exercises: { a: 'junk', b: { attempts: -4, solved: 'yes', clean: true, hints: 2.7 } } });
  assert.equal(cleaned.kind === 'lesson' && cleaned.checks.length, 0);
  assert.ok(cleaned.kind === 'lesson' && cleaned.exercises.a === undefined);
  assert.ok(cleaned.kind === 'lesson' && cleaned.exercises.b!.attempts === 0 && cleaned.exercises.b!.solved === false && cleaned.exercises.b!.hints === 2);
  // on import, a bad record is skipped and the good ones are kept
  const mixed = parseAcademy([lessonRecord(), { id: 'x', kind: 'lesson' }, 'junk', meta(NOW)]);
  assert.equal(mixed.length, 2);
  assert.deepEqual(parseAcademy(undefined), []);
  assert.deepEqual(parseAcademy('nope'), []);
});

test('activity events for lessons and assessments validate, and assessments are never counted as lessons', () => {
  const l: ActivityEvent = { id: 'lesson:what-is-chess', kind: 'lesson', at: NOW, lessonId: 'what-is-chess', topic: 'The board and goal', completed: true, score: 0.9 };
  const a: ActivityEvent = { id: 'assess:beginner', kind: 'lesson', at: NOW, lessonId: 'assess:beginner', topic: 'Chess from zero: assessment', completed: true, score: 0.9, assessment: 'course', passed: true };
  assert.deepEqual(validateActivity(l), l);
  assert.deepEqual(validateActivity(a), a);
  assert.equal(lessons([l, a]).length, 1);
  assert.equal(assessments([l, a]).length, 1);
  // lesson achievements ignore assessments
  const out = evaluateAchievements({ games: [], activity: [a], rating: buildRating([]) });
  assert.ok(!out.find((x) => x.id === 'first-lesson')!.earned, 'passing an assessment is not completing a lesson');
  assert.ok(out.find((x) => x.id === 'first-lesson')!.available);
});

test('Academy achievements are earned only from real completions', () => {
  const find = (acts: ActivityEvent[], id: string) => evaluateAchievements({ games: [], activity: acts, rating: buildRating([]) }).find((x) => x.id === id)!;
  const ev = (id: string, at = NOW): ActivityEvent => ({ id: `lesson:${id}`, kind: 'lesson', at, lessonId: id, topic: 't', completed: true, score: 1 });
  const chapter = CURRICULUM_INDEX.chapters.get('beginner-board')!.chapter;
  assert.ok(!find([], 'first-chapter').earned);
  assert.ok(!find(chapter.lessons.slice(1).map((l) => ev(l.id)), 'first-chapter').earned, 'one lesson short');
  assert.ok(find(chapter.lessons.map((l) => ev(l.id)), 'first-chapter').earned);
  const beginner = CURRICULUM_INDEX.courseById.get('beginner')!;
  const all = beginner.chapters.flatMap((c) => c.lessons.map((l) => ev(l.id)));
  assert.ok(!find(all, 'student-of-chess').earned, 'completing every beginner lesson needs the course assessment too');
  const passed: ActivityEvent = { id: 'assess:beginner', kind: 'lesson', at: NOW, lessonId: 'assess:beginner', topic: 'x', completed: true, score: 0.9, assessment: 'course', passed: true };
  assert.ok(find([...all, passed], 'student-of-chess').earned || find([...all, passed], 'chess-scholar').earned, 'a finished beginner course earns a course achievement');
  assert.ok(!find([...all.slice(1), passed], 'chess-scholar').earned);
});

test('placement progress is stored as a record and read back as "known", never as completed lessons', async () => {
  const s = new MemoryStore();
  const beginner = CURRICULUM_INDEX.courseById.get('beginner')!;
  const rec = recordAssessment(newAssessmentRecord('beginner', 'course', NOW), { at: NOW, total: 12, correct: beginner.assessment.map((q) => q.id), score: 1 }, 0.7, true, false);
  await s.putAcademy(rec);
  const records: AcademyRecord[] = await s.listAcademy();
  const ev = evidenceFrom(records, []);
  assert.equal(ev.assessments.get('beginner')!.placed, true);
  assert.equal((await s.listActivity()).length, 0, 'no lesson events are written for a placement');
});
