import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../auth/SessionProvider';
import { LanguageToggle } from '../components/LanguageToggle';
import { ApiError } from '../api/client';

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useSession();
  const [loginCode, setLoginCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await login(loginCode.trim(), password);
      // Routing happens in App: once `user` is set, /login redirects by role.
    } catch (err) {
      // A refused sign-in gets one message whichever half was wrong - telling a
      // stranger that a login code exists is the whole thing this avoids. A
      // dropped connection is a different problem and says so.
      if (err instanceof ApiError && err.status === 0) setProblem('app.offline');
      else if (err instanceof ApiError && err.status === 401) setProblem('login.failed');
      else { setProblem('app.error'); console.error(err); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page stack">
      <header className="row row--between">
        <h1>{t('app.name')}</h1>
        <LanguageToggle />
      </header>

      <form className="card stack" onSubmit={onSubmit} noValidate>
        <div>
          <h2>{t('login.title')}</h2>
          <p className="muted">{t('login.subtitle')}</p>
        </div>

        <div>
          <label htmlFor="loginCode">{t('login.code')}</label>
          <input id="loginCode" className="field" name="loginCode" required
                 autoComplete="username" autoCapitalize="none" autoCorrect="off"
                 dir="auto" inputMode="text"
                 value={loginCode} onChange={(e) => setLoginCode(e.target.value)} />
        </div>

        <div>
          <label htmlFor="password">{t('login.password')}</label>
          <input id="password" className="field" name="password" type="password" required
                 autoComplete="current-password" dir="auto"
                 value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        {problem && <p className="error" role="alert">{t(problem)}</p>}

        <button className="btn" type="submit" disabled={busy}>
          {busy ? t('login.working') : t('login.submit')}
        </button>
      </form>
    </main>
  );
}
