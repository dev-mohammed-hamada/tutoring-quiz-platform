import { formatMarks } from '../domain/marks.js';

/**
 * Two separate functions rather than one with a flag. The locked shape has no
 * code path that can reach a correct option - the answer key is not present in
 * the object to be forgotten about, and the route never even queries for it.
 */
export const serializeLockedResult = (a: {
  displayScore: number; maxScore: number; closesAt: Date;
}) => ({
  locked: true as const,
  displayScore: a.displayScore,
  displayScoreLabel: formatMarks(a.displayScore),
  maxScore: a.maxScore,
  maxScoreLabel: formatMarks(a.maxScore),
  answersAvailableAt: a.closesAt.toISOString(),
});

export const serializeUnlockedResult = (a: {
  displayScore: number; maxScore: number;
  questions: {
    id: number; position: number; text: string; points: number;
    yourOptionId: number | null; correctOptionId: number; awarded: number;
    options: { id: number; position: number; text: string }[];
  }[];
}) => ({
  locked: false as const,
  displayScore: a.displayScore,
  displayScoreLabel: formatMarks(a.displayScore),
  maxScore: a.maxScore,
  maxScoreLabel: formatMarks(a.maxScore),
  questions: a.questions.map((q) => ({
    id: q.id,
    position: q.position,
    text: q.text,
    points: q.points,
    pointsLabel: formatMarks(q.points),
    yourOptionId: q.yourOptionId,
    correctOptionId: q.correctOptionId,
    awarded: q.awarded,
    awardedLabel: formatMarks(q.awarded),
    options: q.options,
  })),
});
