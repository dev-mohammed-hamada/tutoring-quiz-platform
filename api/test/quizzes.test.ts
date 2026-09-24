import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { resetDb } from './helpers/db.js';
import { makeWorld, loginAs } from './helpers/world.js';

const app = createApp();
beforeAll(async () => { await migrate(); });
beforeEach(async () => { await resetDb(); await makeWorld(); });
afterAll(async () => { await pool.end(); });

const validQuizBody = () => ({
  title: 'Q', language: 'en' as const, timeLimitMinutes: 20,
  opensAt: new Date(Date.now() - 3600e3).toISOString(),
  closesAt: new Date(Date.now() + 3600e3).toISOString(),
  negativeMarking: false, classIds: [1],
});

const validQuestionBody = () => ({
  text: 'Q1', points: 100,
  options: [
    { text: 'a', isCorrect: true }, { text: 'b', isCorrect: false },
    { text: 'c', isCorrect: false }, { text: 'd', isCorrect: false }],
});

describe('POST /api/quizzes', () => {
  it('lets a teacher create a quiz targeted at a class they teach', async () => {
    const agent = await loginAs(app, 'teacher-samir');
    const res = await agent.post('/api/quizzes').send(validQuizBody());
    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe('number');
  });

  it('refuses to target a class the teacher does not teach', async () => {
    const agent = await loginAs(app, 'teacher-samir');
    const res = await agent.post('/api/quizzes').send({ ...validQuizBody(), classIds: [3] });
    expect(res.status).toBe(403);
  });

  it('refuses a window that closes before it opens', async () => {
    const agent = await loginAs(app, 'teacher-samir');
    const res = await agent.post('/api/quizzes').send({
      ...validQuizBody(),
      opensAt: new Date(Date.now() + 3600e3).toISOString(),
      closesAt: new Date().toISOString(),
    });
    expect(res.status).toBe(400);
  });

  it('refuses a student outright, before validating the body', async () => {
    const agent = await loginAs(app, '10A-001');
    expect((await agent.post('/api/quizzes').send({})).status).toBe(403);
  });

  it('is 401 for an anonymous request', async () => {
    const res = await request(app).post('/api/quizzes').send(validQuizBody());
    expect(res.status).toBe(401);
  });

  it('lets the principal create a quiz for any class', async () => {
    const agent = await loginAs(app, 'principal');
    const res = await agent.post('/api/quizzes').send({ ...validQuizBody(), classIds: [1, 2, 3] });
    expect(res.status).toBe(201);
  });

  it('stores an Arabic title intact', async () => {
    const agent = await loginAs(app, 'teacher-samir');
    const res = await agent.post('/api/quizzes').send({ ...validQuizBody(), title: 'النحو العربي', language: 'ar' });
    const { rows } = await pool.query(`SELECT title FROM quizzes WHERE id=$1`, [res.body.id]);
    expect(rows[0].title).toBe('النحو العربي');
  });
});

describe('POST /api/quizzes/:id/questions', () => {
  it('adds a question with four options and assigns positions in order', async () => {
    const agent = await loginAs(app, 'teacher-samir');
    const { body: quiz } = await agent.post('/api/quizzes').send(validQuizBody());
    await agent.post(`/api/quizzes/${quiz.id}/questions`).send(validQuestionBody());
    await agent.post(`/api/quizzes/${quiz.id}/questions`).send({ ...validQuestionBody(), text: 'Q2' });
    const { rows } = await pool.query(
      `SELECT position, text FROM questions WHERE quiz_id=$1 ORDER BY position`, [quiz.id]);
    expect(rows.map(r => [r.position, r.text])).toEqual([[1, 'Q1'], [2, 'Q2']]);
  });

  it('refuses a question with more than one correct option', async () => {
    const agent = await loginAs(app, 'teacher-samir');
    const { body: quiz } = await agent.post('/api/quizzes').send(validQuizBody());
    const res = await agent.post(`/api/quizzes/${quiz.id}/questions`).send({
      text: 'Q', points: 100,
      options: [
        { text: 'a', isCorrect: true }, { text: 'b', isCorrect: true },
        { text: 'c', isCorrect: false }, { text: 'd', isCorrect: false }],
    });
    expect(res.status).toBe(400);
  });

  it('refuses a question with no correct option', async () => {
    const agent = await loginAs(app, 'teacher-samir');
    const { body: quiz } = await agent.post('/api/quizzes').send(validQuizBody());
    const res = await agent.post(`/api/quizzes/${quiz.id}/questions`).send({
      text: 'Q', points: 100,
      options: [{ text: 'a', isCorrect: false }, { text: 'b', isCorrect: false },
                { text: 'c', isCorrect: false }, { text: 'd', isCorrect: false }],
    });
    expect(res.status).toBe(400);
  });

  it('refuses fewer than four options', async () => {
    const agent = await loginAs(app, 'teacher-samir');
    const { body: quiz } = await agent.post('/api/quizzes').send(validQuizBody());
    const res = await agent.post(`/api/quizzes/${quiz.id}/questions`).send({
      text: 'Q', points: 100,
      options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }],
    });
    expect(res.status).toBe(400);
  });

  it("refuses to add a question to another teacher's quiz, with 404", async () => {
    const samir = await loginAs(app, 'teacher-samir');
    const { body: quiz } = await samir.post('/api/quizzes').send(validQuizBody());
    const rana = await loginAs(app, 'teacher-rana');
    const res = await rana.post(`/api/quizzes/${quiz.id}/questions`).send(validQuestionBody());
    expect(res.status).toBe(404);
  });

  it('rolls back the whole question if an option insert fails', async () => {
    const agent = await loginAs(app, 'teacher-samir');
    const { body: quiz } = await agent.post('/api/quizzes').send(validQuizBody());
    await agent.post(`/api/quizzes/${quiz.id}/questions`).send({
      text: 'Q', points: 100,
      options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: true },
                { text: 'c', isCorrect: false }, { text: 'd', isCorrect: false }],
    });
    const { rows } = await pool.query(`SELECT count(*)::int c FROM questions WHERE quiz_id=$1`, [quiz.id]);
    expect(rows[0].c).toBe(0);
  });
});

