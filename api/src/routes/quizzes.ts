import { Router } from 'express';
import { createQuizBody, createQuestionBody, updateQuizBody, idParam, questionParams } from '@quiz/shared';
import { pool } from '../db/pool.js';
import { scopeFor } from '../db/quizzes.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { serializeQuizForTeacher, serializeQuizForStudent } from '../serializers/quiz.js';
import { serializeQuizForAuthor } from '../serializers/quiz-detail.js';

export const quizRoutes = Router();

const staff = [requireAuth, requireRole('teacher', 'principal')] as const;

/** True when every class in the list is one this caller may target. */
async function ownsClasses(user: { id: number; role: string }, classIds: number[]) {
  if (user.role === 'principal') return true;
  const { rows } = await pool.query(
    `SELECT class_id FROM teacher_classes WHERE teacher_id = $1`, [user.id]);
  const mine = new Set(rows.map((r) => r.class_id));
  return classIds.every((c) => mine.has(c));
}

/** Loads a quiz the caller is allowed to author on, or null. Null becomes 404. */
async function loadAuthorable(userId: number, role: string, quizId: number) {
  const { rows } = await pool.query(
    `SELECT q.* FROM quizzes q WHERE q.id = $2 AND (${scopeFor(role)})`, [userId, quizId]);
  return rows[0] ?? null;
}

quizRoutes.post('/quizzes', ...staff, validate({ body: createQuizBody }), async (req, res) => {
  const body = req.body as import('@quiz/shared').CreateQuizBody;
  const user = req.user!;

  if (!await ownsClasses(user, body.classIds)) {
    res.status(403).json({ error: 'class_not_assigned' });
    return;
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

/** The classes this caller may author for: a teacher's assignments, or all of them. */
quizRoutes.get('/me/classes', ...staff, async (req, res) => {
  const user = req.user!;
  const { rows } = user.role === 'principal'
    ? await pool.query(`SELECT id, name FROM classes ORDER BY name`)
    : await pool.query(
        `SELECT c.id, c.name FROM classes c
           JOIN teacher_classes tc ON tc.class_id = c.id AND tc.teacher_id = $1
          ORDER BY c.name`, [user.id]);
  res.json(rows.map((r) => ({ id: r.id, name: r.name })));
});

/** One quiz with its questions and the answer key. Staff only, and scoped. */
quizRoutes.get('/quizzes/:id', ...staff, validate({ params: idParam }), async (req, res) => {
  const { id } = req.params as unknown as { id: number };
  const user = req.user!;

  const { rows: [quiz] } = await pool.query(
    `SELECT q.*, (SELECT array_agg(qc.class_id ORDER BY qc.class_id)
                    FROM quiz_classes qc WHERE qc.quiz_id = q.id) AS class_ids
       FROM quizzes q WHERE q.id = $2 AND (${scopeFor(user.role)})`, [user.id, id]);
  if (!quiz) { res.status(404).json({ error: 'not_found' }); return; }

  const { rows: questions } = await pool.query(
    `SELECT qq.id, qq.position, qq.text, qq.points,
            COALESCE(json_agg(json_build_object('id', o.id, 'position', o.position,
                                                'text', o.text, 'is_correct', o.is_correct)
                              ORDER BY o.position) FILTER (WHERE o.id IS NOT NULL), '[]') AS options
       FROM questions qq LEFT JOIN options o ON o.question_id = qq.id
      WHERE qq.quiz_id = $1
      GROUP BY qq.id ORDER BY qq.position`, [id]);

  res.json(serializeQuizForAuthor(quiz, questions));
});

quizRoutes.patch('/quizzes/:id', ...staff,
  validate({ params: idParam, body: updateQuizBody }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };
    const body = req.body as import('@quiz/shared').UpdateQuizBody;
    const user = req.user!;

    const quiz = await loadAuthorable(user.id, user.role, id);
    if (!quiz) { res.status(404).json({ error: 'not_found' }); return; }

    if (body.classIds && !await ownsClasses(user, body.classIds)) {
      res.status(403).json({ error: 'class_not_assigned' });
      return;
    }

    // The window invariant is checked against the merged quiz, not the patch:
    // moving only opensAt can still put it past the stored closesAt.
    const opensAt = body.opensAt ? new Date(body.opensAt) : quiz.opens_at;
    const closesAt = body.closesAt ? new Date(body.closesAt) : quiz.closes_at;
    if (closesAt <= opensAt) {
      res.status(400).json({ error: 'invalid_request', details: 'closesAt must be after opensAt' });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE quizzes SET title = COALESCE($2, title),
                            language = COALESCE($3, language),
                            time_limit_minutes = COALESCE($4, time_limit_minutes),
                            opens_at = $5, closes_at = $6,
                            negative_marking = COALESCE($7, negative_marking)
          WHERE id = $1`,
        [id, body.title ?? null, body.language ?? null, body.timeLimitMinutes ?? null,
         opensAt, closesAt, body.negativeMarking ?? null]);

      if (body.classIds) {
        await client.query(`DELETE FROM quiz_classes WHERE quiz_id = $1`, [id]);
        for (const classId of body.classIds) {
          await client.query(`INSERT INTO quiz_classes(quiz_id, class_id) VALUES ($1,$2)`, [id, classId]);
        }
      }
      await client.query('COMMIT');
      res.status(204).end();
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

quizRoutes.put('/quizzes/:id/questions/:questionId', ...staff,
  validate({ params: questionParams, body: createQuestionBody }), async (req, res) => {
    const { id, questionId } = req.params as unknown as { id: number; questionId: number };
    const body = req.body as import('@quiz/shared').CreateQuestionBody;
    const user = req.user!;

    const quiz = await loadAuthorable(user.id, user.role, id);
    if (!quiz) { res.status(404).json({ error: 'not_found' }); return; }

    const { rows: [question] } = await pool.query(
      `SELECT id FROM questions WHERE id = $1 AND quiz_id = $2`, [questionId, id]);
    if (!question) { res.status(404).json({ error: 'not_found' }); return; }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE questions SET text = $2, points = $3 WHERE id = $1`,
        [questionId, body.text, body.points]);

      // Options are updated in place by position rather than replaced. A student
      // who already answered has answers.selected_option_id pointing at one of
      // these rows, and that reference has no ON DELETE - deleting would fail.
      // Clearing the key first keeps the one-correct-option index satisfied at
      // every statement boundary.
      await client.query(`UPDATE options SET is_correct = false WHERE question_id = $1`, [questionId]);
      for (const [i, opt] of body.options.entries()) {
        await client.query(
          `INSERT INTO options(question_id, position, text, is_correct) VALUES ($1,$2,$3,$4)
           ON CONFLICT (question_id, position)
           DO UPDATE SET text = EXCLUDED.text, is_correct = EXCLUDED.is_correct`,
          [questionId, i + 1, opt.text, opt.isCorrect]);
      }
      await client.query('COMMIT');
      // Recorded answers are untouched on purpose: answers.points_possible and
      // points_awarded were snapshotted when the answer was given (D-08, spec §11).
      res.status(204).end();
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
