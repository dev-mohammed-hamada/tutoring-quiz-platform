import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { resetDb } from './helpers/db.js';
import { makeWorld, loginAs } from './helpers/world.js';
import { makeQuiz } from './helpers/quiz.js';

const app = createApp();
beforeAll(async () => { await migrate(); });
beforeEach(async () => { await resetDb(); await makeWorld(); });
afterAll(async () => { await pool.end(); });

describe('POST /api/quizzes/:id/attempt', () => {
  it('starts an attempt and fixes the deadline from the server clock', async () => {
    const quiz = await makeQuiz({ classIds: [1], timeLimitMinutes: 20 });
    const agent = await loginAs(app, '10A-001');
    const res = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    expect(res.status).toBe(201);

    const { rows: [a] } = await pool.query(
      `SELECT started_at, expires_at, max_score FROM attempts WHERE id=$1`, [res.body.attemptId]);
    const minutes = (a.expires_at.getTime() - a.started_at.getTime()) / 60000;
    expect(minutes).toBeCloseTo(20, 1);
    expect(a.max_score).toBe(300);   // 100 + 200
  });

  it('refuses a second attempt', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, '10A-001');
    await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    const res = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('already_attempted');
  });

  it('creates exactly one attempt when two requests race', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, '10A-001');
    const results = await Promise.all([
      agent.post(`/api/quizzes/${quiz.id}/attempt`),
      agent.post(`/api/quizzes/${quiz.id}/attempt`),
    ]);
    expect(results.filter(r => r.status === 201)).toHaveLength(1);
    expect(results.filter(r => r.status === 409)).toHaveLength(1);
    const { rows } = await pool.query(`SELECT count(*)::int c FROM attempts WHERE quiz_id=$1`, [quiz.id]);
    expect(rows[0].c).toBe(1);
  });

  it('refuses before the window opens and after it closes', async () => {
    const future = await makeQuiz({ classIds: [1], opensInDays: 2, closesInDays: 5 });
    const past = await makeQuiz({ classIds: [1], opensInDays: -5, closesInDays: -2 });
    const agent = await loginAs(app, '10A-001');
    expect((await agent.post(`/api/quizzes/${future.id}/attempt`)).body.error).toBe('not_open_yet');
    expect((await agent.post(`/api/quizzes/${past.id}/attempt`)).body.error).toBe('closed');
  });

  it('refuses a student whose class was not targeted, with 404', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, '11A-001');
    expect((await agent.post(`/api/quizzes/${quiz.id}/attempt`)).status).toBe(404);
  });

  it('refuses an unpublished quiz with 404', async () => {
    const quiz = await makeQuiz({ classIds: [1], publish: false });
    const agent = await loginAs(app, '10A-001');
    expect((await agent.post(`/api/quizzes/${quiz.id}/attempt`)).status).toBe(404);
  });

  it('refuses a teacher', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, 'teacher-samir');
    expect((await agent.post(`/api/quizzes/${quiz.id}/attempt`)).status).toBe(403);
  });

  it('refuses a quiz that does not exist', async () => {
    const agent = await loginAs(app, '10A-001');
    expect((await agent.post('/api/quizzes/999999/attempt')).status).toBe(404);
  });
});

describe('GET /api/attempts/:id', () => {
  it('never includes which option is correct', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, '10A-001');
    const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    const res = await agent.get(`/api/attempts/${body.attemptId}`);
    expect(res.status).toBe(200);
    const payload = JSON.stringify(res.body);
    expect(payload).not.toMatch(/isCorrect|is_correct/);
    expect(res.body.questions).toHaveLength(2);
    expect(res.body.questions[0].options).toHaveLength(4);
    for (const o of res.body.questions[0].options) {
      expect(Object.keys(o).sort()).toEqual(['id', 'position', 'text']);
    }
  });

  it('returns the server clock alongside the deadline', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, '10A-001');
    const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    const res = await agent.get(`/api/attempts/${body.attemptId}`);
    expect(new Date(res.body.serverNow).getTime()).toBeGreaterThan(0);
    expect(new Date(res.body.attempt.expiresAt).getTime())
      .toBeGreaterThan(new Date(res.body.serverNow).getTime());
    expect(res.body.attempt.state).toBe('in_progress');
  });

  it('returns saved answers so a refresh mid-attempt loses nothing', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, '10A-001');
    const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    await pool.query(
      `INSERT INTO answers(attempt_id, question_id, selected_option_id, points_possible, points_awarded)
       VALUES ($1,$2,$3,100,100)`,
      [body.attemptId, quiz.questions[0]!.id, quiz.questions[0]!.options[0]!.id]);
    const res = await agent.get(`/api/attempts/${body.attemptId}`);
    expect(res.body.answers).toEqual([
      { questionId: quiz.questions[0]!.id, selectedOptionId: quiz.questions[0]!.options[0]!.id },
    ]);
  });

  it("returns 404, not 403, for another student's attempt", async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const owner = await loginAs(app, '10A-001');
    const { body } = await owner.post(`/api/quizzes/${quiz.id}/attempt`);
    const other = await loginAs(app, '10A-002');
    expect((await other.get(`/api/attempts/${body.attemptId}`)).status).toBe(404);
  });

  it('reports an expired attempt as expired', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, '10A-001');
    const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    await pool.query(`UPDATE attempts SET expires_at = now() - interval '1 minute' WHERE id=$1`, [body.attemptId]);
    const res = await agent.get(`/api/attempts/${body.attemptId}`);
    expect(res.body.attempt.state).toBe('expired');
  });
});
