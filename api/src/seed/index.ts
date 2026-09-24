import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db/pool.js';
import { hashPassword } from '../auth/password.js';
import { gradeAnswer, totalScore } from '../domain/scoring.js';
import { parseCsv } from './csv.js';

// Resolves to the repository root from both src/ (tsx) and dist/ (compiled).
const DATA = process.env.SEED_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '../../../data');
const read = async (f: string) => parseCsv(await readFile(join(DATA, f), 'utf8'));

/**
 * Deterministic PRNG so the sample data is identical on every machine.
 *
 * splitmix32, not a plain LCG. A textbook LCG seeded with consecutive integers
 * produces nearly identical first outputs - the seeds differ by far less than
 * the modulus - so every student in a quiz would draw the same "random" values
 * and whole cohorts would skip or sit the quiz together. splitmix32 avalanches
 * the seed before emitting anything.
 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function seed(): Promise<void> {
  const { rowCount } = await pool.query(`SELECT 1 FROM users WHERE login_code = 'principal'`);
  if (rowCount) return;   // fixed dataset: one marker row is enough

  const classes = await seedClasses();
  const users = await seedUsers(classes);
  await seedTeacherClasses(users, classes);
  const quizzes = await seedQuizzes(users, classes);
  await seedHistoricAttempts(quizzes, classes);
}

async function seedClasses(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const row of await read('classes.csv')) {
    const { rows: [r] } = await pool.query(
      `INSERT INTO classes(name) VALUES ($1) RETURNING id`, [row.name]);
    map.set(row.name!, r.id);
  }
  return map;
}

async function seedUsers(classes: Map<string, number>): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  // One hash reused across the sample accounts: they all share a documented
  // password, and hashing 65 times would add seconds to every boot.
  const hash = await hashPassword('pass1234');

  for (const row of await read('teachers.csv')) {
    const { rows: [r] } = await pool.query(
      `INSERT INTO users(role, full_name, login_code, password_hash, locale)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [row.role, row.full_name, row.login_code, hash, row.locale]);
    map.set(row.login_code!, r.id);
  }

  for (const row of await read('students.csv')) {
    const classId = classes.get(row.class_name!);
    if (!classId) throw new Error(`students.csv: unknown class ${row.class_name}`);
    const { rows: [r] } = await pool.query(
      `INSERT INTO users(role, full_name, login_code, password_hash, locale, class_id)
       VALUES ('student',$1,$2,$3,$4,$5) RETURNING id`,
      [row.full_name, row.login_code, hash, row.locale, classId]);
    map.set(row.login_code!, r.id);
  }
  return map;
}

async function seedTeacherClasses(users: Map<string, number>, classes: Map<string, number>) {
  for (const row of await read('teacher-classes.csv')) {
    await pool.query(`INSERT INTO teacher_classes(teacher_id, class_id) VALUES ($1,$2)`,
      [users.get(row.teacher_login_code!), classes.get(row.class_name!)]);
  }
}

interface SeededQuiz {
  id: number; classIds: number[]; negativeMarking: boolean; closed: boolean;
  questions: { id: number; points: number; correctOptionId: number; optionIds: number[] }[];
}

async function seedQuizzes(users: Map<string, number>, classes: Map<string, number>) {
  const out: SeededQuiz[] = [];

  for (const row of await read('quizzes.csv')) {
    const opens = Number(row.opens_at_offset_days);
    const closesOffset = Number(row.closes_at_offset_days);
    const { rows: [q] } = await pool.query(
      `INSERT INTO quizzes(title, author_id, language, time_limit_minutes,
                           opens_at, closes_at, negative_marking, is_published)
       VALUES ($1,$2,$3,$4, now() + ($5 || ' days')::interval, now() + ($6 || ' days')::interval, $7, true)
       RETURNING id`,
      [row.title, users.get(row.author_login_code!), row.language,
       Number(row.time_limit_minutes), opens, closesOffset, row.negative_marking === 'true']);

    const classIds = row.classes!.split('|').map((n) => classes.get(n.trim())!);
    for (const cid of classIds) {
      await pool.query(`INSERT INTO quiz_classes(quiz_id, class_id) VALUES ($1,$2)`, [q.id, cid]);
    }

    const questions: SeededQuiz['questions'] = [];
    for (const qr of await read(row.questions_file!)) {
      const { rows: [qq] } = await pool.query(
        `INSERT INTO questions(quiz_id, position, text, points) VALUES ($1,$2,$3,$4) RETURNING id`,
        [q.id, Number(qr.position), qr.text, Number(qr.points)]);

      const optionIds: number[] = [];
      let correctOptionId = 0;
      for (const [i, letter] of ['a', 'b', 'c', 'd'].entries()) {
        const isCorrect = qr.correct === letter;
        const { rows: [op] } = await pool.query(
          `INSERT INTO options(question_id, position, text, is_correct) VALUES ($1,$2,$3,$4) RETURNING id`,
          [qq.id, i + 1, qr[`option_${letter}`], isCorrect]);
        optionIds.push(op.id);
        if (isCorrect) correctOptionId = op.id;
      }
      questions.push({ id: qq.id, points: Number(qr.points), correctOptionId, optionIds });
    }

    out.push({ id: q.id, classIds, negativeMarking: row.negative_marking === 'true',
               closed: closesOffset < 0, questions });
  }
  return out;
}

/**
 * Gives the already-closed quizzes a realistic spread of results, so reports are
 * not empty on first login. Every mark goes through the real scoring functions -
 * a hand-written score could disagree with the rules it is meant to demonstrate.
 */
