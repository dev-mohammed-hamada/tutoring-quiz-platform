export type AttemptState = 'not_started' | 'in_progress' | 'expired' | 'submitted';

export interface AttemptTiming {
  expiresAt: Date;
  submittedAt: Date | null;
}

export function attemptState(a: AttemptTiming | null, now: Date): AttemptState {
  if (!a) return 'not_started';
  if (a.submittedAt) return 'submitted';
  return now < a.expiresAt ? 'in_progress' : 'expired';
}

export type StartRefusal =
  | 'not_published'
  | 'not_open_yet'
  | 'closed'
  | 'wrong_class'
  | 'already_attempted';

export interface StartInput {
  quiz: { isPublished: boolean; opensAt: Date; closesAt: Date; classIds: number[] };
  studentClassId: number;
  hasAttempt: boolean;
}

/**
 * Guard order is deliberate and load-bearing: the first failing check is the
 * reason reported, and the two that reveal nothing about a quiz the student
 * may not see - not_published and wrong_class - are mapped to 404 by the route.
 */
export function canStart(
  input: StartInput,
  now: Date,
): { ok: true } | { ok: false; reason: StartRefusal } {
  const { quiz, studentClassId, hasAttempt } = input;
  if (!quiz.isPublished) return { ok: false, reason: 'not_published' };
  if (now < quiz.opensAt) return { ok: false, reason: 'not_open_yet' };
  if (now > quiz.closesAt) return { ok: false, reason: 'closed' };
  if (!quiz.classIds.includes(studentClassId)) return { ok: false, reason: 'wrong_class' };
  if (hasAttempt) return { ok: false, reason: 'already_attempted' };
  return { ok: true };
}

/**
 * Latency grace: a save already in flight when the deadline passes should not be
 * lost to the round trip. The deadline itself is not extended - no new answer can
 * be started after it, and the server clock remains the only authority.
 */
export const ANSWER_GRACE_MS = 5_000;

export function canSaveAnswer(a: AttemptTiming, now: Date): boolean {
  if (a.submittedAt) return false;
  return now.getTime() <= a.expiresAt.getTime() + ANSWER_GRACE_MS;
}
