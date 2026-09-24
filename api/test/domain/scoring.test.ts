import { describe, it, expect } from 'vitest';
import { gradeAnswer, totalScore, wrongAnswerPenalty, formatMarks } from '../../src/domain/scoring.js';

const ONE = 100, TWO = 200;   // hundredths

describe('wrongAnswerPenalty', () => {
  it('is one third of the question, rounded to the nearest hundredth', () => {
    expect(wrongAnswerPenalty(ONE)).toBe(33);    // 0.33
    expect(wrongAnswerPenalty(TWO)).toBe(67);    // 0.67
    expect(wrongAnswerPenalty(300)).toBe(100);   // 1.00, exact
  });
});

describe('gradeAnswer', () => {
  it('awards full points for a correct answer regardless of negative marking', () => {
    expect(gradeAnswer(TWO, true, false)).toBe(200);
    expect(gradeAnswer(TWO, true, true)).toBe(200);
  });

  it('awards nothing for a wrong answer when negative marking is off', () => {
    expect(gradeAnswer(TWO, false, false)).toBe(0);
  });

  it('deducts a third for a wrong answer when negative marking is on', () => {
    expect(gradeAnswer(ONE, false, true)).toBe(-33);
    expect(gradeAnswer(TWO, false, true)).toBe(-67);
  });

  it('never penalises a blank answer', () => {
    expect(gradeAnswer(TWO, null, true)).toBe(0);
    expect(gradeAnswer(TWO, null, false)).toBe(0);
  });
});

// A 15-question, 20-mark quiz: ten 1-mark questions and five 2-mark questions.
// Both papers come from the design discussion and are named so the reasoning survives.
describe('totalScore — worked papers, negative marking on', () => {
  it('Layla: studied, unsure on a few — 8x1 right, 2x2 right, 2x1 wrong, 2x2 wrong, one 2-mark blank', () => {
    const awarded = [
      ...Array(8).fill(gradeAnswer(ONE, true, true)),
      ...Array(2).fill(gradeAnswer(TWO, true, true)),
      ...Array(2).fill(gradeAnswer(ONE, false, true)),
      ...Array(2).fill(gradeAnswer(TWO, false, true)),
      gradeAnswer(TWO, null, true),
    ];
    expect(totalScore(awarded)).toEqual({ raw: 1000, display: 1000 });
    expect(formatMarks(1000)).toBe('10.00');
  });

  it('Omar: guessed all fifteen — 4x1 and 1x2 lucky, the rest wrong', () => {
    const awarded = [
      ...Array(4).fill(gradeAnswer(ONE, true, true)),
      gradeAnswer(TWO, true, true),
      ...Array(6).fill(gradeAnswer(ONE, false, true)),
      ...Array(4).fill(gradeAnswer(TWO, false, true)),
    ];
    expect(totalScore(awarded)).toEqual({ raw: 134, display: 134 });
  });

  it('every answer wrong: the raw total goes negative and the displayed total floors at zero', () => {
    const awarded = [
      ...Array(10).fill(gradeAnswer(ONE, false, true)),
      ...Array(5).fill(gradeAnswer(TWO, false, true)),
    ];
    expect(totalScore(awarded)).toEqual({ raw: -665, display: 0 });
  });

  it('a blank paper and a badly guessed paper stay distinguishable in the raw score', () => {
    const blank = totalScore(Array(15).fill(gradeAnswer(ONE, null, true)));
    const guessed = totalScore(Array(15).fill(gradeAnswer(ONE, false, true)));
    expect(blank.raw).toBe(0);
    expect(guessed.raw).toBeLessThan(blank.raw);
  });

  it('the same paper scores higher when the teacher does not deduct', () => {
    const paper = (neg: boolean) => totalScore([
      ...Array(8).fill(gradeAnswer(ONE, true, neg)),
      ...Array(2).fill(gradeAnswer(TWO, true, neg)),
      ...Array(2).fill(gradeAnswer(ONE, false, neg)),
      ...Array(2).fill(gradeAnswer(TWO, false, neg)),
      gradeAnswer(TWO, null, neg),
    ]);
    expect(paper(false).raw).toBe(1200);
    expect(paper(true).raw).toBe(1000);
  });

  it('an empty paper scores zero rather than throwing', () => {
    expect(totalScore([])).toEqual({ raw: 0, display: 0 });
  });
});

describe('formatMarks', () => {
  it('renders hundredths as two decimal places', () => {
    expect(formatMarks(0)).toBe('0.00');
    expect(formatMarks(134)).toBe('1.34');
    expect(formatMarks(1000)).toBe('10.00');
    expect(formatMarks(-665)).toBe('-6.65');
    expect(formatMarks(5)).toBe('0.05');
  });
});
