import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiFetch, apiSend, ApiError } from '../api/client';
import { AppHeader } from '../components/AppHeader';
import { Text } from '../components/Text';
import { fromAmmanInput, toAmmanInput } from '../i18n/format';
import type { AuthorQuestion, AuthorQuiz, ClassRef, Locale } from '../api/types';

interface Settings {
  title: string;
  language: Locale;
  timeLimitMinutes: number;
  opensAt: string;   // Amman wall-clock, as datetime-local wants it
  closesAt: string;
  negativeMarking: boolean;
  classIds: number[];
}

const blankSettings = (): Settings => {
  const soon = new Date(Date.now() + 3600e3).toISOString();
  const later = new Date(Date.now() + 7 * 86400e3).toISOString();
  return {
    title: '', language: 'ar', timeLimitMinutes: 20,
    opensAt: toAmmanInput(soon), closesAt: toAmmanInput(later),
    negativeMarking: false, classIds: [],
  };
};

export function QuizEditorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isNew = id === undefined;

  const [classes, setClasses] = useState<ClassRef[]>([]);
  const [quiz, setQuiz] = useState<AuthorQuiz | null>(null);
  const [settings, setSettings] = useState<Settings>(blankSettings);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [publishProblems, setPublishProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const classRows = await apiFetch<ClassRef[]>('/me/classes');
        if (!alive) return;
        setClasses(classRows);

        if (isNew) return;
        const detail = await apiFetch<AuthorQuiz>(`/quizzes/${id}`);
        if (!alive) return;
        setQuiz(detail);
        setSettings({
          title: detail.title,
          language: detail.language,
          timeLimitMinutes: detail.timeLimitMinutes,
          opensAt: toAmmanInput(detail.opensAt),
          closesAt: toAmmanInput(detail.closesAt),
          negativeMarking: detail.negativeMarking,
          classIds: detail.classIds,
        });
      } catch (err) {
        if (!alive) return;
        if (err instanceof ApiError && err.status === 404) { navigate('/teach', { replace: true }); return; }
        setProblem(err instanceof ApiError && err.status === 0 ? 'app.offline' : 'app.error');
      }
    })();
    return () => { alive = false; };
  }, [id, isNew, navigate]);

  const reload = async () => setQuiz(await apiFetch<AuthorQuiz>(`/quizzes/${id}`));

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    setProblem(null);
    setSaved(false);

    if (settings.classIds.length === 0) { setProblem('editor.pickClass'); return; }
    const opensAt = fromAmmanInput(settings.opensAt);
    const closesAt = fromAmmanInput(settings.closesAt);
    if (new Date(closesAt) <= new Date(opensAt)) { setProblem('editor.windowOrder'); return; }

    const body = {
      title: settings.title,
      language: settings.language,
      timeLimitMinutes: settings.timeLimitMinutes,
      opensAt, closesAt,
      negativeMarking: settings.negativeMarking,
      classIds: settings.classIds,
    };

    setBusy(true);
    try {
      if (isNew) {
        const { id: newId } = await apiSend<{ id: number }>('POST', '/quizzes', body);
        navigate(`/teach/quizzes/${newId}`, { replace: true });
      } else {
        await apiSend<void>('PATCH', `/quizzes/${id}`, body);
        await reload();
        setSaved(true);
      }
    } catch (err) {
      setProblem(errorKey(err));
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setProblem(null);
    setPublishProblems([]);
    try {
      await apiSend<void>('POST', `/quizzes/${id}/publish`);
      await reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const problems = err.body?.problems;
        setPublishProblems(Array.isArray(problems) ? problems as string[] : []);
        return;
      }
      setProblem(errorKey(err));
    }
  }

  return (
    <main className="page stack">
      <AppHeader />
      <div className="row row--between">
        <h2>{isNew ? t('editor.newTitle') : t('editor.title')}</h2>
        <Link className="btn btn--quiet btn--auto" to="/teach">{t('report.back')}</Link>
      </div>

      {problem && <p className="error" role="alert">{t(problem)}</p>}

      <form className="card stack" onSubmit={saveSettings}>
        <div>
          <label htmlFor="title">{t('editor.quizTitle')}</label>
          <input id="title" className="field" dir="auto" required value={settings.title}
                 onChange={(e) => setSettings({ ...settings, title: e.target.value })} />
        </div>

        <div>
          <label htmlFor="language">{t('editor.language')}</label>
          <select id="language" className="field" value={settings.language}
                  onChange={(e) => setSettings({ ...settings, language: e.target.value as Locale })}>
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
        </div>

        <div>
          <label htmlFor="timeLimit">{t('editor.timeLimit')}</label>
          <input id="timeLimit" className="field" type="number" min={1} max={300} required
                 value={settings.timeLimitMinutes}
                 onChange={(e) => setSettings({ ...settings, timeLimitMinutes: Number(e.target.value) })} />
        </div>

        <div>
          <label htmlFor="opensAt">{t('editor.opensAt')}</label>
          <input id="opensAt" className="field" type="datetime-local" required value={settings.opensAt}
                 onChange={(e) => setSettings({ ...settings, opensAt: e.target.value })} />
        </div>

        <div>
          <label htmlFor="closesAt">{t('editor.closesAt')}</label>
          <input id="closesAt" className="field" type="datetime-local" required value={settings.closesAt}
                 onChange={(e) => setSettings({ ...settings, closesAt: e.target.value })} />
          <p className="muted">{t('editor.timesInAmman')}</p>
        </div>

        <div>
          <label>
            <input type="checkbox" checked={settings.negativeMarking}
                   onChange={(e) => setSettings({ ...settings, negativeMarking: e.target.checked })} />
            {' '}{t('editor.negativeMarking')}
          </label>
          <p className="muted">{t('editor.negativeHelp')}</p>
        </div>

        <fieldset className="stack--tight">
          <legend>{t('editor.classes')}</legend>
          {classes.map((c) => (
            <label key={c.id} className="option">
              <input type="checkbox" checked={settings.classIds.includes(c.id)}
                     onChange={(e) => setSettings({
                       ...settings,
                       classIds: e.target.checked
                         ? [...settings.classIds, c.id]
                         : settings.classIds.filter((x) => x !== c.id),
                     })} />
              <Text>{c.name}</Text>
            </label>
          ))}
        </fieldset>

        <button className="btn" type="submit" disabled={busy}>
          {isNew ? t('editor.create') : saved ? t('editor.saved') : t('editor.save')}
        </button>
      </form>

      {!isNew && quiz && (
        <>
          <h2>{t('editor.questions')}</h2>
          {quiz.questions.map((q) => (
            <QuestionEditor key={q.id} quizId={quiz.id} question={q} language={quiz.language}
                            onSaved={() => void reload()} />
          ))}
          <QuestionEditor quizId={quiz.id} language={quiz.language} onSaved={() => void reload()} />

          <section className="card stack--tight">
            <p className="muted">{t('editor.publishHelp')}</p>
            {publishProblems.length > 0 && (
              <div role="alert" className="error">
                <p>{t('editor.notPublishable')}</p>
                <ul>{publishProblems.map((p) => <li key={p}>{publishProblemText(p, t)}</li>)}</ul>
              </div>
            )}
            <button className="btn" onClick={() => void publish()} disabled={quiz.isPublished}>
              {quiz.isPublished ? t('teach.published') : t('editor.publish')}
            </button>
          </section>
        </>
      )}
    </main>
  );
}

