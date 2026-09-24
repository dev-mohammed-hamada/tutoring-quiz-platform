import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { apiFetch, ApiError } from '../api/client';
import { AppHeader } from '../components/AppHeader';
import { Text } from '../components/Text';
import { formatDateTime, formatMarksForLocale } from '../i18n/format';
import type { HistoryEntry } from '../api/types';

export function HistoryPage() {
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const rows = await apiFetch<HistoryEntry[]>('/students/me/history');
        if (alive) setEntries(rows);
      } catch (err) {
        if (!alive) return;
        setProblem(err instanceof ApiError && err.status === 0 ? 'app.offline' : 'app.error');
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <main className="page stack">
      <AppHeader />
      <h2>{t('history.title')}</h2>

      {problem ? <p className="error" role="alert">{t(problem)}</p>
        : !entries ? <p className="muted">{t('app.loading')}</p>
        : entries.length === 0 ? <p className="muted">{t('history.empty')}</p>
        : (
          <ul className="stack list-plain">
            {entries.map((e) => (
              <li key={e.attemptId} className="card stack--tight">
                <Text as="h3">{e.title}</Text>
                <p className="score__value score__value--small">
                  {t('quizzes.outOf', {
                    score: formatMarksForLocale(e.displayScore, i18n.language),
                    max: formatMarksForLocale(e.maxScore, i18n.language),
                  })}
                </p>
                <p className="muted">
                  {t('history.submittedAt', { when: formatDateTime(e.submittedAt, i18n.language) })}
                  {e.submittedReason === 'expiry' && ` · ${t('history.byExpiry')}`}
                </p>
                {e.reviewReleased
                  ? <Link className="btn btn--quiet" to={`/attempts/${e.attemptId}/result`}>{t('history.review')}</Link>
                  : <p className="muted">{t('history.reviewAt', { when: formatDateTime(e.reviewAvailableAt, i18n.language) })}</p>}
              </li>
            ))}
          </ul>
        )}
    </main>
  );
}