describe('POST /api/quizzes/:id/publish', () => {
  it('refuses a quiz with no questions', async () => {
    const agent = await loginAs(app, 'teacher-samir');
    const { body: quiz } = await agent.post('/api/quizzes').send(validQuizBody());
    const res = await agent.post(`/api/quizzes/${quiz.id}/publish`);
    expect(res.status).toBe(422);
    expect(res.body.problems).toContain('no_questions');
  });

  it('publishes a complete quiz', async () => {
    const agent = await loginAs(app, 'teacher-samir');
    const { body: quiz } = await agent.post('/api/quizzes').send(validQuizBody());
    await agent.post(`/api/quizzes/${quiz.id}/questions`).send(validQuestionBody());
    expect((await agent.post(`/api/quizzes/${quiz.id}/publish`)).status).toBe(204);
    const { rows } = await pool.query(`SELECT is_published FROM quizzes WHERE id=$1`, [quiz.id]);
    expect(rows[0].is_published).toBe(true);
  });

  it("refuses to publish another teacher's quiz, with 404", async () => {
    const samir = await loginAs(app, 'teacher-samir');
    const { body: quiz } = await samir.post('/api/quizzes').send(validQuizBody());
    await samir.post(`/api/quizzes/${quiz.id}/questions`).send(validQuestionBody());
    const rana = await loginAs(app, 'teacher-rana');
    expect((await rana.post(`/api/quizzes/${quiz.id}/publish`)).status).toBe(404);
  });
});

describe('GET /api/quizzes', () => {
  it('shows a teacher only their own quizzes', async () => {
    const samir = await loginAs(app, 'teacher-samir');
    await samir.post('/api/quizzes').send(validQuizBody());
    const rana = await loginAs(app, 'teacher-rana');
    await rana.post('/api/quizzes').send({ ...validQuizBody(), title: 'Rana quiz' });
    const mine = await samir.get('/api/quizzes');
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].title).toBe('Q');
  });

  it('shows the principal every quiz', async () => {
    const samir = await loginAs(app, 'teacher-samir');
    await samir.post('/api/quizzes').send(validQuizBody());
    const rana = await loginAs(app, 'teacher-rana');
    await rana.post('/api/quizzes').send({ ...validQuizBody(), title: 'Rana quiz' });
    const principal = await loginAs(app, 'principal');
    expect((await principal.get('/api/quizzes')).body).toHaveLength(2);
  });

  it('shows a student only published quizzes for their class, without the answer key', async () => {
    const samir = await loginAs(app, 'teacher-samir');
    const { body: published } = await samir.post('/api/quizzes').send(validQuizBody());
    await samir.post(`/api/quizzes/${published.id}/questions`).send(validQuestionBody());
    await samir.post(`/api/quizzes/${published.id}/publish`);
    await samir.post('/api/quizzes').send({ ...validQuizBody(), title: 'Draft' });   // unpublished

    const student = await loginAs(app, '10A-001');
    const res = await student.get('/api/quizzes');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Q');
    expect(JSON.stringify(res.body)).not.toMatch(/isCorrect|is_correct/);
  });

  it('does not show a student a published quiz aimed at another class', async () => {
    const samir = await loginAs(app, 'teacher-samir');
    const { body: quiz } = await samir.post('/api/quizzes').send({ ...validQuizBody(), classIds: [2] });
    await samir.post(`/api/quizzes/${quiz.id}/questions`).send(validQuestionBody());
    await samir.post(`/api/quizzes/${quiz.id}/publish`);
    const student = await loginAs(app, '10A-001');
    expect((await student.get('/api/quizzes')).body).toEqual([]);
  });
});
