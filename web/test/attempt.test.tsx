import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AttemptPage } from '../src/pages/AttemptPage';
import i18n from '../src/i18n';

const payload = {
  attempt: {
    id: 1, expiresAt: '2026-09-24T10:15:00Z', submittedAt: null,
    state: 'in_progress', maxScore: 200,
  },
  quiz: { id: 7, title: 'القراءة والفهم', language: 'ar', negativeMarking: false, timeLimitMinutes: 15 },
  serverNow: '2026-09-24T10:00:00Z',
  questions: [
    {
      id: 11, position: 1, text: 'ما مرادف كلمة (البهجة)؟', points: 100, pointsLabel: '1.00',
      options: [
        { id: 101, position: 1, text: 'السرور' },
        { id: 102, position: 2, text: 'الحزن' },
        { id: 103, position: 3, text: 'الغضب' },
        { id: 104, position: 4, text: 'الخوف' },
      ],
    },
  ],
  answers: [],
};

const renderAttempt = () => render(
  <MemoryRouter initialEntries={['/attempts/1']}>
    <Routes><Route path="/attempts/:id" element={<AttemptPage />} /></Routes>
  </MemoryRouter>);

beforeEach(async () => { await i18n.changeLanguage('en'); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('answering', () => {
  it('sends one save for a burst of taps, not one per tap', async () => {
    const calls: { method: string; url: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ method, url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
      if (method === 'GET') {
        return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ saved: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    const user = userEvent.setup();
    renderAttempt();

    // A student changing their mind twice before settling.
    await user.click(await screen.findByLabelText('الحزن'));
    await user.click(screen.getByLabelText('الغضب'));
    await user.click(screen.getByLabelText('السرور'));

    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());

    const saves = calls.filter((c) => c.method === 'PUT');
    expect(saves).toHaveLength(1);
    expect(saves[0]!.url).toBe('/api/attempts/1/answers/11');
    expect(saves[0]!.body).toEqual({ selectedOptionId: 101 });
  });

  it('keeps the answer on screen and warns when the save will not go through', async () => {
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') {
        return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      attempts++;
      throw new TypeError('Failed to fetch');   // the phone lost its connection
    }));

    const user = userEvent.setup();
    renderAttempt();

    const option = await screen.findByLabelText('السرور');
    await user.click(option);

    // Two retries with backoff, so this takes a moment; the choice must stay put.
    await waitFor(
      () => expect(screen.getByRole('alert')).toHaveTextContent('Your last answer did not save.'),
      { timeout: 5000 });
    expect((option as HTMLInputElement).checked).toBe(true);
    // It gave up only after trying three times: the first go and two retries.
    expect(attempts).toBe(3);
  }, 10_000);

  it('hands the paper in by itself when the server-set deadline passes', async () => {
    const submits: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') {
        // One second left, measured against the server's own clock.
        const nearly = { ...payload, serverNow: '2026-09-24T10:14:59Z' };
        return new Response(JSON.stringify(nearly), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (method === 'POST') submits.push(String(url));
      return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    renderAttempt();
    await screen.findByRole('timer');

    await act(async () => { await new Promise((r) => setTimeout(r, 1400)); });

    await waitFor(() => expect(submits).toEqual(['/api/attempts/1/submit']));
  }, 10_000);
});
