import { useTranslation } from 'react-i18next';
import { useSession } from '../auth/SessionProvider';

/**
 * One button, labelled in the language it switches *to* — so it reads as the
 * destination, not as a state. Available signed out as well, because the login
 * page itself has to be readable before anyone can set a preference.
 */
export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const { setLocale } = useSession();
  const next = i18n.language === 'ar' ? 'en' : 'ar';

  return (
    <button type="button" className="btn btn--quiet btn--auto"
            lang={next} aria-label={t('lang.label')}
            onClick={() => { void setLocale(next); }}>
      {t('lang.toggle')}
    </button>
  );
}
