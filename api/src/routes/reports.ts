import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { scopeFor } from '../db/quizzes.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { formatMarks } from '../domain/marks.js';

export const reportRoutes = Router();

const staff = [requireAuth, requireRole('teacher', 'principal')] as const;

const drillParams = z.object({
  id: z.coerce.number().int().positive(),
  classId: z.coerce.number().int().positive(),
});

/**
 * Class averages for every quiz in the caller's scope. The average is over
 * submitted attempts only; students who have not sat it are counted in `total`
 * so a low average and a low turnout are never confused for each other.
 */
reportRoutes.get('/reports/quizzes', ...staff, async (req, res) => {
  const user = req.user!;

  const { rows } = await pool.query(
    `SELECT q.id, q.title, q.language, q.negative_marking, q.opens_at, q.closes_at,
            (SELECT COALESCE(SUM(points),0) FROM questions qq WHERE qq.quiz_id = q.id)::int AS max_score,
            c.id AS class_id, c.name AS class_name,
            ROUND(AVG(a.display_score) FILTER (WHERE a.submitted_at IS NOT NULL))::int AS average_display_score,
            count(a.id) FILTER (WHERE a.submitted_at IS NOT NULL)::int AS submitted,
            (SELECT count(*) FROM users u WHERE u.class_id = c.id AND u.role='student')::int AS total
       FROM quizzes q
       JOIN quiz_classes qc ON qc.quiz_id = q.id
       JOIN classes c ON c.id = qc.class_id
       LEFT JOIN attempts a ON a.quiz_id = q.id
            AND a.student_id IN (SELECT id FROM users WHERE class_id = c.id)
      WHERE ${scopeFor(user.role)}
      GROUP BY q.id, q.title, q.language, q.negative_marking, q.opens_at, q.closes_at, c.id, c.name
      ORDER BY q.opens_at DESC, c.name`, [user.id]);

  // One row per quiz-class pair; fold into one entry per quiz.
  const byQuiz = new Map<number, {
    quizId: number; title: string; language: string; negativeMarking: boolean;
    opensAt: string; closesAt: string; maxScore: number;
    classes: unknown[];
  }>();

  for (const r of rows) {
    let entry = byQuiz.get(r.id);
    if (!entry) {
      entry = {
        quizId: r.id, title: r.title, language: r.language,
        negativeMarking: r.negative_marking,
        opensAt: r.opens_at.toISOString(), closesAt: r.closes_at.toISOString(),
        maxScore: r.max_score, classes: [],
      };
      byQuiz.set(r.id, entry);
    }
    entry.classes.push({
      classId: r.class_id,
      name: r.class_name,
      averageDisplayScore: r.average_display_score,
      averageLabel: r.average_display_score === null ? null : formatMarks(r.average_display_score),
      maxScore: r.max_score,
      submitted: r.submitted,
      total: r.total,
    });
  }

  res.json([...byQuiz.values()]);
});

/** Every student in one class on one quiz. Drilling down from the average. */
reportRoutes.get('/reports/quizzes/:id/classes/:classId', ...staff,
  validate({ params: drillParams }), async (req, res) => {
    const { id, classId } = req.params as unknown as { id: number; classId: number };
    const user = req.user!;

    // Scope is checked against the quiz AND the specific class: a teacher must
    // not read their own quiz's results for a class they do not teach.
    const { rows: [quiz] } = await pool.query(
      `SELECT q.id, q.title, q.negative_marking,
              (SELECT COALESCE(SUM(points),0) FROM questions qq WHERE qq.quiz_id = q.id)::int AS max_score
         FROM quizzes q
        WHERE q.id = $2
          AND EXISTS (SELECT 1 FROM quiz_classes qc WHERE qc.quiz_id = q.id AND qc.class_id = $3)
          AND ($4 = 'principal'
               OR EXISTS (SELECT 1 FROM teacher_classes tc
                           WHERE tc.teacher_id = $1 AND tc.class_id = $3))
          AND (${scopeFor(user.role)})`,
      [user.id, id, classId, user.role]);
    if (!quiz) { res.status(404).json({ error: 'not_found' }); return; }

    const { rows: students } = await pool.query(
      `SELECT u.id, u.full_name, a.id AS attempt_id, a.display_score, a.raw_score,
              a.submitted_at, a.submitted_reason, a.expires_at
         FROM users u
         LEFT JOIN attempts a ON a.student_id = u.id AND a.quiz_id = $1
        WHERE u.class_id = $2 AND u.role = 'student'
        ORDER BY u.full_name`, [id, classId]);

    const now = Date.now();
    res.json({
      quizId: quiz.id,
      title: quiz.title,
      maxScore: quiz.max_score,
      negativeMarking: quiz.negative_marking,
      students: students.map((s) => {
        // Built field by field per role: rawScore is absent from the teacher's
        // object rather than deleted from a shared one.
        const base = {
          id: s.id,
          fullName: s.full_name,
          state: !s.attempt_id ? 'not_started'
            : s.submitted_at ? 'submitted'
            : now < s.expires_at.getTime() ? 'in_progress' : 'expired',
          displayScore: s.display_score ?? null,
          displayScoreLabel: s.display_score === null ? null : formatMarks(s.display_score),
          submittedAt: s.submitted_at?.toISOString() ?? null,
          submittedReason: s.submitted_reason ?? null,
        };
        return user.role === 'principal' ? { ...base, rawScore: s.raw_score ?? null } : base;
      }),
    });
  });
