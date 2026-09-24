import { createHash, randomBytes } from 'node:crypto';
import { pool } from '../db/pool.js';

export type Role = 'student' | 'teacher' | 'principal';

export interface SessionUser {
  id: number;
  role: Role;
  locale: 'en' | 'ar';
  classId: number | null;
  fullName: string;
}

export const SESSION_COOKIE = 'qsid';
export const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

// The cookie carries a random token; only its digest is stored, so a database
// leak does not hand anyone a usable session.
const digest = (token: string) => createHash('sha256').update(token).digest('hex');

export async function issueSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO sessions(id, user_id, expires_at) VALUES ($1, $2, now() + ($3 || ' milliseconds')::interval)`,
    [digest(token), userId, SESSION_TTL_MS]);
  return token;
}

export async function lookupSession(token: string): Promise<SessionUser | null> {
  const { rows } = await pool.query(
    `SELECT u.id, u.role, u.locale, u.class_id, u.full_name
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.expires_at > now() AND u.is_active`,
    [digest(token)]);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id, role: r.role, locale: r.locale,
    classId: r.class_id ?? null, fullName: r.full_name,
  };
}

export async function revokeSession(token: string): Promise<void> {
  await pool.query(`DELETE FROM sessions WHERE id = $1`, [digest(token)]);
}