async function seedHistoricAttempts(quizzes: SeededQuiz[], classes: Map<string, number>) {
  for (const quiz of quizzes.filter((q) => q.closed)) {
    const { rows: students } = await pool.query(
      `SELECT id FROM users WHERE role='student' AND class_id = ANY($1::bigint[]) ORDER BY id`,
      [quiz.classIds]);

    for (const [i, student] of students.entries()) {
      const rand = rng(quiz.id * 1000 + i);
      if (rand() < 0.1) continue;                    // a few never sat it

      // Ability spread: strong, average, weak, plus one guesser per cohort.
      const ability = i % 7 === 0 ? 0.15 : 0.3 + rand() * 0.6;

      const { rows: [attempt] } = await pool.query(
        `INSERT INTO attempts(quiz_id, student_id, started_at, expires_at, max_score)
         VALUES ($1,$2, now() - interval '5 days', now() - interval '5 days' + interval '20 minutes', $3)
         RETURNING id`,
        [quiz.id, student.id, quiz.questions.reduce((s, q) => s + q.points, 0)]);

      const awarded: number[] = [];
      for (const q of quiz.questions) {
        const roll = rand();
        let selected: number | null;
        let isCorrect: boolean | null;
        if (roll < 0.08) { selected = null; isCorrect = null; }          // left blank
        else if (roll < 0.08 + ability) { selected = q.correctOptionId; isCorrect = true; }
        else {
          const wrong = q.optionIds.filter((id) => id !== q.correctOptionId);
          selected = wrong[Math.floor(rand() * wrong.length)]!;
          isCorrect = false;
        }
        const points = gradeAnswer(q.points, isCorrect, quiz.negativeMarking);
        awarded.push(points);
        await pool.query(
          `INSERT INTO answers(attempt_id, question_id, selected_option_id, points_possible, points_awarded)
           VALUES ($1,$2,$3,$4,$5)`,
          [attempt.id, q.id, selected, q.points, points]);
      }

      const { raw, display } = totalScore(awarded);
      await pool.query(
        `UPDATE attempts SET submitted_at = now() - interval '5 days' + interval '14 minutes',
                             submitted_reason = 'manual', raw_score = $2, display_score = $3
          WHERE id = $1`,
        [attempt.id, raw, display]);
    }
  }
}