type T = ReturnType<typeof useTranslation>['t'];

const errorKey = (err: unknown) =>
  err instanceof ApiError && err.status === 0 ? 'app.offline'
    : err instanceof ApiError && err.code === 'class_not_assigned' ? 'editor.classNotAssigned'
    : 'app.error';

/** Turns `question_3_needs_four_options` into a sentence naming question 3. */
function publishProblemText(code: string, t: T): string {
  if (code === 'no_questions') return t('editor.problem.no_questions');
  const match = /^question_(\d+)_(.+)$/.exec(code);
  if (!match) return code;
  return t(`editor.problem.${match[2]}`, { n: match[1] });
}

const emptyQuestion = () => ({
  text: '', points: 1,
  options: [
    { text: '', isCorrect: true }, { text: '', isCorrect: false },
    { text: '', isCorrect: false }, { text: '', isCorrect: false }],
});

/** One question, new or existing. Marks are typed in marks and sent as hundredths. */
function QuestionEditor({ quizId, question, language, onSaved }: {
  quizId: number; question?: AuthorQuestion; language: Locale; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(() => question
    ? {
        text: question.text,
        points: question.points / 100,
        options: question.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
      }
    : emptyQuestion());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    const body = {
      text: draft.text,
      points: Math.round(draft.points * 100),   // marks -> hundredths, at the boundary
      options: draft.options,
    };
    try {
      if (question) await apiSend<void>('PUT', `/quizzes/${quizId}/questions/${question.id}`, body);
      else {
        await apiSend<{ id: number }>('POST', `/quizzes/${quizId}/questions`, body);
        setDraft(emptyQuestion());
      }
      onSaved();
    } catch (err) {
      setProblem(errorKey(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={save} lang={language}>
      <div>
        <label htmlFor={`text-${question?.id ?? 'new'}`}>
          {question ? `${t('editor.questionText')} ${question.position}` : t('editor.addQuestion')}
        </label>
        <textarea id={`text-${question?.id ?? 'new'}`} className="field" dir="auto" rows={2} required
                  value={draft.text}
                  onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
      </div>

      <div>
        <label htmlFor={`points-${question?.id ?? 'new'}`}>{t('editor.points')}</label>
        <input id={`points-${question?.id ?? 'new'}`} className="field" type="number"
               min={0.01} step={0.01} required value={draft.points}
               onChange={(e) => setDraft({ ...draft, points: Number(e.target.value) })} />
      </div>

      {draft.options.map((o, i) => (
        <div key={i} className="row">
          <input className="field" dir="auto" required
                 aria-label={t('editor.optionText', { n: i + 1 })} value={o.text}
                 onChange={(e) => setDraft({
                   ...draft,
                   options: draft.options.map((x, j) => j === i ? { ...x, text: e.target.value } : x),
                 })} />
          <label className="correct-pick">
            <input type="radio" name={`correct-${question?.id ?? 'new'}`} checked={o.isCorrect}
                   onChange={() => setDraft({
                     ...draft,
                     options: draft.options.map((x, j) => ({ ...x, isCorrect: j === i })),
                   })} />
            {' '}{t('editor.correct')}
          </label>
        </div>
      ))}

      {problem && <p className="error" role="alert">{t(problem)}</p>}
      <button className="btn" type="submit" disabled={busy}>
        {question ? t('editor.saveQuestion') : t('editor.addQuestion')}
      </button>
    </form>
  );
}
