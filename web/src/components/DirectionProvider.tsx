import { useEffect, type ReactNode } from 'react';

/** Interface direction. Content direction is handled separately by <Text> and quiz blocks (D-22). */
export function DirectionProvider({ locale, children }: { locale: 'en' | 'ar'; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = locale;
  }, [locale]);
  return <>{children}</>;
}
