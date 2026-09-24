import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { apiFetch, ApiError } from '../api/client';
import { AppHeader } from '../components/AppHeader';
import { Text } from '../components/Text';
import { formatDateTime } from '../i18n/format';
import type { ResultPayload } from '../api/types';

export function ResultPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const payload = await apiFetch<ResultPayload>(`/attempts/${id}/result`);
        if (alive) setResult(payload);
      } catch (err) {
        if (!alive) return;
        setProblem(err instanceof ApiError && err.status === 0 ? 'app.offline' : 'app.error');
      }
    })();
    return () => { alive = false; };
  }, [id]);

  if (problem) return <main className="page stack"><AppHeader /><p className="error" role="alert">{t(problem)}</p></main>;
  if (!result) return <main className="page stack"><AppHeader /><p className="muted">{t('app.loading')}</p></main>;

  return (
    <main className="page stack">
      <AppHeader />
      <h2>{t('result.title')}</h2>

      <section className="card stack--tight score">
        <p className="score__value">
          {t('result.score', { score: result.displayScoreLabel, max: result.maxScoreLabel })}
        </p>
      </section>

      {result.locked ? (
        <section className="card stack--tight">
          <h3>{t('result.lockedTitle')}</h3>
          <p className="muted">
            {t('result.lockedBody', { when: formatDateTime(result.answersAvailableAt, i18n.language) })}
          </p>
        </section>
      ) : (
        <ol className="stack list-plain">
          {result.questions.map((q) => (
            <li key={q.id} className="card stack--tight">
              <Text as="p" className="question__text">{q.text}</Text>
              <ul className="stack--tight list-plain">
                {q.options.map((o) => {
                  const yours = o.id === q.yourOptionId;
                  const right = o.id === q.correctOptionId;
                  return (
                    <li key={o.id} className={`option option--static${right ? ' option--right' : yours ? ' option--wrong' : ''}`}>
                      <Text>{o.text}</Text>
                      {/* Both tags when they coincide: without the student's own mark, a
                          question they got right looks identical to one they left blank. */}
                      <span className="tags">
                        {yours && <span className={`tag ${right ? 'tag--ok' : 'tag--bad'}`}>{t('result.yourAnswer')}</span>}
                        {right && <span className="tag tag--ok">{t('result.correctAnswer')}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {q.yourOptionId === null && <p className="muted">{t('result.notAnswered')}</p>}
              <p className="muted">{t('result.awarded', { marks: q.awardedLabel })}</p>
            </li>
          ))}
        </ol>
      )}

      <Link className="btn btn--quiet" to="/quizzes">{t('result.backToQuizzes')}</Link>
    </main>
  );
}
