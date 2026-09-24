import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { resetDb } from './helpers/db.js';
import { makeWorld, loginAs } from './helpers/world.js';
import { makeQuiz, type BuiltQuiz } from './helpers/quiz.js';

const app = createApp();
beforeAll(async () => { await migrate(); });
beforeEach(async () => { await resetDb(); await makeWorld(); });
afterAll(async () => { await pool.end(); });

async function startAttempt(negativeMarking = false) {
  const quiz: BuiltQuiz = await makeQuiz({
    classIds: [1], negativeMarking, questions: [{ points: 100 }, { points: 200 }] });
  const agent = await loginAs(app, '10A-001');
  const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
  return { quiz, agent, attemptId: body.attemptId as number };
}

const awardedFor = async (attemptId: number, questionId: number) => {
  const { rows } = await pool.query(
    `SELECT points_possible, points_awarded FROM answers WHERE attempt_id=$1 AND question_id=$2`,
    [attemptId, questionId]);
  return rows[0];
};

describe('PUT /api/attempts/:id/answers/:questionId', () => {
  it('grades the answer at save time and snapshots what it was worth', async () => {
    const { quiz, agent, attemptId } = await startAttempt();
    const q = quiz.questions[0]!;
    const res = await agent.put(`/api/attempts/${attemptId}/answers/${q.id}`)
      .send({ selectedOptionId: q.options[0]!.id });
    expect(res.status).toBe(200);
    expect(await awardedFor(attemptId, q.id)).toEqual({ points_possible: 100, points_awarded: 100 });
  });

  it('applies the one-third deduction when the quiz has negative marking on', async () => {
    const { quiz, agent, attemptId } = await startAttempt(true);
    const q = quiz.questions[1]!;   // 2 marks
    await agent.put(`/api/attempts/${attemptId}/answers/${q.id}`)
      .send({ selectedOptionId: q.options[1]!.id });   // wrong
    expect((await awardedFor(attemptId, q.id)).points_awarded).toBe(-67);
  });

  it('awards zero for a wrong answer when negative marking is off', async () => {
    const { quiz, agent, attemptId } = await startAttempt(false);
    const q = quiz.questions[1]!;
    await agent.put(`/api/attempts/${attemptId}/answers/${q.id}`)
      .send({ selectedOptionId: q.options[1]!.id });
    expect((await awardedFor(attemptId, q.id)).points_awarded).toBe(0);
  });

  it('lets a student change their answer, replacing the grade rather than adding a row', async () => {
    const { quiz, agent, attemptId } = await startAttempt();
    const q = quiz.questions[0]!;
    await agent.put(`/api/attempts/${attemptId}/answers/${q.id}`).send({ selectedOptionId: q.options[1]!.id });
    await agent.put(`/api/attempts/${attemptId}/answers/${q.id}`).send({ selectedOptionId: q.options[0]!.id });
    const { rows } = await pool.query(`SELECT points_awarded FROM answers WHERE attempt_id=$1`, [attemptId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].points_awarded).toBe(100);
  });

  it('accepts a null selection as a blank, scoring zero and never penalising', async () => {
    const { quiz, agent, attemptId } = await startAttempt(true);
    const q = quiz.questions[0]!;
    await agent.put(`/api/attempts/${attemptId}/answers/${q.id}`).send({ selectedOptionId: null });
    expect((await awardedFor(attemptId, q.id)).points_awarded).toBe(0);
  });

  it('refuses an option belonging to a different question', async () => {
    const { quiz, agent, attemptId } = await startAttempt();
    const res = await agent.put(`/api/attempts/${attemptId}/answers/${quiz.questions[0]!.id}`)
      .send({ selectedOptionId: quiz.questions[1]!.options[0]!.id });
    expect(res.status).toBe(400);
  });

  it('refuses a question belonging to a different quiz', async () => {
    const { agent, attemptId } = await startAttempt();
    const other = await makeQuiz({ classIds: [1] });
    const res = await agent.put(`/api/attempts/${attemptId}/answers/${other.questions[0]!.id}`)
      .send({ selectedOptionId: other.questions[0]!.options[0]!.id });
    expect(res.status).toBe(400);
  });

  it('refuses an option that does not exist', async () => {
    const { quiz, agent, attemptId } = await startAttempt();
    const res = await agent.put(`/api/attempts/${attemptId}/answers/${quiz.questions[0]!.id}`)
      .send({ selectedOptionId: 999999 });
    expect(res.status).toBe(400);
  });

  it('accepts a save inside the latency grace window', async () => {
    const { quiz, agent, attemptId } = await startAttempt();
    await pool.query(`UPDATE attempts SET expires_at = now() - interval '2 seconds' WHERE id=$1`, [attemptId]);
    const q = quiz.questions[0]!;
    const res = await agent.put(`/api/attempts/${attemptId}/answers/${q.id}`)
      .send({ selectedOptionId: q.options[0]!.id });
    expect(res.status).toBe(200);
  });

  it('refuses a save past the grace window', async () => {
    const { quiz, agent, attemptId } = await startAttempt();
    await pool.query(`UPDATE attempts SET expires_at = now() - interval '30 seconds' WHERE id=$1`, [attemptId]);
    const q = quiz.questions[0]!;
    const res = await agent.put(`/api/attempts/${attemptId}/answers/${q.id}`)
      .send({ selectedOptionId: q.options[0]!.id });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('attempt_closed');
  });

  it('refuses a save once the attempt has been submitted', async () => {
    const { quiz, agent, attemptId } = await startAttempt();
    await pool.query(`UPDATE attempts SET submitted_at = now(), submitted_reason='manual' WHERE id=$1`, [attemptId]);
    const q = quiz.questions[0]!;
    const res = await agent.put(`/api/attempts/${attemptId}/answers/${q.id}`)
      .send({ selectedOptionId: q.options[0]!.id });
    expect(res.status).toBe(409);
  });

  it("refuses to write into another student's attempt, with 404", async () => {
    const { quiz, attemptId } = await startAttempt();
    const other = await loginAs(app, '10A-002');
    const q = quiz.questions[0]!;
    const res = await other.put(`/api/attempts/${attemptId}/answers/${q.id}`)
      .send({ selectedOptionId: q.options[0]!.id });
    expect(res.status).toBe(404);
  });

  it('rejects a malformed body with 400', async () => {
    const { quiz, agent, attemptId } = await startAttempt();
    const res = await agent.put(`/api/attempts/${attemptId}/answers/${quiz.questions[0]!.id}`)
      .send({ selectedOptionId: 'not-a-number' });
    expect(res.status).toBe(400);
  });
});
