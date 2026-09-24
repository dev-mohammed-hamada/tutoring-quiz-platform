import { describe, it, expect } from 'vitest';
import { attemptState, canStart, canSaveAnswer, ANSWER_GRACE_MS } from '../../src/domain/attempt.js';

const t = (iso: string) => new Date(iso);
const NOW = t('2026-09-24T10:00:00Z');

describe('attemptState', () => {
  it('is not_started when there is no attempt', () => {
    expect(attemptState(null, NOW)).toBe('not_started');
  });
  it('is in_progress before the deadline', () => {
    expect(attemptState({ expiresAt: t('2026-09-24T10:20:00Z'), submittedAt: null }, NOW)).toBe('in_progress');
  });
  it('is expired once the deadline passes unsubmitted', () => {
    expect(attemptState({ expiresAt: t('2026-09-24T09:40:00Z'), submittedAt: null }, NOW)).toBe('expired');
  });
  it('is submitted once stamped, even before the deadline', () => {
    expect(attemptState({ expiresAt: t('2026-09-24T10:20:00Z'), submittedAt: t('2026-09-24T09:50:00Z') }, NOW))
      .toBe('submitted');
  });
});

const openQuiz = {
  isPublished: true,
  opensAt: t('2026-09-24T09:00:00Z'),
  closesAt: t('2026-09-24T11:00:00Z'),
  classIds: [1, 2],
};

describe('canStart', () => {
  it('allows a published, open quiz for a student in a targeted class with no prior attempt', () => {
    expect(canStart({ quiz: openQuiz, studentClassId: 1, hasAttempt: false }, NOW)).toEqual({ ok: true });
  });
  it('refuses an unpublished quiz', () => {
    expect(canStart({ quiz: { ...openQuiz, isPublished: false }, studentClassId: 1, hasAttempt: false }, NOW))
      .toEqual({ ok: false, reason: 'not_published' });
  });
  it('refuses before the window opens', () => {
    expect(canStart({ quiz: openQuiz, studentClassId: 1, hasAttempt: false }, t('2026-09-24T08:59:00Z')))
      .toEqual({ ok: false, reason: 'not_open_yet' });
  });
  it('refuses after the window closes', () => {
    expect(canStart({ quiz: openQuiz, studentClassId: 1, hasAttempt: false }, t('2026-09-24T11:00:01Z')))
      .toEqual({ ok: false, reason: 'closed' });
  });
  it('allows a start exactly on the opening boundary', () => {
    expect(canStart({ quiz: openQuiz, studentClassId: 1, hasAttempt: false }, t('2026-09-24T09:00:00Z')))
      .toEqual({ ok: true });
  });
  it('refuses a student whose class was not targeted', () => {
    expect(canStart({ quiz: openQuiz, studentClassId: 9, hasAttempt: false }, NOW))
      .toEqual({ ok: false, reason: 'wrong_class' });
  });
  it('refuses a second attempt', () => {
    expect(canStart({ quiz: openQuiz, studentClassId: 1, hasAttempt: true }, NOW))
      .toEqual({ ok: false, reason: 'already_attempted' });
  });
  it('checks publication before anything else, so an unpublished closed quiz reads as unpublished', () => {
    expect(canStart({ quiz: { ...openQuiz, isPublished: false }, studentClassId: 9, hasAttempt: true }, NOW))
      .toEqual({ ok: false, reason: 'not_published' });
  });
});

describe('canSaveAnswer', () => {
  const live = { expiresAt: t('2026-09-24T10:00:00Z'), submittedAt: null };
  it('accepts before the deadline', () => {
    expect(canSaveAnswer(live, t('2026-09-24T09:59:59Z'))).toBe(true);
  });
  it('accepts inside the grace window, so a request in flight is not punished for latency', () => {
    expect(canSaveAnswer(live, new Date(live.expiresAt.getTime() + ANSWER_GRACE_MS - 1))).toBe(true);
  });
  it('refuses past the grace window', () => {
    expect(canSaveAnswer(live, new Date(live.expiresAt.getTime() + ANSWER_GRACE_MS + 1))).toBe(false);
  });
  it('refuses once submitted, even well before the deadline', () => {
    expect(canSaveAnswer({ ...live, submittedAt: t('2026-09-24T09:30:00Z') }, t('2026-09-24T09:31:00Z'))).toBe(false);
  });
});
