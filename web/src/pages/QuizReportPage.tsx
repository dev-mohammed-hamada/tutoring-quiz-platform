import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { apiFetch, ApiError } from '../api/client';
import { AppHeader } from '../components/AppHeader';
import { Text } from '../components/Text';
import { useSession } from '../auth/SessionProvider';
import { formatDateTime, formatMarksForLocale } from '../i18n/format';
import type { ClassReport } from '../api/types';

export function QuizReportPage() {
  const { t, i18n } = useTranslation();
  const { user } = useSession();
  const { id, classId } = useParams<{ id: string; classId: string }>();
  const [report, setReport] = useState<ClassReport | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const data = await apiFetch<ClassReport>(`/reports/quizzes/${id}/classes/${classId}`);
        if (alive) setReport(data);
      } catch (err) {
        if (alive) setProblem(err instanceof ApiError && err.status === 0 ? 'app.offline' : 'app.error');
      }
    })();
    return () => { alive = false; };
  }, [id, classId]);

  // Only the principal's payload carries rawScore at all; a teacher's simply has
  // no such field, so there is nothing here to accidentally reveal.
  const showRaw = user?.role === 'principal';

  const sat = report?.students.filter((s) => s.displayScore !== null) ?? [];
  const average = sat.length === 0 ? null
    : Math.round(sat.reduce((sum, s) => sum + (s.displayScore ?? 0), 0) / sat.length);

  return (
    <main className="page stack">
      <AppHeader />
      {problem ? <p className="error" role="alert">{t(problem)}</p>
        : !report ? <p className="muted">{t('app.loading')}</p>
        : (
          <>
            <Text as="h2">{report.title}</Text>

            <section className="card stack--tight">
              <p className="muted">{t('report.average')}</p>
              <p className="score__value">
                {average === null ? t('teach.noAverage') : t('quizzes.outOf', {
                  score: formatMarksForLocale(average, i18n.language),
                  max: formatMarksForLocale(report.maxScore, i18n.language),
                })}
              </p>
            </section>

            <div className="card table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">{t('report.student')}</th>
                    <th scope="col">{t('report.score')}</th>
                    {showRaw && <th scope="col">{t('report.rawScore')}</th>}
                    <th scope="col">{t('report.submitted')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.students.map((s) => (
                    <tr key={s.id} className={s.state === 'not_started' ? 'row--absent' : ''}>
                      <th scope="row"><Text>{s.fullName}</Text></th>
                      <td>{s.displayScore === null ? '—'
                        : formatMarksForLocale(s.displayScore, i18n.language)}</td>
                      {showRaw && (
                        <td>{s.rawScore === null || s.rawScore === undefined ? '—'
                          : formatMarksForLocale(s.rawScore, i18n.language)}</td>
                      )}
                      <td>{s.submittedAt
                        ? formatDateTime(s.submittedAt, i18n.language)
                        : t(`report.state.${s.state}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {showRaw && <p className="muted">{t('report.rawHelp')}</p>}
            <Link className="btn btn--quiet" to={user?.role === 'principal' ? '/admin' : '/teach'}>
              {t('report.back')}
            </Link>
          </>
        )}
    </main>
  );
}
