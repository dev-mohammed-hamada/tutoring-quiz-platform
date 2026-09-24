import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { seed } from '../src/seed/index.js';
import { resetDb } from './helpers/db.js';

beforeAll(async () => { await migrate(); await resetDb(); await seed(); });
afterAll(async () => { await pool.end(); });

const count = async (sql: string, params: unknown[] = []) =>
  Number((await pool.query(sql, params)).rows[0].c);

describe('seed', () => {
  it('creates three classes with about twenty students each', async () => {
    expect(await count(`SELECT count(*) c FROM classes`)).toBe(3);
    const { rows } = await pool.query(
      `SELECT c.name, count(u.id)::int n FROM classes c JOIN users u ON u.class_id = c.id
       GROUP BY c.name ORDER BY c.name`);
    expect(rows.map(r => r.name)).toEqual(['10A', '10B', '11A']);
    for (const r of rows) expect(r.n).toBeGreaterThanOrEqual(18);
  });

  it('creates four teachers and one principal, each teacher assigned to a class', async () => {
    expect(await count(`SELECT count(*) c FROM users WHERE role='teacher'`)).toBe(4);
    expect(await count(`SELECT count(*) c FROM users WHERE role='principal'`)).toBe(1);
    expect(await count(
      `SELECT count(*) c FROM users u WHERE u.role='teacher'
         AND NOT EXISTS (SELECT 1 FROM teacher_classes tc WHERE tc.teacher_id = u.id)`)).toBe(0);
  });

  it('has two teachers sharing a class, so the reporting intersection is exercisable', async () => {
    expect(await count(
      `SELECT count(*) c FROM (
         SELECT class_id FROM teacher_classes GROUP BY class_id HAVING count(*) > 1) x`))
      .toBeGreaterThanOrEqual(1);
  });

  it('stores Arabic names intact', async () => {
    const { rows } = await pool.query(
      `SELECT full_name FROM users WHERE full_name ~ '[\\u0600-\\u06FF]' LIMIT 1`);
    expect(rows.length).toBe(1);
    expect(rows[0].full_name).toMatch(/[؀-ۿ]/);
  });

  it('ships both scoring modes from the same teacher, proving the setting lives on the quiz', async () => {
    const { rows } = await pool.query(
      `SELECT author_id FROM quizzes GROUP BY author_id
        HAVING bool_or(negative_marking) AND bool_or(NOT negative_marking)`);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('leaves at least two quizzes open so a reviewer can sit one and still explore', async () => {
    expect(await count(
      `SELECT count(*) c FROM quizzes WHERE is_published AND now() BETWEEN opens_at AND closes_at`))
      .toBeGreaterThanOrEqual(2);
  });

  it('ships a quiz that has not opened yet', async () => {
    expect(await count(`SELECT count(*) c FROM quizzes WHERE opens_at > now()`)).toBeGreaterThanOrEqual(1);
  });

  it('ships closed quizzes that already have results, so reports are not empty on first login', async () => {
    expect(await count(
      `SELECT count(*) c FROM attempts a JOIN quizzes q ON q.id = a.quiz_id
        WHERE a.submitted_at IS NOT NULL AND q.closes_at < now()`)).toBeGreaterThan(10);
  });

  it('ships at least one Arabic quiz and one English quiz', async () => {
    expect(await count(`SELECT count(*) c FROM quizzes WHERE language='ar'`)).toBeGreaterThanOrEqual(1);
    expect(await count(`SELECT count(*) c FROM quizzes WHERE language='en'`)).toBeGreaterThanOrEqual(1);
  });

  it('gives every question exactly four options and exactly one correct', async () => {
    expect(await count(
      `SELECT count(*) c FROM questions q
        WHERE (SELECT count(*) FROM options o WHERE o.question_id = q.id) <> 4
           OR (SELECT count(*) FROM options o WHERE o.question_id = q.id AND o.is_correct) <> 1`)).toBe(0);
  });

  it('gives every quiz fifteen questions', async () => {
    expect(await count(
      `SELECT count(*) c FROM quizzes q
        WHERE (SELECT count(*) FROM questions qq WHERE qq.quiz_id = q.id) <> 15`)).toBe(0);
  });

  it('scores historic attempts consistently with the scoring rules', async () => {
    // Every stored total must equal the sum of its own answer rows, and no
    // display score may be negative. A hand-written score would fail this.
    expect(await count(
      `SELECT count(*) c FROM attempts a
        WHERE a.submitted_at IS NOT NULL
          AND a.raw_score <> (SELECT COALESCE(SUM(points_awarded),0) FROM answers WHERE attempt_id = a.id)`))
      .toBe(0);
    expect(await count(`SELECT count(*) c FROM attempts WHERE display_score < 0`)).toBe(0);
    expect(await count(
      `SELECT count(*) c FROM attempts WHERE submitted_at IS NOT NULL
         AND display_score <> GREATEST(0, raw_score)`)).toBe(0);
  });

  it('produced at least one negative raw score, exercising the floor', async () => {
    expect(await count(`SELECT count(*) c FROM attempts WHERE raw_score < 0`)).toBeGreaterThan(0);
  });

  it('is idempotent — running twice changes nothing', async () => {
    const before = await count(`SELECT count(*) c FROM users`);
    const attemptsBefore = await count(`SELECT count(*) c FROM attempts`);
    await seed();
    expect(await count(`SELECT count(*) c FROM users`)).toBe(before);
    expect(await count(`SELECT count(*) c FROM attempts`)).toBe(attemptsBefore);
  });
});
