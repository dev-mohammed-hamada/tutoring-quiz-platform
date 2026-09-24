import { NavLink } from 'react-router-dom';
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

      {user && user.role !== 'student' && (
        <nav className="row tabs">
          <NavLink to="/teach" className={({ isActive }) => `tab${isActive ? ' tab--on' : ''}`}>
            {t('nav.teach')}
          </NavLink>
          {user.role === 'principal' && (
            <NavLink to="/admin" className={({ isActive }) => `tab${isActive ? ' tab--on' : ''}`}>
              {t('nav.admin')}
            </NavLink>
          )}
        </nav>
      )}

      {user?.role === 'student' && (
        <nav className="row tabs">
          <NavLink to="/quizzes" className={({ isActive }) => `tab${isActive ? ' tab--on' : ''}`}>
            {t('nav.quizzes')}
          </NavLink>
          <NavLink to="/history" className={({ isActive }) => `tab${isActive ? ' tab--on' : ''}`}>
            {t('nav.history')}
          </NavLink>
        </nav>
      )}
    </header>
  );
}
