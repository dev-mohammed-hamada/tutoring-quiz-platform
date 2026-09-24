import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, apiSend, ApiError } from '../api/client';
import { AppHeader } from '../components/AppHeader';
import { Text } from '../components/Text';
import { formatDateTime, formatMarksForLocale } from '../i18n/format';
import type { StudentQuiz } from '../api/types';

export function QuizListPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<StudentQuiz[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [starting, setStarting] = useState<number | null>(null);

  const load = useCallback(async () => {
    setProblem(null);
    try {
      setQuizzes(await apiFetch<StudentQuiz[]>('/quizzes'));
    } catch (err) {
      setProblem(err instanceof ApiError && err.status === 0 ? 'app.offline' : 'app.error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function start(quiz: StudentQuiz) {
    setStarting(quiz.id);
    setProblem(null);
    try {
      const { attemptId } = await apiSend<{ attemptId: number }>('POST', `/quizzes/${quiz.id}/attempt`);
      navigate(`/attempts/${attemptId}`);
    } catch (err) {
      // A refusal here means the list is stale - the quiz closed, or this student
      // already has an attempt. Reloading tells them which, in the quiz's own words.
      setProblem(err instanceof ApiError && err.status === 0 ? 'app.offline' : 'quizzes.startFailed');
      void load();
    } finally {
      setStarting(null);
    }
  }

  if (problem && !quizzes) {
    return (
      <main className="page stack">
        <AppHeader />
        <p className="error" role="alert">{t(problem)}</p>
        <button className="btn" onClick={() => void load()}>{t('app.retry')}</button>
      </main>
    );
  }

  return (
    <main className="page stack">
      <AppHeader />
      <h2>{t('quizzes.title')}</h2>
      {problem && <p className="error" role="alert">{t(problem)}</p>}

      {!quizzes ? <p className="muted">{t('app.loading')}</p>
        : quizzes.length === 0 ? <p className="muted">{t('quizzes.empty')}</p>
        : (
          <ul className="stack list-plain">
            {quizzes.map((q) => (
              <li key={q.id} className="card stack--tight">
                <Text as="h3">{q.title}</Text>
                <p className="muted">{status(q, t, i18n.language)}</p>
                <p className="muted">
                  {t('quizzes.timeLimit', { count: q.timeLimitMinutes })}
                  {' · '}
                  {t('quiz.marks', { count: q.totalMarks / 100 })}
                </p>
                {q.negativeMarking && <p className="muted warn">{t('quiz.negativeMarking')}</p>}
                {action(q, t, starting === q.id, () => void start(q))}
              </li>
            ))}
          </ul>
        )}
    </main>
  );
}

type T = ReturnType<typeof useTranslation>['t'];

/** The one line that says where this quiz stands for this student. */
function status(q: StudentQuiz, t: T, locale: string): string {
  switch (q.state) {
    case 'available': return t('quizzes.openUntil', { when: formatDateTime(q.closesAt, locale) });
    case 'not_open_yet': return t('quizzes.opensAt', { when: formatDateTime(q.opensAt, locale) });
    case 'closed': return t('quizzes.closedOn', { when: formatDateTime(q.closesAt, locale) });
    case 'in_progress': return t('state.in_progress');
    case 'expired': return t('state.expired');
    case 'submitted':
      return q.displayScore === null ? t('state.submitted') : t('quizzes.outOf', {
        score: formatMarksForLocale(q.displayScore, locale),
        max: formatMarksForLocale(q.totalMarks, locale),
      });
  }
}

function action(q: StudentQuiz, t: T, busy: boolean, onStart: () => void) {
  if (q.state === 'available') {
    return (
      <>
        <p className="muted">{t('quizzes.onceOnly')}</p>
        <button className="btn" disabled={busy} onClick={onStart}>{t('quizzes.start')}</button>
      </>
    );
  }
  if (q.state === 'in_progress' && q.attemptId) {
    return <Link className="btn" to={`/attempts/${q.attemptId}`}>{t('quizzes.resume')}</Link>;
  }
  // An expired attempt was already scored by the sweeper, so it reads like any
  // other finished paper rather than offering a door back in.
  if ((q.state === 'submitted' || q.state === 'expired') && q.attemptId) {
    return <Link className="btn btn--quiet" to={`/attempts/${q.attemptId}/result`}>{t('quizzes.seeResult')}</Link>;
  }
  return null;
}
