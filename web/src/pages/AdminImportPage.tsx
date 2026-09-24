import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { apiSend, ApiError } from '../api/client';
import { AppHeader } from '../components/AppHeader';
import type { ImportResult } from '../api/types';

type Kind = 'students' | 'teachers';

/** Shown on the page so nobody has to go and find the documentation. */
const COLUMNS: Record<Kind, string> = {
  students: 'login_code, full_name, class_name, password, locale',
  teachers: 'login_code, full_name, role, password, locale',
};

export function AdminImportPage() {
  const { t } = useTranslation();
  const [kind, setKind] = useState<Kind>('students');
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);

  // The file is read here and posted as text: the API takes CSV in the body, so
  // there is no upload endpoint and no multipart to get wrong.
  function readFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result ?? ''));
    reader.readAsText(file);
  }

  async function run(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    setMissing([]);
    setResult(null);
    try {
      setResult(await apiSend<ImportResult>('POST', '/admin/import', { kind, csv }));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'missing_columns') {
        setMissing((err.body?.missing as string[] | undefined) ?? []);
      } else {
        setProblem(err instanceof ApiError && err.status === 0 ? 'app.offline' : 'app.error');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page stack">
      <AppHeader />
      <div className="row row--between">
        <h2>{t('import.title')}</h2>
        <Link className="btn btn--quiet btn--auto" to="/admin">{t('report.back')}</Link>
      </div>

      <form className="card stack" onSubmit={run}>
        <div>
          <label htmlFor="kind">{t('import.kind')}</label>
          <select id="kind" className="field" value={kind}
                  onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="students">{t('import.kind.students')}</option>
            <option value="teachers">{t('import.kind.teachers')}</option>
          </select>
        </div>

        <p className="muted">
          {t('import.columns')}: <code dir="ltr">{COLUMNS[kind]}</code>
        </p>
        <p className="muted">{t('import.passwordNote')}</p>

        <div>
          <label htmlFor="csv">{t('import.paste')}</label>
          <textarea id="csv" className="field csv" dir="ltr" rows={8} required
                    value={csv} onChange={(e) => setCsv(e.target.value)} />
        </div>

        <div>
          <label htmlFor="file">{t('import.orFile')}</label>
          <input id="file" className="field" type="file" accept=".csv,text/csv" onChange={readFile} />
        </div>

        {problem && <p className="error" role="alert">{t(problem)}</p>}
        {missing.length > 0 && (
          <p className="error" role="alert">{t('import.missingColumns', { columns: missing.join(', ') })}</p>
        )}

        <button className="btn" type="submit" disabled={busy || csv.trim() === ''}>
          {busy ? t('import.running') : t('import.run')}
        </button>
      </form>

      {result && (
        <section className="card stack--tight" role="status">
          <p className="score__value score__value--small">
            {t('import.created', { count: result.created })}
            {' · '}
            {t('import.updated', { count: result.updated })}
          </p>
          {result.errors.length === 0 ? <p className="muted">{t('import.noErrors')}</p> : (
            <>
              <h3>{t('import.errors')}</h3>
              <ul className="stack--tight">
                {result.errors.map((err) => (
                  <li key={err.line}>
                    <strong>{t('import.line', { line: err.line })}</strong>{' — '}
                    <span dir="auto">{err.message}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </main>
  );
}
