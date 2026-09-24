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

/** Sits `quiz` as `loginCode`, answering the first `correctCount` questions correctly. */
async function sit(quiz: BuiltQuiz, loginCode: string, correctCount: number) {
  const agent = await loginAs(app, loginCode);
  const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
  for (const [i, q] of quiz.questions.entries()) {
    await agent.put(`/api/attempts/${body.attemptId}/answers/${q.id}`)
      .send({ selectedOptionId: q.options[i < correctCount ? 0 : 1]!.id });
  }
  await agent.post(`/api/attempts/${body.attemptId}/submit`);
  return body.attemptId as number;
}

describe('GET /api/reports/quizzes', () => {
  it('shows a teacher the class average for their own quiz in a class they teach', async () => {
    const quiz = await makeQuiz({
      classIds: [1], authorLogin: 'teacher-samir', questions: [{ points: 100 }, { points: 200 }] });
    await sit(quiz, '10A-001', 2);   // 300 of 300
    await sit(quiz, '10A-002', 1);   // 100 of 300

    const teacher = await loginAs(app, 'teacher-samir');
    const res = await teacher.get('/api/reports/quizzes');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const cls = res.body[0].classes[0];
    expect(cls).toMatchObject({ name: '10A', averageDisplayScore: 200, maxScore: 300, submitted: 2 });
  });

  it("does not show a teacher another teacher's quiz, even in a class they teach", async () => {
    // Rana authors for 10A; Samir also teaches 10A but did not write it.
    await makeQuiz({ classIds: [1], authorLogin: 'teacher-rana' });
    const samir = await loginAs(app, 'teacher-samir');
    expect((await samir.get('/api/reports/quizzes')).body).toEqual([]);
  });

  it('does not show a teacher their own quiz for a class they do not teach', async () => {
    // Samir authors for 11A, which he is not assigned to.
    await makeQuiz({ classIds: [3], authorLogin: 'teacher-samir' });
    const samir = await loginAs(app, 'teacher-samir');
    expect((await samir.get('/api/reports/quizzes')).body).toEqual([]);
  });

  it('shows the principal every quiz and every class', async () => {
    await makeQuiz({ classIds: [1], authorLogin: 'teacher-samir' });
    await makeQuiz({ classIds: [3], authorLogin: 'teacher-rana' });
    const principal = await loginAs(app, 'principal');
    expect((await principal.get('/api/reports/quizzes')).body).toHaveLength(2);
  });

  it('counts students who have not submitted in the total but not in the average', async () => {
    const quiz = await makeQuiz({ classIds: [1], questions: [{ points: 100 }] });
    await sit(quiz, '10A-001', 1);   // 100 of 100; 10A-002 does not sit it
    const teacher = await loginAs(app, 'teacher-samir');
    const cls = (await teacher.get('/api/reports/quizzes')).body[0].classes[0];
    expect(cls.submitted).toBe(1);
    expect(cls.total).toBe(2);
    expect(cls.averageDisplayScore).toBe(100);
  });

  it('reports a null average for a class where nobody has sat the quiz yet', async () => {
    await makeQuiz({ classIds: [1], questions: [{ points: 100 }] });
    const teacher = await loginAs(app, 'teacher-samir');
    const cls = (await teacher.get('/api/reports/quizzes')).body[0].classes[0];
    expect(cls.submitted).toBe(0);
    expect(cls.averageDisplayScore).toBeNull();
  });

  it('refuses a student', async () => {
    const agent = await loginAs(app, '10A-001');
    expect((await agent.get('/api/reports/quizzes')).status).toBe(403);
  });
});

describe('GET /api/reports/quizzes/:id/classes/:classId', () => {
  it('drills into every student grade in that class, including those who did not sit it', async () => {
    const quiz = await makeQuiz({ classIds: [1], questions: [{ points: 100 }] });
    await sit(quiz, '10A-001', 1);

    const teacher = await loginAs(app, 'teacher-samir');
    const res = await teacher.get(`/api/reports/quizzes/${quiz.id}/classes/1`);
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(
      res.body.students.map((s: { fullName: string }) => [s.fullName, s]));
    expect(byName['ليلى حداد']).toMatchObject({ displayScore: 100, state: 'submitted' });
    expect(byName['عمر الخطيب']).toMatchObject({ state: 'not_started', displayScore: null });
  });

  it('returns rawScore to the principal and omits it entirely for a teacher', async () => {
    const quiz = await makeQuiz({ classIds: [1], negativeMarking: true, questions: [{ points: 100 }] });
    await sit(quiz, '10A-001', 0);   // wrong → raw -33, display 0

    const principal = await loginAs(app, 'principal');
    const asPrincipal = await principal.get(`/api/reports/quizzes/${quiz.id}/classes/1`);
    const sat = asPrincipal.body.students.find((s: { state: string }) => s.state === 'submitted');
    expect(sat.rawScore).toBe(-33);
    expect(sat.displayScore).toBe(0);

    const teacher = await loginAs(app, 'teacher-samir');
    const asTeacher = await teacher.get(`/api/reports/quizzes/${quiz.id}/classes/1`);
    expect(JSON.stringify(asTeacher.body)).not.toMatch(/rawScore/);
  });

  it("is 404 for another teacher's quiz", async () => {
    const quiz = await makeQuiz({ classIds: [1], authorLogin: 'teacher-rana' });
    const samir = await loginAs(app, 'teacher-samir');
    expect((await samir.get(`/api/reports/quizzes/${quiz.id}/classes/1`)).status).toBe(404);
  });

  it('is 404 for a class the teacher does not teach, even on their own quiz', async () => {
    const quiz = await makeQuiz({ classIds: [3], authorLogin: 'teacher-samir' });
    const samir = await loginAs(app, 'teacher-samir');
    expect((await samir.get(`/api/reports/quizzes/${quiz.id}/classes/3`)).status).toBe(404);
  });

  it('refuses a student', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, '10A-001');
    expect((await agent.get(`/api/reports/quizzes/${quiz.id}/classes/1`)).status).toBe(403);
  });
});
