import { describe, it, expect } from 'vitest';
import { toAmmanInput, fromAmmanInput, formatMarksForLocale, formatDateTime } from '../src/i18n/format';

describe('Amman wall-clock conversion', () => {
  it('shows a UTC instant as the Amman time a teacher would recognise', () => {
    // Jordan is UTC+3 year round since 2022.
    expect(toAmmanInput('2026-09-24T07:00:00.000Z')).toBe('2026-09-24T10:00');
  });

  it('reads a typed Amman time back as the right UTC instant', () => {
    expect(fromAmmanInput('2026-09-24T10:00')).toBe('2026-09-24T07:00:00.000Z');
  });

  it('round-trips, which is what stops a quiz opening three hours early', () => {
    const iso = '2026-01-15T21:30:00.000Z';
    expect(fromAmmanInput(toAmmanInput(iso))).toBe(iso);
  });

  it('handles a time that crosses the date line in Amman', () => {
    // 22:00 UTC is already the next day in Amman.
    expect(toAmmanInput('2026-09-24T22:00:00.000Z')).toBe('2026-09-25T01:00');
    expect(fromAmmanInput('2026-09-25T01:00')).toBe('2026-09-24T22:00:00.000Z');
  });

  it('handles midnight, where a 24-hour formatter can report hour 24', () => {
    expect(toAmmanInput('2026-09-24T21:00:00.000Z')).toBe('2026-09-25T00:00');
    expect(fromAmmanInput('2026-09-25T00:00')).toBe('2026-09-24T21:00:00.000Z');
  });
});

describe('numbers and dates', () => {
  it('uses Western digits in Arabic, not Eastern Arabic numerals (D-21)', () => {
    expect(formatMarksForLocale(535, 'ar')).toBe('5.35');
    expect(formatMarksForLocale(2000, 'ar')).toBe('20.00');
  });

  it('formats marks the same way in English', () => {
    expect(formatMarksForLocale(535, 'en')).toBe('5.35');
  });

  it('shows dates in Amman time with Western digits in both locales', () => {
    for (const locale of ['ar', 'en']) {
      const shown = formatDateTime('2026-09-24T07:00:00.000Z', locale);
      expect(shown).toMatch(/10:00/);
      expect(shown).not.toMatch(/[٠-٩]/);   // no Eastern Arabic digits
    }
  });
});
