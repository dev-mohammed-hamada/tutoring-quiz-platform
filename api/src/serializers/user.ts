import type { SessionUser } from '../auth/session.js';

/** Built by explicit construction, never by deleting fields off a wider object. */
export const serializeMe = (u: SessionUser) => ({
  id: u.id,
  role: u.role,
  locale: u.locale,
  classId: u.classId,
  fullName: u.fullName,
});
