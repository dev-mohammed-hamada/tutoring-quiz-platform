import { Router } from 'express';
import { loginBody } from '@quiz/shared';
import { pool } from '../db/pool.js';
import { verifyPassword, burnVerifyTime } from '../auth/password.js';
import { issueSession, revokeSession, SESSION_COOKIE, SESSION_TTL_MS } from '../auth/session.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { serializeMe } from '../serializers/user.js';

export const authRoutes = Router();

authRoutes.post('/auth/login', validate({ body: loginBody }), async (req, res) => {
  const { loginCode, password } = req.body as { loginCode: string; password: string };

  const { rows } = await pool.query(
    `SELECT id, role, locale, class_id, full_name, password_hash
       FROM users WHERE login_code = $1 AND is_active`,
    [loginCode]);
  const row = rows[0];

  // Burn equivalent time when the user is missing, so response latency does not
  // distinguish "no such login code" from "wrong password".
  const ok = row ? await verifyPassword(password, row.password_hash) : await burnVerifyTime(password);
  if (!row || !ok) {
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }

  const token = await issueSession(row.id);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
  res.json({
    user: serializeMe({
      id: row.id, role: row.role, locale: row.locale,
      classId: row.class_id ?? null, fullName: row.full_name,
    }),
  });
});

authRoutes.post('/auth/logout', async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === 'string') await revokeSession(token);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.status(204).end();
});

authRoutes.get('/me', requireAuth, (req, res) => {
  res.json(serializeMe(req.user!));
});
