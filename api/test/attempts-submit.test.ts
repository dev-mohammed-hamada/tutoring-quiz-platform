import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { finalizeExpiredAttempts } from '../src/sweeper.js';
import { resetDb } from './helpers/db.js';
import { makeWorld, loginAs } from './helpers/world.js';
import { makeQuiz } from './helpers/quiz.js';

const app = createApp();
beforeAll(async () => { await migrate(); });
beforeEach(async () => { await resetDb(); await makeWorld(); });
afterAll(async () => { await pool.end(); });

describe('POST /api/attempts/:id/submit', () => {
  it('stamps the attempt and denormalises the totals', async () => {
    const quiz = await makeQuiz({ classIds: [1], questions: [{ points: 100 }, { points: 200 }] });
    const agent = await loginAs(app, '10A-001');
    const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    await agent.put(`/api/attempts/${body.attemptId}/answers/${quiz.questions[0]!.id}`)
      .send({ selectedOptionId: quiz.questions[0]!.options[0]!.id });

    const res = await agent.post(`/api/attempts/${body.attemptId}/submit`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ displayScore: 100, maxScore: 300 });

    const { rows: [a] } = await pool.query(
      `SELECT submitted_at, submitted_reason FROM attempts WHERE id=$1`, [body.attemptId]);
    expect(a.submitted_at).not.toBeNull();
    expect(a.submitted_reason).toBe('manual');
  });

  it('floors a negative raw total at zero for display but stores the raw value', async () => {
    const quiz = await makeQuiz({
      classIds: [1], negativeMarking: true, questions: [{ points: 100 }, { points: 200 }] });
    const agent = await loginAs(app, '10A-001');
    const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    for (const q of quiz.questions) {
      await agent.put(`/api/attempts/${body.attemptId}/answers/${q.id}`)
        .send({ selectedOptionId: q.options[1]!.id });   // both wrong
    }
    const res = await agent.post(`/api/attempts/${body.attemptId}/submit`);
    expect(res.body.displayScore).toBe(0);
    const { rows: [a] } = await pool.query(
      `SELECT raw_score, display_score FROM attempts WHERE id=$1`, [body.attemptId]);
    expect(a.raw_score).toBe(-100);   // -33 + -67
    expect(a.display_score).toBe(0);
  });

  it('scores zero for a paper with no answers at all', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, '10A-001');
    const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    const res = await agent.post(`/api/attempts/${body.attemptId}/submit`);
    expect(res.body.displayScore).toBe(0);
  });

  it('is idempotent — a second submit does not change the score or the timestamp', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, '10A-001');
    const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    const first = await agent.post(`/api/attempts/${body.attemptId}/submit`);
    const { rows: [before] } = await pool.query(`SELECT submitted_at FROM attempts WHERE id=$1`, [body.attemptId]);
    const second = await agent.post(`/api/attempts/${body.attemptId}/submit`);
    const { rows: [after] } = await pool.query(`SELECT submitted_at FROM attempts WHERE id=$1`, [body.attemptId]);
    expect(second.status).toBe(200);
    expect(second.body.displayScore).toBe(first.body.displayScore);
    expect(after.submitted_at.getTime()).toBe(before.submitted_at.getTime());
  });

  it('accepts a submit after expiry but adds no answers', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, '10A-001');
    const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    await pool.query(`UPDATE attempts SET expires_at = now() - interval '1 minute' WHERE id=$1`, [body.attemptId]);
    expect((await agent.post(`/api/attempts/${body.attemptId}/submit`)).status).toBe(200);
    const { rows } = await pool.query(`SELECT count(*)::int c FROM answers WHERE attempt_id=$1`, [body.attemptId]);
    expect(rows[0].c).toBe(0);
  });

  it("returns 404 for another student's attempt", async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const owner = await loginAs(app, '10A-001');
    const { body } = await owner.post(`/api/quizzes/${quiz.id}/attempt`);
    const other = await loginAs(app, '10A-002');
    expect((await other.post(`/api/attempts/${body.attemptId}/submit`)).status).toBe(404);
  });
});

describe('finalizeExpiredAttempts', () => {
  it('closes an abandoned attempt and scores what was answered', async () => {
    const quiz = await makeQuiz({ classIds: [1], questions: [{ points: 100 }, { points: 200 }] });
    const agent = await loginAs(app, '10A-001');
    const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    await agent.put(`/api/attempts/${body.attemptId}/answers/${quiz.questions[0]!.id}`)
      .send({ selectedOptionId: quiz.questions[0]!.options[0]!.id });
    await pool.query(`UPDATE attempts SET expires_at = now() - interval '1 minute' WHERE id=$1`, [body.attemptId]);

    expect(await finalizeExpiredAttempts()).toBe(1);
    const { rows: [a] } = await pool.query(
      `SELECT submitted_at, submitted_reason, display_score, expires_at FROM attempts WHERE id=$1`,
      [body.attemptId]);
    expect(a.submitted_reason).toBe('expired');
    expect(a.display_score).toBe(100);
    // Stamped at the deadline, not at sweep time, so a late sweep does not
    // misreport when the attempt actually ended.
    expect(a.submitted_at.getTime()).toBe(a.expires_at.getTime());
  });

  it('is idempotent — a second run finds nothing', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, '10A-001');
    const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    await pool.query(`UPDATE attempts SET expires_at = now() - interval '1 minute' WHERE id=$1`, [body.attemptId]);
    expect(await finalizeExpiredAttempts()).toBe(1);
    expect(await finalizeExpiredAttempts()).toBe(0);
  });

  it('leaves a live attempt alone', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, '10A-001');
    await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    expect(await finalizeExpiredAttempts()).toBe(0);
  });

  it('leaves an already submitted attempt alone, even once past its deadline', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, '10A-001');
    const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    await agent.post(`/api/attempts/${body.attemptId}/submit`);
    await pool.query(`UPDATE attempts SET expires_at = now() - interval '1 minute' WHERE id=$1`, [body.attemptId]);
    expect(await finalizeExpiredAttempts()).toBe(0);
    const { rows: [a] } = await pool.query(`SELECT submitted_reason FROM attempts WHERE id=$1`, [body.attemptId]);
    expect(a.submitted_reason).toBe('manual');
  });

  it('closes several abandoned attempts in one pass', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    for (const code of ['10A-001', '10A-002']) {
      const agent = await loginAs(app, code);
      await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    }
    await pool.query(`UPDATE attempts SET expires_at = now() - interval '1 minute'`);
    expect(await finalizeExpiredAttempts()).toBe(2);
  });
});
