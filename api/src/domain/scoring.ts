import type { Hundredths } from './marks.js';

export { formatMarks } from './marks.js';
export type { Hundredths } from './marks.js';

/**
 * Four options per question, as the client described their paper quizzes.
 * A wrong answer costs points / (OPTIONS - 1), the ratio at which random
 * guessing is exactly break-even: a student who genuinely does not know gains
 * nothing on average by guessing, while one who can eliminate an option is
 * still rewarded for that partial knowledge.
 */
export const OPTIONS_PER_QUESTION = 4;

export function wrongAnswerPenalty(points: Hundredths): Hundredths {
  return Math.round(points / (OPTIONS_PER_QUESTION - 1));
}

/**
 * `isCorrect === null` means the question was left blank. Blanks are never
 * penalised — running out of time should not be punished twice.
 */
export function gradeAnswer(
  points: Hundredths,
  isCorrect: boolean | null,
  negativeMarking: boolean,
): Hundredths {
  if (isCorrect === null) return 0;
  if (isCorrect) return points;
  return negativeMarking ? -wrongAnswerPenalty(points) : 0;
}

/**
 * The raw total may be negative and is shown only to the principal. The
 * displayed total floors at zero, so one bad paper cannot produce a mark that
 * means nothing to a parent, and a class average stays readable.
 */
export function totalScore(awarded: Hundredths[]): { raw: Hundredths; display: Hundredths } {
  const raw = awarded.reduce((sum, a) => sum + a, 0);
  return { raw, display: Math.max(0, raw) };
}
