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

describe('GET /api/attempts/:id/result', () => {
  it('returns the score immediately after submitting, while the quiz is still open', async () => {
    const quiz = await makeQuiz({ classIds: [1], closesInDays: 2, questions: [{ points: 100 }] });
    const agent = await loginAs(app, '10A-001');
    const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    await agent.put(`/api/attempts/${body.attemptId}/answers/${quiz.questions[0]!.id}`)
      .send({ selectedOptionId: quiz.questions[0]!.options[0]!.id });
    await agent.post(`/api/attempts/${body.attemptId}/submit`);

    const res = await agent.get(`/api/attempts/${body.attemptId}/result`);
    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(true);
    expect(res.body.displayScore).toBe(100);
    expect(res.body.maxScore).toBe(100);
    expect(res.body.answersAvailableAt).toBeTruthy();
  });

  it('does not leak the correct option while the review is locked', async () => {
    const quiz = await makeQuiz({ classIds: [1], closesInDays: 2, questions: [{ points: 100 }] });
    const agent = await loginAs(app, '10A-001');
    const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    await agent.post(`/api/attempts/${body.attemptId}/submit`);
    const res = await agent.get(`/api/attempts/${body.attemptId}/result`);
    const payload = JSON.stringify(res.body);
    expect(payload).not.toMatch(/correctOptionId|is_correct|isCorrect/);
    expect(res.body.questions).toBeUndefined();
  });

  it('unlocks the review once the quiz has closed', async () => {
    const quiz = await makeQuiz({
      classIds: [1], opensInDays: -2, closesInDays: 2, questions: [{ points: 100 }] });
    const agent = await loginAs(app, '10A-001');
    const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    await agent.put(`/api/attempts/${body.attemptId}/answers/${quiz.questions[0]!.id}`)
      .send({ selectedOptionId: quiz.questions[0]!.options[1]!.id });   // wrong
    await agent.post(`/api/attempts/${body.attemptId}/submit`);
    await pool.query(`UPDATE quizzes SET closes_at = now() - interval '1 minute' WHERE id=$1`, [quiz.id]);

    const res = await agent.get(`/api/attempts/${body.attemptId}/result`);
    expect(res.body.locked).toBe(false);
    expect(res.body.questions).toHaveLength(1);
    expect(res.body.questions[0].correctOptionId).toBe(quiz.questions[0]!.options[0]!.id);
    expect(res.body.questions[0].yourOptionId).toBe(quiz.questions[0]!.options[1]!.id);
    expect(res.body.questions[0].awarded).toBe(0);
  });

  it('shows an unanswered question as blank in the unlocked review', async () => {
    const quiz = await makeQuiz({
      classIds: [1], opensInDays: -2, closesInDays: -1, questions: [{ points: 100 }] });
    const agent = await loginAs(app, '10A-001');
    await pool.query(
      `INSERT INTO attempts(quiz_id, student_id, started_at, expires_at, submitted_at,
                            submitted_reason, raw_score, display_score, max_score)
       SELECT $1, id, now() - interval '1 day', now() - interval '1 day', now() - interval '1 day',
              'expired', 0, 0, 100 FROM users WHERE login_code='10A-001'`, [quiz.id]);
    const { rows: [a] } = await pool.query(`SELECT id FROM attempts WHERE quiz_id=$1`, [quiz.id]);
    const res = await agent.get(`/api/attempts/${a.id}/result`);
    expect(res.body.locked).toBe(false);
    expect(res.body.questions[0].yourOptionId).toBeNull();
    expect(res.body.questions[0].awarded).toBe(0);
  });

  it("returns 404 for another student's result", async () => {
    const quiz = await makeQuiz({ classIds: [1], questions: [{ points: 100 }] });
    const owner = await loginAs(app, '10A-001');
    const { body } = await owner.post(`/api/quizzes/${quiz.id}/attempt`);
    await owner.post(`/api/attempts/${body.attemptId}/submit`);
    const other = await loginAs(app, '10A-002');
    expect((await other.get(`/api/attempts/${body.attemptId}/result`)).status).toBe(404);
  });

  it('refuses a result for an attempt still in progress', async () => {
    const quiz = await makeQuiz({ classIds: [1], questions: [{ points: 100 }] });
    const agent = await loginAs(app, '10A-001');
    const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    expect((await agent.get(`/api/attempts/${body.attemptId}/result`)).status).toBe(409);
  });
});

describe('GET /api/students/me/history', () => {
  it("lists the student's own attempts with scores, newest first", async () => {
    const agent = await loginAs(app, '10A-001');
    // Both quizzes must be open to be sat at all - a closed one cannot be started.
    for (let i = 0; i < 2; i++) {
      const quiz = await makeQuiz({
        classIds: [1], opensInDays: -3, closesInDays: 2, questions: [{ points: 100 }] });
      const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
      await agent.put(`/api/attempts/${body.attemptId}/answers/${quiz.questions[0]!.id}`)
        .send({ selectedOptionId: quiz.questions[0]!.options[0]!.id });
      await agent.post(`/api/attempts/${body.attemptId}/submit`);
    }
    const res = await agent.get('/api/students/me/history');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ displayScore: 100, maxScore: 100 });
    expect(res.body[0].submittedAt >= res.body[1].submittedAt).toBe(true);
  });

  it('is empty for a student who has taken nothing', async () => {
    const agent = await loginAs(app, '10A-002');
    expect((await agent.get('/api/students/me/history')).body).toEqual([]);
  });

  it("never includes another student's attempts", async () => {
    const quiz = await makeQuiz({ classIds: [1], questions: [{ points: 100 }] });
    const owner = await loginAs(app, '10A-001');
    const { body } = await owner.post(`/api/quizzes/${quiz.id}/attempt`);
    await owner.post(`/api/attempts/${body.attemptId}/submit`);
    const other = await loginAs(app, '10A-002');
    expect((await other.get('/api/students/me/history')).body).toEqual([]);
  });

  it('marks whether the review has been released for each attempt', async () => {
    const agent = await loginAs(app, '10A-001');
    const closed = await makeQuiz({
      classIds: [1], opensInDays: -3, closesInDays: 3, questions: [{ points: 100 }] });
    const open = await makeQuiz({
      classIds: [1], opensInDays: -3, closesInDays: 3, questions: [{ points: 100 }] });
    for (const quiz of [closed, open]) {
      const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
      await agent.post(`/api/attempts/${body.attemptId}/submit`);
    }
    // Close one retroactively: the only way to reach "sat, then closed", since
    // an already-closed quiz cannot be started in the first place.
    await pool.query(`UPDATE quizzes SET closes_at = now() - interval '1 minute' WHERE id=$1`, [closed.id]);
    const res = await agent.get('/api/students/me/history');
    const byQuiz = Object.fromEntries(res.body.map((r: { quizId: number }) => [r.quizId, r]));
    expect(byQuiz[closed.id].reviewReleased).toBe(true);
    expect(byQuiz[open.id].reviewReleased).toBe(false);
  });
});
