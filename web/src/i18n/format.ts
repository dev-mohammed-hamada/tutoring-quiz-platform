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

/**
 * `datetime-local` has no timezone: it hands back the wall-clock the person typed.
 * The centre is in Amman and thinks in Amman time, so these two convert between
 * that wall-clock and the UTC instant the API stores — regardless of where the
 * device running the browser thinks it is.
 */
const ammanWallClock = (d: Date): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(d);
  const at = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  // en-CA gives hour "24" for midnight under hour12:false in some engines.
  const hour = at('hour') === '24' ? '00' : at('hour');
  return `${at('year')}-${at('month')}-${at('day')}T${hour}:${at('minute')}`;
};

/** UTC ISO -> the value a datetime-local input should show, in Amman time. */
export const toAmmanInput = (iso: string): string => ammanWallClock(new Date(iso));

/** A datetime-local value, read as Amman wall-clock -> the UTC instant. */
export const fromAmmanInput = (local: string): string => {
  const target = Date.parse(`${local}:00Z`);
  let t = target;
  // Two passes settle the offset even if the guess lands the wrong side of a
  // transition. Jordan has been a flat UTC+3 since 2022, so one would do.
  for (let i = 0; i < 2; i++) {
    t += target - Date.parse(`${ammanWallClock(new Date(t))}:00Z`);
  }
  return new Date(t).toISOString();
};
