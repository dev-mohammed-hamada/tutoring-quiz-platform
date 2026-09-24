import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ar from './ar.json';

export type Locale = 'en' | 'ar';
export const LOCALE_KEY = 'locale';

/** Reading storage throws outright in some private-browsing modes, so it is guarded. */
const storage = (): Storage | null => {
  try { return window.localStorage; } catch { return null; }
};

const stored = storage()?.getItem(LOCALE_KEY) ?? null;

// i18next routes plurals through Intl.PluralRules, which knows Arabic's six
// categories (zero/one/two/few/many/other). This is why we are not hand-rolling it.
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  // Arabic is the centre's own language, so it is the default for a first visit;
  // a signed-in user's stored preference overrides this as soon as /me arrives.
  lng: stored === 'en' || stored === 'ar' ? stored : 'ar',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

/** Single place that changes the interface language and remembers the choice. */
export function applyLocale(locale: Locale): void {
  if (i18n.language !== locale) void i18n.changeLanguage(locale);
  try { storage()?.setItem(LOCALE_KEY, locale); } catch { /* quota, private mode */ }
}

export default i18n;
