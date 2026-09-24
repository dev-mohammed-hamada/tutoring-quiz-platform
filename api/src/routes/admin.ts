import { Router } from 'express';
import {
  idParam, createClassBody, createUserBody, resetPasswordBody, assignmentsBody, importBody,
  type CreateUserBody, type AssignmentsBody, type ImportBody,
} from '@quiz/shared';
import { pool } from '../db/pool.js';
import { hashPassword } from '../auth/password.js';
import { parseCsv } from '../seed/csv.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const adminRoutes = Router();
const principal = [requireAuth, requireRole('principal')] as const;

const isUniqueViolation = (err: unknown) => (err as { code?: string }).code === '23505';

adminRoutes.get('/admin/classes', ...principal, async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT c.id, c.name,
            (SELECT count(*) FROM users u WHERE u.class_id = c.id AND u.role='student')::int AS student_count
       FROM classes c ORDER BY c.name`);
  res.json(rows.map((r) => ({ id: r.id, name: r.name, studentCount: r.student_count })));
});

adminRoutes.post('/admin/classes', ...principal, validate({ body: createClassBody }), async (req, res) => {
  try {
    const { rows: [c] } = await pool.query(
      `INSERT INTO classes(name) VALUES ($1) RETURNING id`, [req.body.name]);
    res.status(201).json({ id: c.id });
  } catch (err) {
    if (isUniqueViolation(err)) { res.status(409).json({ error: 'class_exists' }); return; }
    throw err;
  }
});

adminRoutes.get('/admin/users', ...principal, async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.role, u.full_name, u.login_code, u.locale, u.is_active, u.class_id,
            c.name AS class_name,
            (SELECT array_agg(tc.class_id ORDER BY tc.class_id)
               FROM teacher_classes tc WHERE tc.teacher_id = u.id) AS assigned_class_ids
       FROM users u LEFT JOIN classes c ON c.id = u.class_id
      ORDER BY u.role, u.login_code`);
  // Explicit fields only: password_hash is never selected, let alone returned.
  res.json(rows.map((r) => ({
    id: r.id, role: r.role, fullName: r.full_name, loginCode: r.login_code,
    locale: r.locale, isActive: r.is_active, classId: r.class_id, className: r.class_name,
    assignedClassIds: r.assigned_class_ids ?? [],
  })));
});

adminRoutes.post('/admin/users', ...principal, validate({ body: createUserBody }), async (req, res) => {
  const u = req.body as CreateUserBody;
  try {
    const { rows: [created] } = await pool.query(
      `INSERT INTO users(role, full_name, login_code, password_hash, locale, class_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [u.role, u.fullName, u.loginCode, await hashPassword(u.password), u.locale, u.classId ?? null]);
    res.status(201).json({ id: created.id });
  } catch (err) {
    if (isUniqueViolation(err)) { res.status(409).json({ error: 'login_code_taken' }); return; }
    throw err;
  }
});

adminRoutes.put('/admin/users/:id/password', ...principal,
  validate({ params: idParam, body: resetPasswordBody }), async (req, res) => {
    const { id } = req.params as unknown as { id: number };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rowCount } = await client.query(
        `UPDATE users SET password_hash = $2 WHERE id = $1`, [id, await hashPassword(req.body.password)]);
      if (!rowCount) { await client.query('ROLLBACK'); res.status(404).json({ error: 'not_found' }); return; }
      // A reset is usually because a password leaked: end every existing session too.
      await client.query(`DELETE FROM sessions WHERE user_id = $1`, [id]);
      await client.query('COMMIT');
      res.status(204).end();
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

/** Replaces, rather than appends to, a teacher's class assignments. */
adminRoutes.post('/admin/assignments', ...principal, validate({ body: assignmentsBody }), async (req, res) => {
  const { teacherId, classIds } = req.body as AssignmentsBody;
  const { rowCount } = await pool.query(
    `SELECT 1 FROM users WHERE id = $1 AND role = 'teacher'`, [teacherId]);
  if (!rowCount) { res.status(404).json({ error: 'teacher_not_found' }); return; }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM teacher_classes WHERE teacher_id = $1`, [teacherId]);
    for (const classId of classIds) {
      await client.query(
        `INSERT INTO teacher_classes(teacher_id, class_id) VALUES ($1,$2)`, [teacherId, classId]);
    }
    await client.query('COMMIT');
    res.json({ teacherId, classIds });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

const REQUIRED_COLUMNS: Record<ImportBody['kind'], string[]> = {
  students: ['login_code', 'full_name', 'class_name', 'password', 'locale'],
  teachers: ['login_code', 'full_name', 'role', 'password', 'locale'],
};

/**
 * Imports the roster in the same CSV shape the seeder reads, row by row, so one
 * bad row is reported with its line number and never blocks the good ones.
 *
 * Re-importing updates names, classes and locales but deliberately leaves an
 * existing password alone. The roster will be re-sent as it changes; if every
 * import reset every password, each update would lock the whole centre out.
 */
adminRoutes.post('/admin/import', ...principal, validate({ body: importBody }), async (req, res) => {
  const { kind, csv } = req.body as ImportBody;
  const rows = parseCsv(csv);

  const firstLine = csv.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';
  const present = new Set(firstLine.split(',').map((h) => h.trim()));
  const missing = REQUIRED_COLUMNS[kind].filter((c) => !present.has(c));
  if (missing.length) { res.status(400).json({ error: 'missing_columns', missing }); return; }

  const { rows: classRows } = await pool.query(`SELECT id, name FROM classes`);
  const classByName = new Map(classRows.map((c) => [c.name as string, c.id as number]));

  let created = 0;
  let updated = 0;
  const errors: { line: number; message: string }[] = [];

  for (const [i, row] of rows.entries()) {
    const line = i + 2;   // the header is line 1
    try {
      if (!row.login_code || !row.full_name) throw new Error('login_code and full_name are required');
      const locale = row.locale === 'en' ? 'en' : 'ar';

      let result;
      if (kind === 'students') {
        const classId = classByName.get(row.class_name ?? '');
        if (!classId) throw new Error(`unknown class "${row.class_name}"`);
        // xmax = 0 distinguishes a fresh insert from an update on conflict.
        result = await pool.query(
          `INSERT INTO users(role, full_name, login_code, password_hash, locale, class_id)
           VALUES ('student',$1,$2,$3,$4,$5)
           ON CONFLICT (login_code) DO UPDATE
             SET full_name = EXCLUDED.full_name, class_id = EXCLUDED.class_id, locale = EXCLUDED.locale
             WHERE users.role = 'student'
           RETURNING (xmax = 0) AS inserted`,
          [row.full_name, row.login_code, await hashPassword(row.password || 'pass1234'), locale, classId]);
      } else {
        const role = row.role === 'principal' ? 'principal' : 'teacher';
        result = await pool.query(
          `INSERT INTO users(role, full_name, login_code, password_hash, locale)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (login_code) DO UPDATE
             SET full_name = EXCLUDED.full_name, locale = EXCLUDED.locale
             WHERE users.role <> 'student'
           RETURNING (xmax = 0) AS inserted`,
          [role, row.full_name, row.login_code, await hashPassword(row.password || 'pass1234'), locale]);
      }

      // No row back means the conflict's WHERE refused: the code belongs to the other kind of account.
      if (!result.rows[0]) throw new Error(`login code "${row.login_code}" belongs to a different kind of account`);
      if (result.rows[0].inserted) created++; else updated++;
    } catch (err) {
      errors.push({ line, message: (err as Error).message });
    }
  }

  res.json({ created, updated, errors });
});
