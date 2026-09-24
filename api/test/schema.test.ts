import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { pool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';

beforeAll(async () => { await migrate(); });
afterAll(async () => { await pool.end(); });

beforeEach(async () => {
  await pool.query(`TRUNCATE answers, attempts, options, questions, quiz_classes, quizzes,
                    teacher_classes, sessions, users, classes RESTART IDENTITY CASCADE`);
});

async function seedMinimal() {
  const { rows: [cls] } = await pool.query(
    `INSERT INTO classes(name) VALUES ('10A') RETURNING id`);
  const { rows: [student] } = await pool.query(
    `INSERT INTO users(role, full_name, login_code, password_hash, class_id)
     VALUES ('student','ليلى حداد','s-test-1','x',$1) RETURNING id`, [cls.id]);
  const { rows: [teacher] } = await pool.query(
    `INSERT INTO users(role, full_name, login_code, password_hash)
     VALUES ('teacher','Samir Odeh','t-test-1','x') RETURNING id`);
  const { rows: [quiz] } = await pool.query(
    `INSERT INTO quizzes(title, author_id, language, time_limit_minutes, opens_at, closes_at)
     VALUES ('T', $1, 'en', 20, now() - interval '1 day', now() + interval '1 day') RETURNING id`,
    [teacher.id]);
  return { cls, student, teacher, quiz };
}

describe('schema constraints', () => {
  it('rejects a second attempt for the same student and quiz', async () => {
    const { student, quiz } = await seedMinimal();
    const insert = () => pool.query(
      `INSERT INTO attempts(quiz_id, student_id, started_at, expires_at, max_score)
       VALUES ($1,$2, now(), now() + interval '20 min', 2000)`, [quiz.id, student.id]);
    await insert();
    await expect(insert()).rejects.toThrow(/duplicate key|unique/i);
  });

  it('rejects a student without a class', async () => {
    await expect(pool.query(
      `INSERT INTO users(role, full_name, login_code, password_hash)
       VALUES ('student','No Class','s-bad','x')`)).rejects.toThrow(/violates check/i);
  });

  it('rejects a teacher who has a class', async () => {
    const { cls } = await seedMinimal();
    await expect(pool.query(
      `INSERT INTO users(role, full_name, login_code, password_hash, class_id)
       VALUES ('teacher','Has Class','t-bad','x',$1)`, [cls.id])).rejects.toThrow(/violates check/i);
  });

  it('allows at most one correct option per question', async () => {
    const { quiz } = await seedMinimal();
    const { rows: [q] } = await pool.query(
      `INSERT INTO questions(quiz_id, position, text, points) VALUES ($1,1,'Q',100) RETURNING id`, [quiz.id]);
    await pool.query(`INSERT INTO options(question_id, position, text, is_correct) VALUES ($1,1,'a',true)`, [q.id]);
    await expect(pool.query(
      `INSERT INTO options(question_id, position, text, is_correct) VALUES ($1,2,'b',true)`, [q.id]))
      .rejects.toThrow(/duplicate key|unique/i);
  });

  it('allows many incorrect options for one question', async () => {
    const { quiz } = await seedMinimal();
    const { rows: [q] } = await pool.query(
      `INSERT INTO questions(quiz_id, position, text, points) VALUES ($1,1,'Q',100) RETURNING id`, [quiz.id]);
    for (let i = 1; i <= 4; i++) {
      await pool.query(`INSERT INTO options(question_id, position, text, is_correct) VALUES ($1,$2,'o',$3)`,
        [q.id, i, i === 1]);
    }
    const { rows } = await pool.query(`SELECT count(*)::int c FROM options WHERE question_id=$1`, [q.id]);
    expect(rows[0].c).toBe(4);
  });

  it('rejects a quiz that closes before it opens', async () => {
    const { teacher } = await seedMinimal();
    await expect(pool.query(
      `INSERT INTO quizzes(title, author_id, language, time_limit_minutes, opens_at, closes_at)
       VALUES ('Bad', $1, 'en', 20, now(), now() - interval '1 hour')`, [teacher.id]))
      .rejects.toThrow(/violates check/i);
  });

  it('rejects a question worth zero or negative points', async () => {
    const { quiz } = await seedMinimal();
    await expect(pool.query(
      `INSERT INTO questions(quiz_id, position, text, points) VALUES ($1,1,'Q',0)`, [quiz.id]))
      .rejects.toThrow(/violates check/i);
  });

  it('round-trips Arabic text unchanged', async () => {
    await seedMinimal();
    const { rows: [r] } = await pool.query(`SELECT full_name FROM users WHERE login_code='s-test-1'`);
    expect(r.full_name).toBe('ليلى حداد');
  });

  it('cascades answers away when an attempt is deleted', async () => {
    const { student, quiz } = await seedMinimal();
    const { rows: [q] } = await pool.query(
      `INSERT INTO questions(quiz_id, position, text, points) VALUES ($1,1,'Q',100) RETURNING id`, [quiz.id]);
    const { rows: [a] } = await pool.query(
      `INSERT INTO attempts(quiz_id, student_id, started_at, expires_at, max_score)
       VALUES ($1,$2, now(), now() + interval '20 min', 100) RETURNING id`, [quiz.id, student.id]);
    await pool.query(
      `INSERT INTO answers(attempt_id, question_id, selected_option_id, points_possible, points_awarded)
       VALUES ($1,$2,NULL,100,0)`, [a.id, q.id]);
    await pool.query(`DELETE FROM attempts WHERE id=$1`, [a.id]);
    const { rows } = await pool.query(`SELECT count(*)::int c FROM answers`);
    expect(rows[0].c).toBe(0);
  });
});

describe('migrate', () => {
  it('is idempotent — running twice applies nothing new', async () => {
    const before = await pool.query(`SELECT count(*)::int c FROM schema_migrations`);
    await migrate();
    const after = await pool.query(`SELECT count(*)::int c FROM schema_migrations`);
    expect(after.rows[0].c).toBe(before.rows[0].c);
  });
});
