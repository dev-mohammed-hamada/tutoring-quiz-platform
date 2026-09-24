import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch, apiSend, ApiError } from '../api/client';
import { Countdown } from '../components/Countdown';
import { QuestionCard } from '../components/QuestionCard';
import { Text } from '../components/Text';
import type { AttemptPayload } from '../api/types';

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

const DEBOUNCE_MS = 300;
const RETRIES = 2;

export function AttemptPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [data, setData] = useState<AttemptPayload | null>(null);
  const [answers, setAnswers] = useState<Map<number, number | null>>(new Map());
  const [index, setIndex] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  // Resuming is the same code path as starting: the server hands back the answers
  // already recorded, so a refresh mid-attempt loses nothing and the deadline is
  // whatever it always was.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const payload = await apiFetch<AttemptPayload>(`/attempts/${id}`);
        if (!alive) return;
        if (payload.attempt.submittedAt) { navigate(`/attempts/${id}/result`, { replace: true }); return; }
        setData(payload);
        setAnswers(new Map(payload.answers.map((a) => [a.questionId, a.selectedOptionId])));
      } catch (err) {
        if (!alive) return;
        if (err instanceof ApiError && err.status === 404) { navigate('/quizzes', { replace: true }); return; }
        setProblem(err instanceof ApiError && err.status === 0 ? 'app.offline' : 'app.error');
      }
    })();
    return () => {
      alive = false;
      for (const timer of timers.current.values()) clearTimeout(timer);
    };
  }, [id, navigate]);

  /** Writes one answer, retrying a couple of times before it admits defeat. */
  const persist = useCallback(async (questionId: number, optionId: number | null) => {
    setSaveState('saving');
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        await apiSend(`PUT`, `/attempts/${id}/answers/${questionId}`, { selectedOptionId: optionId });
        setSaveState('saved');
        return;
      } catch (err) {
        // A closed attempt is not a connection problem and will never succeed;
        // the countdown is about to take over anyway.
        if (err instanceof ApiError && err.status === 409) { setSaveState('failed'); return; }
        if (attempt === RETRIES) { setSaveState('failed'); return; }
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }, [id]);

  function select(questionId: number, optionId: number | null) {
    setAnswers((prev) => new Map(prev).set(questionId, optionId));
    const existing = timers.current.get(questionId);
    if (existing) clearTimeout(existing);
    // Debounced per question: tapping through options sends one save, not four.
    timers.current.set(questionId, setTimeout(() => { void persist(questionId, optionId); }, DEBOUNCE_MS));
  }

  const submit = useCallback(async (reason: 'manual' | 'expiry') => {
    setSubmitting(true);
    // Anything still sitting in the debounce would otherwise land after the
    // submit and be refused, so it goes now.
    for (const [questionId, timer] of timers.current) {
      clearTimeout(timer);
      if (reason === 'manual') await persist(questionId, answers.get(questionId) ?? null);
    }
    timers.current.clear();
    try {
      await apiSend('POST', `/attempts/${id}/submit`);
      navigate(`/attempts/${id}/result`, { replace: true });
    } catch (err) {
      setProblem(err instanceof ApiError && err.status === 0 ? 'app.offline' : 'app.error');
      setSubmitting(false);
    }
  }, [answers, id, navigate, persist]);

  const onExpire = useCallback(() => {
    setExpired(true);
    void submit('expiry');
  }, [submit]);

  if (problem && !data) {
    return <main className="page stack"><p className="error" role="alert">{t(problem)}</p></main>;
  }
  if (!data) return <main className="page"><p className="muted">{t('app.loading')}</p></main>;

  const question = data.questions[index];
  if (!question) return <main className="page"><p className="muted">{t('app.loading')}</p></main>;

  const total = data.questions.length;
  const blanks = data.questions.filter((q) => (answers.get(q.id) ?? null) === null).length;
  const last = index === total - 1;

  return (
    <main className="page stack attempt">
      <header className="attempt__bar card row row--between">
        <Text as="span" className="attempt__title">{data.quiz.title}</Text>
        <Countdown expiresAt={data.attempt.expiresAt} serverNow={data.serverNow} onExpire={onExpire} />
      </header>

      <div className="row row--between">
        <p className="muted">{t('attempt.question', { n: index + 1, total })}</p>
        <p className="muted" aria-live="polite">
          {saveState === 'saving' ? t('attempt.saving') : saveState === 'saved' ? t('attempt.saved') : ''}
        </p>
      </div>

      <progress className="progress" value={total - blanks} max={total} />

      {saveState === 'failed' && <p className="error" role="alert">{t('attempt.saveFailed')}</p>}
      {expired && <p className="error" role="alert">{t('attempt.timeUp')}</p>}

      <QuestionCard
        question={question}
        quizLanguage={data.quiz.language}
        selected={answers.get(question.id) ?? null}
        onSelect={(optionId) => select(question.id, optionId)}
        disabled={expired || submitting}
      />

      <div className="row">
        <button type="button" className="btn btn--quiet" disabled={index === 0}
                onClick={() => setIndex((i) => i - 1)}>
          {t('attempt.previous')}
        </button>
        {last ? (
          <button type="button" className="btn" disabled={submitting || expired}
                  onClick={() => setConfirming(true)}>
            {t('attempt.finish')}
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => setIndex((i) => i + 1)}>
            {t('attempt.next')}
          </button>
        )}
      </div>

      {confirming && (
        // An in-page confirmation rather than window.confirm: a native dialog on a
        // phone blocks the countdown's own ticking and looks nothing like the app.
        <div className="confirm" role="alertdialog" aria-modal="true" aria-label={t('attempt.finish')}>
          <div className="confirm__sheet card stack">
          <p>{blanks > 0
            ? t('attempt.confirmUnanswered', { count: blanks })
            : t('attempt.confirmFinish')}</p>
          <button type="button" className="btn" disabled={submitting}
                  onClick={() => { setConfirming(false); void submit('manual'); }}>
            {submitting ? t('attempt.submitting') : t('attempt.finish')}
          </button>
          <button type="button" className="btn btn--quiet" onClick={() => setConfirming(false)}>
            {t('attempt.cancel')}
          </button>
          </div>
        </div>
      )}
    </main>
  );
}
