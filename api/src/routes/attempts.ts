import { Router } from 'express';
import { idParam } from '@quiz/shared';
import { pool } from '../db/pool.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { canStart, attemptState, type StartRefusal } from '../domain/attempt.js';
import { serializeQuestionForAttempt } from '../serializers/attempt.js';

export const attemptRoutes = Router();

const student = [requireAuth, requireRole('student')] as const;

/**
 * Refusals that would reveal the existence of a quiz the student may not see
 * are reported as 404. The rest are genuine conflicts the student can act on.
 */
const REFUSAL_STATUS: Record<StartRefusal, number> = {
  not_published: 404,
  wrong_class: 404,
  not_open_yet: 409,
  closed: 409,
  already_attempted: 409,
};

attemptRoutes.post('/quizzes/:id/attempt', ...student, validate({ params: idParam }), async (req, res) => {
  const { id } = req.params as unknown as { id: number };
  const user = req.user!;

  const { rows } = await pool.query(
    `SELECT q.id, q.is_published, q.opens_at, q.closes_at, q.time_limit_minutes,
            (SELECT array_agg(qc.class_id) FROM quiz_classes qc WHERE qc.quiz_id = q.id) AS class_ids,
            (SELECT COALESCE(SUM(points),0) FROM questions qq WHERE qq.quiz_id = q.id)::int AS max_score,
            EXISTS (SELECT 1 FROM attempts a WHERE a.quiz_id = q.id AND a.student_id = $2) AS has_attempt
       FROM quizzes q WHERE q.id = $1`, [id, user.id]);
  const quiz = rows[0];
  if (!quiz) { res.status(404).json({ error: 'not_found' }); return; }

  const verdict = canStart({
    quiz: {
      isPublished: quiz.is_published,
      opensAt: quiz.opens_at,
      closesAt: quiz.closes_at,
      classIds: quiz.class_ids ?? [],
    },
    studentClassId: user.classId!,
    hasAttempt: quiz.has_attempt,
  }, new Date());

  if (!verdict.ok) {
    const status = REFUSAL_STATUS[verdict.reason];
    res.status(status).json({ error: status === 404 ? 'not_found' : verdict.reason });
    return;
  }

  try {
    // The deadline is computed by the database, so the only clock that matters
    // is the server's, and it is written exactly once.
    const { rows: [attempt] } = await pool.query(
      `INSERT INTO attempts(quiz_id, student_id, started_at, expires_at, max_score)
       VALUES ($1, $2, now(), now() + ($3 || ' minutes')::interval, $4)
       RETURNING id`, [id, user.id, quiz.time_limit_minutes, quiz.max_score]);
    res.status(201).json({ attemptId: attempt.id });
  } catch (err) {
    // Two requests can both read "no attempt" before either writes. The unique
    // constraint is what actually enforces the rule; canStart only reports it.
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'already_attempted' });
      return;
    }
    throw err;
  }
});

attemptRoutes.get('/attempts/:id', ...student, validate({ params: idParam }), async (req, res) => {
  const { id } = req.params as unknown as { id: number };
  const user = req.user!;

  const { rows: [attempt] } = await pool.query(
    `SELECT a.id, a.quiz_id, a.started_at, a.expires_at, a.submitted_at, a.max_score,
            q.title, q.language, q.negative_marking, q.time_limit_minutes
       FROM attempts a JOIN quizzes q ON q.id = a.quiz_id
      WHERE a.id = $1 AND a.student_id = $2`, [id, user.id]);
  if (!attempt) { res.status(404).json({ error: 'not_found' }); return; }

  const { rows: questionRows } = await pool.query(
    `SELECT qq.id, qq.position, qq.text, qq.points,
            json_agg(json_build_object('id', o.id, 'position', o.position, 'text', o.text)
                     ORDER BY o.position) AS options
       FROM questions qq JOIN options o ON o.question_id = qq.id
      WHERE qq.quiz_id = $1
      GROUP BY qq.id ORDER BY qq.position`, [attempt.quiz_id]);

  const { rows: answerRows } = await pool.query(
    `SELECT question_id, selected_option_id FROM answers WHERE attempt_id = $1 ORDER BY question_id`, [id]);

  res.json({
    attempt: {
      id: attempt.id,
      expiresAt: attempt.expires_at.toISOString(),
      submittedAt: attempt.submitted_at?.toISOString() ?? null,
      state: attemptState({ expiresAt: attempt.expires_at, submittedAt: attempt.submitted_at }, new Date()),
      maxScore: attempt.max_score,
    },
    quiz: {
      id: attempt.quiz_id,
      title: attempt.title,
      language: attempt.language,
      negativeMarking: attempt.negative_marking,
      timeLimitMinutes: attempt.time_limit_minutes,
    },
    serverNow: new Date().toISOString(),
    questions: questionRows.map(serializeQuestionForAttempt),
    answers: answerRows.map((a) => ({
      questionId: a.question_id,
      selectedOptionId: a.selected_option_id,
    })),
  });
});
