import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiFetch, apiSend, ApiError } from '../api/client';
import { applyLocale } from '../i18n';
import type { Locale, Me } from '../api/types';

interface Session {
  user: Me | null;
  /** True until the first /me has answered, so no screen redirects on a guess. */
  loading: boolean;
  login(loginCode: string, password: string): Promise<void>;
  logout(): Promise<void>;
  setLocale(locale: Locale): Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  // One /me on boot. A 401 is the ordinary answer for a signed-out visitor, not
  // an error, so it resolves the session as "nobody" rather than bubbling up.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const me = await apiFetch<Me>('/me');
        if (!alive) return;
        setUser(me);
        applyLocale(me.locale);
      } catch (err) {
        if (!alive) return;
        if (!(err instanceof ApiError) || err.status !== 401) console.error(err);
        setUser(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const login = useCallback(async (loginCode: string, password: string) => {
    const { user: me } = await apiSend<{ user: Me }>('POST', '/auth/login', { loginCode, password });
    setUser(me);
    applyLocale(me.locale);
  }, []);

  const logout = useCallback(async () => {
    await apiSend<void>('POST', '/auth/logout');
    setUser(null);
  }, []);

  // The interface switches immediately; persisting is a follow-up that a signed-out
  // visitor simply does not have. Their choice still survives in localStorage.
  const setLocale = useCallback(async (locale: Locale) => {
    applyLocale(locale);
    setUser((u) => (u ? { ...u, locale } : u));
    if (user) await apiSend<void>('PATCH', '/me', { locale });
  }, [user]);

  const value = useMemo<Session>(
    () => ({ user, loading, login, logout, setLocale }),
    [user, loading, login, logout, setLocale]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
