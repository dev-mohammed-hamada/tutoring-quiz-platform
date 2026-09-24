import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
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

const questionBody = (over: Partial<{ text: string; points: number; options: unknown[] }> = {}) => ({
  text: 'Updated question',
  points: 200,
  options: [
    { text: 'a', isCorrect: false }, { text: 'b', isCorrect: true },
    { text: 'c', isCorrect: false }, { text: 'd', isCorrect: false }],
  ...over,
});

describe('GET /api/me/classes', () => {
  it('gives a teacher exactly the classes they are assigned to', async () => {
    const agent = await loginAs(app, 'teacher-rana');   // 10A only
    const res = await agent.get('/api/me/classes');
    expect(res.status).toBe(200);
    expect(res.body.map((c: { name: string }) => c.name)).toEqual(['10A']);
  });

  it('gives the principal every class', async () => {
    const agent = await loginAs(app, 'principal');
    const res = await agent.get('/api/me/classes');
    expect(res.body.map((c: { name: string }) => c.name)).toEqual(['10A', '10B', '11A']);
  });

  it('is not a student route', async () => {
    const agent = await loginAs(app, '10A-001');
    expect((await agent.get('/api/me/classes')).status).toBe(403);
  });
});

describe('GET /api/quizzes/:id for staff', () => {
  it('includes the answer key, which is what an author needs to edit', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, 'teacher-samir');
    const res = await agent.get(`/api/quizzes/${quiz.id}`);

    expect(res.status).toBe(200);
    expect(res.body.questions).toHaveLength(2);
    const correct = res.body.questions[0].options.filter((o: { isCorrect: boolean }) => o.isCorrect);
    expect(correct).toHaveLength(1);
    expect(res.body.classIds).toEqual([1]);
  });

  it('is 404 for a teacher who does not author it, not 403', async () => {
    const quiz = await makeQuiz({ classIds: [1], authorLogin: 'teacher-rana' });
    const agent = await loginAs(app, 'teacher-samir');
    // Samir teaches 10A too, but the quiz is Rana's. 404 refuses to confirm the id.
    expect((await agent.get(`/api/quizzes/${quiz.id}`)).status).toBe(404);
  });

  it('never serves the answer key to a student', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, '10A-001');
    const res = await agent.get(`/api/quizzes/${quiz.id}`);
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toMatch(/isCorrect/);
  });
});

describe('PATCH /api/quizzes/:id', () => {
  it('updates the settings an author is allowed to change', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, 'teacher-samir');

    const res = await agent.patch(`/api/quizzes/${quiz.id}`).send({
      title: 'Renamed', timeLimitMinutes: 45, negativeMarking: true, classIds: [1, 2],
    });
    expect(res.status).toBe(204);

    const after = await agent.get(`/api/quizzes/${quiz.id}`);
    expect(after.body).toMatchObject({ title: 'Renamed', timeLimitMinutes: 45, negativeMarking: true });
    expect(after.body.classIds.sort()).toEqual([1, 2]);
  });

  it('refuses to retarget a quiz at a class the teacher does not teach', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, 'teacher-samir');   // teaches 10A and 10B, not 11A
    expect((await agent.patch(`/api/quizzes/${quiz.id}`).send({ classIds: [3] })).status).toBe(403);
  });

  it('keeps closesAt after opensAt', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, 'teacher-samir');
    const res = await agent.patch(`/api/quizzes/${quiz.id}`).send({
      opensAt: new Date(Date.now() + 7200e3).toISOString(),
      closesAt: new Date(Date.now() + 3600e3).toISOString(),
    });
    expect(res.status).toBe(400);
  });

  it('is 404 for someone else\'s quiz', async () => {
    const quiz = await makeQuiz({ classIds: [1], authorLogin: 'teacher-rana' });
    const agent = await loginAs(app, 'teacher-samir');
    expect((await agent.patch(`/api/quizzes/${quiz.id}`).send({ title: 'x' })).status).toBe(404);
  });
});

describe('PUT /api/quizzes/:id/questions/:questionId', () => {
  it('replaces the text, the marks and the answer key', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, 'teacher-samir');
    const target = quiz.questions[0]!;

    const res = await agent.put(`/api/quizzes/${quiz.id}/questions/${target.id}`).send(questionBody());
    expect(res.status).toBe(204);

    const after = await agent.get(`/api/quizzes/${quiz.id}`);
    const edited = after.body.questions.find((q: { id: number }) => q.id === target.id);
    expect(edited).toMatchObject({ text: 'Updated question', points: 200 });
    expect(edited.options.find((o: { isCorrect: boolean }) => o.isCorrect).text).toBe('b');
    expect(edited.options).toHaveLength(4);
  });

  it('refuses a question that belongs to a different quiz', async () => {
    const mine = await makeQuiz({ classIds: [1] });
    const other = await makeQuiz({ classIds: [2] });
    const agent = await loginAs(app, 'teacher-samir');
    const res = await agent.put(`/api/quizzes/${mine.id}/questions/${other.questions[0]!.id}`)
      .send(questionBody());
    expect(res.status).toBe(404);
  });

  it('still demands exactly one correct option', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, 'teacher-samir');
    const res = await agent.put(`/api/quizzes/${quiz.id}/questions/${quiz.questions[0]!.id}`)
      .send(questionBody({ options: [
        { text: 'a', isCorrect: true }, { text: 'b', isCorrect: true },
        { text: 'c', isCorrect: false }, { text: 'd', isCorrect: false }] }));
    expect(res.status).toBe(400);
  });
});

/**
 * Spec §11. The answer snapshots in `answers.points_possible` / `points_awarded`
 * exist for exactly this, but until there was an edit route there was no way to
 * prove it. A grade already recorded is history and must not move.
 */
describe('editing a question after it has been answered', () => {
  it('leaves every recorded grade exactly where it was', async () => {
    const quiz = await makeQuiz({ classIds: [1], questions: [{ points: 100 }, { points: 200 }] });
    const student = await loginAs(app, '10A-001');

    const start = await student.post(`/api/quizzes/${quiz.id}/attempt`);
    const attemptId = start.body.attemptId;
    const q1 = quiz.questions[0]!;
    const q2 = quiz.questions[1]!;

    // Right on the first, wrong on the second.
    await student.put(`/api/attempts/${attemptId}/answers/${q1.id}`)
      .send({ selectedOptionId: q1.options[0]!.id });
    await student.put(`/api/attempts/${attemptId}/answers/${q2.id}`)
      .send({ selectedOptionId: q2.options[1]!.id });
    const submitted = await student.post(`/api/attempts/${attemptId}/submit`);
    const scoreBefore = submitted.body.displayScore;
    expect(scoreBefore).toBe(100);

    const { rows: before } = await pool.query(
      `SELECT question_id, points_possible, points_awarded FROM answers
        WHERE attempt_id = $1 ORDER BY question_id`, [attemptId]);

    // The teacher now rewrites the first question: different marks, different key.
    const teacher = await loginAs(app, 'teacher-samir');
    const edit = await teacher.put(`/api/quizzes/${quiz.id}/questions/${q1.id}`).send(questionBody());
    expect(edit.status).toBe(204);

    const { rows: after } = await pool.query(
      `SELECT question_id, points_possible, points_awarded FROM answers
        WHERE attempt_id = $1 ORDER BY question_id`, [attemptId]);
    expect(after).toEqual(before);

    const { rows: [attempt] } = await pool.query(
      `SELECT display_score, raw_score FROM attempts WHERE id = $1`, [attemptId]);
    expect(attempt.display_score).toBe(scoreBefore);
  });
});
