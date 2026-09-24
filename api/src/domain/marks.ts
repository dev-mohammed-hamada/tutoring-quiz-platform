/**
 * Marks are integer hundredths everywhere in the domain: 100 = 1.00 mark.
 *
 * The deduction for a wrong answer is a third of the question's value, which
 * produces repeating decimals. Integers remove every float and rounding
 * question; the only rounding happens once, per answer, inside
 * `wrongAnswerPenalty`, so the marks a student sees always sum to their total.
 */
export type Hundredths = number;

export function formatMarks(h: Hundredths): string {
  const sign = h < 0 ? '-' : '';
  const abs = Math.abs(h);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
