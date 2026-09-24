import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QuizEditorPage } from '../src/pages/QuizEditorPage';
import { SessionProvider } from '../src/auth/SessionProvider';
import i18n from '../src/i18n';

const quiz = {
  id: 5, title: 'Algebra Basics', language: 'en', timeLimitMinutes: 20,
  opensAt: '2026-09-24T07:00:00.000Z', closesAt: '2026-10-01T07:00:00.000Z',
  negativeMarking: false, isPublished: false, classIds: [1], totalMarks: 250,
  questions: [{
    id: 31, position: 1, text: 'What is 2 + 2?', points: 250,
    options: [
      { id: 301, position: 1, text: '3', isCorrect: false },
      { id: 302, position: 2, text: '4', isCorrect: true },
      { id: 303, position: 3, text: '5', isCorrect: false },
      { id: 304, position: 4, text: '6', isCorrect: false },
    ],
  }],
};

const teacher = { id: 2, role: 'teacher', locale: 'en', classId: null, fullName: 'Samir Odeh' };

function stub(handlers: Record<string, (body: unknown) => { status: number; body?: unknown }>) {
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${String(url)}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`unstubbed: ${key}`);
    const { status, body } = handler(init?.body ? JSON.parse(String(init.body)) : null);
    return new Response(status === 204 ? null : JSON.stringify(body ?? {}),
      { status, headers: { 'content-type': 'application/json' } });
  });
}

const base = {
  'GET /api/me': () => ({ status: 200, body: teacher }),
  'GET /api/me/classes': () => ({ status: 200, body: [{ id: 1, name: '10A' }, { id: 2, name: '10B' }] }),
  'GET /api/quizzes/5': () => ({ status: 200, body: quiz }),
};

const renderEditor = () => render(
  <MemoryRouter initialEntries={['/teach/quizzes/5']}>
    <SessionProvider>
      <Routes><Route path="/teach/quizzes/:id" element={<QuizEditorPage />} /></Routes>
    </SessionProvider>
  </MemoryRouter>);

beforeEach(async () => { await i18n.changeLanguage('en'); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('the quiz editor', () => {
  it('shows marks in marks and sends them as hundredths', async () => {
    const sent: unknown[] = [];
    vi.stubGlobal('fetch', stub({
      ...base,
      'PUT /api/quizzes/5/questions/31': (body) => { sent.push(body); return { status: 204 }; },
    }));

    const user = userEvent.setup();
    renderEditor();

    // The page carries a form per question plus a blank one for adding, so the
    // assertions are scoped to the existing question's own form.
    const existing = (await screen.findByLabelText('Question 1')).closest('form')!;

    // 250 hundredths is 2.50 marks, and that is what a teacher should see.
    const points = within(existing).getByLabelText('Marks');
    expect(points).toHaveValue(2.5);

    await user.clear(points);
    await user.type(points, '3');
    await user.click(within(existing).getByRole('button', { name: 'Save question' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ points: 300, text: 'What is 2 + 2?' });
  });

  it('shows the opening time as Amman wall-clock, not the device timezone', async () => {
    vi.stubGlobal('fetch', stub(base));
    renderEditor();
    // 07:00Z is 10:00 in Amman.
    await waitFor(() => expect(screen.getByLabelText('Opens')).toHaveValue('2026-09-24T10:00'));
  });

  it('turns a refused publish into sentences that name the question', async () => {
    vi.stubGlobal('fetch', stub({
      ...base,
      'POST /api/quizzes/5/publish': () => ({
        status: 422,
        body: { error: 'not_publishable', problems: ['question_2_needs_four_options', 'question_3_needs_one_correct_option'] },
      }),
    }));

    const user = userEvent.setup();
    renderEditor();
    await user.click(await screen.findByRole('button', { name: 'Publish' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Question 2 needs four options.');
    expect(alert).toHaveTextContent('Question 3 needs exactly one correct option.');
    // The raw code must not leak through to a teacher.
    expect(alert.textContent).not.toMatch(/question_2_needs/);
  });

  it('refuses to save a window that closes before it opens, without asking the server', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', stub({
      ...base,
      'PATCH /api/quizzes/5': () => { calls.push('patch'); return { status: 204 }; },
    }));

    const user = userEvent.setup();
    renderEditor();

    const closes = await screen.findByLabelText('Closes');
    await user.clear(closes);
    await user.type(closes, '2026-09-20T10:00');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('The closing time must be after the opening time.');
    expect(calls).toEqual([]);
  });
});
