import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { apiFetch, ApiError } from '../api/client';
import { AppHeader } from '../components/AppHeader';
import { Text } from '../components/Text';
import { formatDateTime, formatMarksForLocale } from '../i18n/format';
import type { QuizReport, TeacherQuiz } from '../api/types';

export function TeacherHomePage() {
  const { t, i18n } = useTranslation();
  const [quizzes, setQuizzes] = useState<TeacherQuiz[] | null>(null);
  const [reports, setReports] = useState<Map<number, QuizReport>>(new Map());
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        // Both in flight together: the list is useless without the averages next to it.
        const [list, reportRows] = await Promise.all([
          apiFetch<TeacherQuiz[]>('/quizzes'),
          apiFetch<QuizReport[]>('/reports/quizzes'),
        ]);
        if (!alive) return;
        setQuizzes(list);
        setReports(new Map(reportRows.map((r) => [r.quizId, r])));
      } catch (err) {
        if (alive) setProblem(err instanceof ApiError && err.status === 0 ? 'app.offline' : 'app.error');
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <main className="page stack">
      <AppHeader />
      <div className="row row--between">
        <h2>{t('teach.title')}</h2>
        <Link className="btn btn--auto" to="/teach/quizzes/new">{t('teach.new')}</Link>
      </div>

      {problem ? <p className="error" role="alert">{t(problem)}</p>
        : !quizzes ? <p className="muted">{t('app.loading')}</p>
        : quizzes.length === 0 ? <p className="muted">{t('teach.empty')}</p>
        : (
          <ul className="stack list-plain">
            {quizzes.map((q) => {
              const report = reports.get(q.id);
              return (
                <li key={q.id} className="card stack--tight">
                  <div className="row row--between">
                    <Text as="h3">{q.title}</Text>
                    <span className={`pill ${q.isPublished ? 'pill--on' : ''}`}>
                      {q.isPublished ? t('teach.published') : t('teach.draft')}
                    </span>
                  </div>

                  <p className="muted">
                    {t('teach.window', {
                      from: formatDateTime(q.opensAt, i18n.language),
                      to: formatDateTime(q.closesAt, i18n.language),
                    })}
                  </p>
                  <p className="muted">
                    {t('teach.questions', { count: q.questionCount })}
                    {' · '}
                    {t('quiz.marks', { count: q.totalMarks / 100 })}
                  </p>

                  {report?.classes.map((c) => (
                    // The average is the link: reading it is the moment a teacher
                    // wants the names behind it (D-06).
                    <Link key={c.classId} className="row row--between rowlink"
                          to={`/teach/quizzes/${q.id}/classes/${c.classId}`}>
                      <span>{c.name}</span>
                      <span className="muted">
                        {c.averageLabel === null
                          ? t('teach.noAverage')
                          : t('teach.average', {
                              average: formatMarksForLocale(c.averageDisplayScore!, i18n.language),
                              max: formatMarksForLocale(c.maxScore, i18n.language),
                            })}
                        {' · '}
                        {t('teach.sat', { submitted: c.submitted, total: c.total })}
                      </span>
                    </Link>
                  ))}

                  <Link className="btn btn--quiet" to={`/teach/quizzes/${q.id}`}>{t('teach.edit')}</Link>
                </li>
              );
            })}
          </ul>
        )}
    </main>
  );
}
