import type { RequestHandler } from 'express';
import { lookupSession, SESSION_COOKIE, type Role, type SessionUser } from '../auth/session.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: SessionUser }
  }
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  const user = typeof token === 'string' ? await lookupSession(token) : null;
  if (!user) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  req.user = user;
  next();
};

export const requireRole = (...roles: Role[]): RequestHandler => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  next();
};
