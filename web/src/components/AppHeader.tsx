import { useTranslation } from 'react-i18next';
import { useSession } from '../auth/SessionProvider';
import { LanguageToggle } from './LanguageToggle';
import { Text } from './Text';

/**
 * The bar every signed-in screen wears. It is the only place the language toggle
 * lives once signed in, which is what makes the preference reach the account.
 */
export function AppHeader() {
  const { t } = useTranslation();
  const { user, logout } = useSession();

  return (
    <header className="stack--tight">
      <div className="row row--between">
        <h1>{t('app.name')}</h1>
        <div className="row">
          <LanguageToggle />
          {user && (
            <button type="button" className="btn btn--quiet btn--auto"
                    onClick={() => { void logout(); }}>
              {t('nav.signOut')}
            </button>
          )}
        </div>
      </div>
      {user && <Text as="p" className="muted">{user.fullName}</Text>}
    </header>
  );
}
