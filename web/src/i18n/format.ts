const TZ = 'Asia/Amman';

const numberLocale = (locale: string) => (locale === 'ar' ? 'ar-JO-u-nu-latn' : 'en-JO');

/**
 * Western digits in both locales (D-21). Named distinctly from the API's
 * `formatMarks` in `api/src/domain/marks.ts`, which is locale-independent.
 */
export const formatMarksForLocale = (hundredths: number, locale: string) =>
  new Intl.NumberFormat(numberLocale(locale),
    { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(hundredths / 100);

export const formatCount = (n: number, locale: string) =>
  new Intl.NumberFormat(numberLocale(locale)).format(n);

/** Gregorian dates in Amman time, in both locales (D-11, D-21). */
export const formatDateTime = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale === 'ar' ? 'ar-JO-u-nu-latn-ca-gregory' : 'en-JO',
    { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
