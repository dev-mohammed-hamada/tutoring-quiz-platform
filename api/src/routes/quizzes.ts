import { Router } from 'express';
import { createQuizBody, createQuestionBody, idParam } from '@quiz/shared';
import { pool } from '../db/pool.js';
import { scopeFor } from '../db/quizzes.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { serializeQuizForTeacher, serializeQuizForStudent } from '../serializers/quiz.js';

export const quizRoutes = Router();

const staff = [requireAuth, requireRole('teacher', 'principal')] as const;

/** Loads a quiz the caller is allowed to author on, or null. Null becomes 404. */
async function loadAuthorable(userId: number, role: string, quizId: number) {
  const { rows } = await pool.query(
    `SELECT q.* FROM quizzes q WHERE q.id = $2 AND (${scopeFor(role)})`, [userId, quizId]);
  return rows[0] ?? null;
}

quizRoutes.post('/quizzes', ...staff, validate({ body: createQuizBody }), async (req, res) => {
  const body = req.body as import('@quiz/shared').CreateQuizBody;
  const user = req.user!;

  if (user.role !== 'principal') {
    const { rows } = await pool.query(
      `SELECT class_id FROM teacher_classes WHERE teacher_id = $1`, [user.id]);
    const mine = new Set(rows.map((r) => r.class_id));
    if (!body.classIds.every((c) => mine.has(c))) {
      res.status(403).json({ error: 'class_not_assigned' });
      return;
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [q] } = await client.query(
      `INSERT INTO quizzes(title, author_id, language, time_limit_minutes,
                           opens_at, closes_at, negative_marking)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [body.title, user.id, body.language, body.timeLimitMinutes,
       body.opensAt, body.closesAt, body.negativeMarking]);
    for (const classId of body.classIds) {
      await client.query(`INSERT INTO quiz_classes(quiz_id, class_id) VALUES ($1,$2)`, [q.id, classId]);
    }
    await client.query('COMMIT');
    res.status(201).json({ id: q.id });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

quizRoutes.post('/quizzes/:id/questions', ...staff,
  validate({ params: idParam, body: createQuestionBody }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };
    const body = req.body as import('@quiz/shared').CreateQuestionBody;
    const user = req.user!;

    const quiz = await loadAuthorable(user.id, user.role, id);
    if (!quiz) { res.status(404).json({ error: 'not_found' }); return; }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [q] } = await client.query(
        `INSERT INTO questions(quiz_id, position, text, points)
         VALUES ($1, (SELECT COALESCE(MAX(position),0)+1 FROM questions WHERE quiz_id=$1), $2, $3)
         RETURNING id`,
        [id, body.text, body.points]);
      for (const [i, opt] of body.options.entries()) {
        await client.query(
          `INSERT INTO options(question_id, position, text, is_correct) VALUES ($1,$2,$3,$4)`,
          [q.id, i + 1, opt.text, opt.isCorrect]);
      }
      await client.query('COMMIT');
      res.status(201).json({ id: q.id });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

quizRoutes.post('/quizzes/:id/publish', ...staff, validate({ params: idParam }), async (req, res) => {
  const { id } = req.params as unknown as { id: number };
  const user = req.user!;

  const quiz = await loadAuthorable(user.id, user.role, id);
  if (!quiz) { res.status(404).json({ error: 'not_found' }); return; }

  const { rows: questions } = await pool.query(
    `SELECT q.id, q.position,
            (SELECT count(*) FROM options o WHERE o.question_id = q.id)::int AS option_count,
            (SELECT count(*) FROM options o WHERE o.question_id = q.id AND o.is_correct)::int AS correct_count
       FROM questions q WHERE q.quiz_id = $1 ORDER BY q.position`, [id]);

  const problems: string[] = [];
  if (questions.length === 0) problems.push('no_questions');
  for (const q of questions) {
    if (q.option_count !== 4) problems.push(`question_${q.position}_needs_four_options`);
    if (q.correct_count !== 1) problems.push(`question_${q.position}_needs_one_correct_option`);
  }
  if (problems.length) { res.status(422).json({ error: 'not_publishable', problems }); return; }

  await pool.query(`UPDATE quizzes SET is_published = true WHERE id = $1`, [id]);
  res.status(204).end();
});

quizRoutes.get('/quizzes', requireAuth, async (req, res) => {
  const user = req.user!;

  if (user.role === 'student') {
    const { rows } = await pool.query(
      `SELECT q.*, 
              (SELECT count(*) FROM questions qq WHERE qq.quiz_id = q.id)::int AS question_count,
              (SELECT COALESCE(SUM(points),0) FROM questions qq WHERE qq.quiz_id = q.id)::int AS total_marks,
              a.id AS attempt_id, a.submitted_at, a.expires_at, a.display_score
         FROM quizzes q
         JOIN quiz_classes qc ON qc.quiz_id = q.id AND qc.class_id = $2
         LEFT JOIN attempts a ON a.quiz_id = q.id AND a.student_id = $1
        WHERE q.is_published
        ORDER BY q.opens_at DESC`,
      [user.id, user.classId]);

    const now = Date.now();
    res.json(rows.map((r) => serializeQuizForStudent({
      ...r,
      state: !r.attempt_id
        ? (now < r.opens_at.getTime() ? 'not_open_yet'
          : now > r.closes_at.getTime() ? 'closed' : 'available')
        : r.submitted_at ? 'submitted'
        : now < r.expires_at.getTime() ? 'in_progress' : 'expired',
    })));
    return;
  }

  const { rows } = await pool.query(
    `SELECT q.*,
            (SELECT array_agg(qc.class_id) FROM quiz_classes qc WHERE qc.quiz_id = q.id) AS class_ids,
            (SELECT count(*) FROM questions qq WHERE qq.quiz_id = q.id)::int AS question_count,
            (SELECT COALESCE(SUM(points),0) FROM questions qq WHERE qq.quiz_id = q.id)::int AS total_marks
       FROM quizzes q
      WHERE ${scopeFor(user.role)}
      ORDER BY q.created_at DESC`, [user.id]);
  res.json(rows.map(serializeQuizForTeacher));
});
