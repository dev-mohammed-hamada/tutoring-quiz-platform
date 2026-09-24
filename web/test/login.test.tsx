import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import { SessionProvider } from '../src/auth/SessionProvider';
import i18n, { LOCALE_KEY } from '../src/i18n';

const me = { id: 1, role: 'student', locale: 'ar', classId: 1, fullName: 'ليلى حداد' };

/** Minimal stand-in for the API: every call is declared by the test that needs it. */
function stubApi(handlers: Record<string, () => { status: number; body?: unknown }>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${String(input)}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`unstubbed request: ${key}`);
    const { status, body } = handler();
    return new Response(status === 204 ? null : JSON.stringify(body ?? {}),
      { status, headers: { 'content-type': 'application/json' } });
  });
}

const renderApp = () => render(
  <MemoryRouter initialEntries={['/login']}>
    <SessionProvider><App /></SessionProvider>
  </MemoryRouter>);

beforeEach(async () => { localStorage.clear(); await i18n.changeLanguage('ar'); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('signing in', () => {
  it('shows one neutral message for a rejected sign-in, naming neither field', async () => {
    vi.stubGlobal('fetch', stubApi({
      'GET /api/me': () => ({ status: 401, body: { error: 'unauthenticated' } }),
      'POST /api/auth/login': () => ({ status: 401, body: { error: 'invalid_credentials' } }),
    }));
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderApp();

    await user.type(await screen.findByLabelText('Login code'), '10A-001');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('That login code and password do not match.');
    // It must not hint at which half was wrong, or that the code exists at all.
    expect(alert.textContent).not.toMatch(/code is|no such|unknown|incorrect password/i);
  });

  it('says the connection dropped rather than blaming the password', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (`${init?.method ?? 'GET'} ${String(input)}` === 'GET /api/me') {
        return new Response(JSON.stringify({ error: 'unauthenticated' }),
          { status: 401, headers: { 'content-type': 'application/json' } });
      }
      throw new TypeError('Failed to fetch');   // what a browser throws when offline
    }));
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderApp();

    await user.type(await screen.findByLabelText('Login code'), '10A-001');
    await user.type(screen.getByLabelText('Password'), 'pass1234');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect((await screen.findByRole('alert')).textContent).toBe('You appear to be offline.');
  });

  it('sends a signed-in student to their quizzes', async () => {
    // This student's account is set to English, so the interface stays English
    // after sign-in; a student whose account says Arabic would flip to Arabic here.
    vi.stubGlobal('fetch', stubApi({
      'GET /api/me': () => ({ status: 401, body: { error: 'unauthenticated' } }),
      'POST /api/auth/login': () => ({ status: 200, body: { user: { ...me, locale: 'en' } } }),
      'GET /api/quizzes': () => ({ status: 200, body: [] }),
    }));
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderApp();

    await user.type(await screen.findByLabelText('Login code'), '10A-001');
    await user.type(screen.getByLabelText('Password'), 'pass1234');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Quizzes' })).toBeDefined());
  });

  it('adopts the language stored on the account when the session resolves', async () => {
    vi.stubGlobal('fetch', stubApi({
      'GET /api/me': () => ({ status: 200, body: { ...me, locale: 'en' } }),
    }));
    renderApp();
    await waitFor(() => expect(i18n.language).toBe('en'));
    await waitFor(() => expect(document.documentElement.dir).toBe('ltr'));
  });
});

describe('the language toggle', () => {
  it('mirrors the interface and remembers the choice, signed out', async () => {
    vi.stubGlobal('fetch', stubApi({
      'GET /api/me': () => ({ status: 401, body: { error: 'unauthenticated' } }),
    }));
    const user = userEvent.setup();
    renderApp();

    // Arabic first: the toggle is labelled with where it goes, not where it is.
    const toggle = await screen.findByRole('button', { name: 'اللغة' });
    expect(document.documentElement.dir).toBe('rtl');
    expect(toggle.textContent).toBe('English');

    await user.click(toggle);

    await waitFor(() => expect(document.documentElement.dir).toBe('ltr'));
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem(LOCALE_KEY)).toBe('en');
  });

  it('writes the choice through to the account when signed in', async () => {
    const patched: unknown[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${String(input)}`;
      if (key === 'GET /api/me') {
        return new Response(JSON.stringify(me), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (key === 'PATCH /api/me') {
        patched.push(JSON.parse(String(init?.body)));
        return new Response(null, { status: 204 });
      }
      throw new Error(`unstubbed request: ${key}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: 'اللغة' }));
    await waitFor(() => expect(patched).toEqual([{ locale: 'en' }]));
  });
});
