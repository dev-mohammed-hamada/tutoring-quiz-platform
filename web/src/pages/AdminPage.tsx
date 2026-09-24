import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { apiFetch, apiSend, ApiError } from '../api/client';
import { AppHeader } from '../components/AppHeader';
import { Text } from '../components/Text';
import { formatDateTime, formatMarksForLocale } from '../i18n/format';
import type { AdminClass, AdminUser, Locale, QuizReport, Role } from '../api/types';

type Tab = 'overview' | 'classes' | 'users' | 'assignments';

export function AdminPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('overview');
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [reports, setReports] = useState<QuizReport[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [classRows, userRows, reportRows] = await Promise.all([
        apiFetch<AdminClass[]>('/admin/classes'),
        apiFetch<AdminUser[]>('/admin/users'),
        apiFetch<QuizReport[]>('/reports/quizzes'),
      ]);
      setClasses(classRows);
      setUsers(userRows);
      setReports(reportRows);
    } catch (err) {
      setProblem(err instanceof ApiError && err.status === 0 ? 'app.offline' : 'app.error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const tabs: Tab[] = ['overview', 'classes', 'users', 'assignments'];

  return (
    <main className="page stack">
      <AppHeader />
      <div className="row row--between">
        <h2>{t('admin.title')}</h2>
        <Link className="btn btn--auto" to="/admin/import">{t('admin.import')}</Link>
      </div>

      {problem && <p className="error" role="alert">{t(problem)}</p>}

      <nav className="row tabs tabs--scroll">
        {tabs.map((name) => (
          <button key={name} type="button" className={`tab${tab === name ? ' tab--on' : ''}`}
                  aria-current={tab === name ? 'page' : undefined}
                  onClick={() => setTab(name)}>
            {t(`admin.tab.${name}`)}
          </button>
        ))}
      </nav>

      {tab === 'overview' && <Overview reports={reports} />}
      {tab === 'classes' && <Classes classes={classes} onChanged={() => void load()} />}
      {tab === 'users' && <Users users={users} classes={classes} onChanged={() => void load()} />}
      {tab === 'assignments' && <Assignments users={users} classes={classes} onChanged={() => void load()} />}
    </main>
  );
}

/** Every quiz in the centre. The principal's scope is unrestricted (D-07). */
function Overview({ reports }: { reports: QuizReport[] }) {
  const { t, i18n } = useTranslation();
  if (reports.length === 0) return <p className="muted">{t('teach.empty')}</p>;

  return (
    <ul className="stack list-plain">
      {reports.map((r) => (
        <li key={r.quizId} className="card stack--tight">
          <Text as="h3">{r.title}</Text>
          <p className="muted">
            {t('teach.window', {
              from: formatDateTime(r.opensAt, i18n.language),
              to: formatDateTime(r.closesAt, i18n.language),
            })}
          </p>
          {r.classes.map((c) => (
            <Link key={c.classId} className="row row--between rowlink"
                  to={`/teach/quizzes/${r.quizId}/classes/${c.classId}`}>
              <span>{c.name}</span>
              <span className="muted">
                {c.averageLabel === null ? t('teach.noAverage') : t('teach.average', {
                  average: formatMarksForLocale(c.averageDisplayScore!, i18n.language),
                  max: formatMarksForLocale(c.maxScore, i18n.language),
                })}
                {' · '}{t('teach.sat', { submitted: c.submitted, total: c.total })}
              </span>
            </Link>
          ))}
        </li>
      ))}
    </ul>
  );
}

function Classes({ classes, onChanged }: { classes: AdminClass[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await apiSend<{ id: number }>('POST', '/admin/classes', { name: name.trim() });
      setName('');
      onChanged();
    } catch (err) {
      setProblem(err instanceof ApiError && err.status === 409 ? 'admin.classes.exists' : 'app.error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="card stack" onSubmit={add}>
        <div>
          <label htmlFor="className">{t('admin.classes.name')}</label>
          <input id="className" className="field" dir="auto" required maxLength={32}
                 value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {problem && <p className="error" role="alert">{t(problem)}</p>}
        <button className="btn" type="submit" disabled={busy}>{t('admin.classes.add')}</button>
      </form>

      <ul className="stack list-plain">
        {classes.map((c) => (
          <li key={c.id} className="card row row--between">
            <Text>{c.name}</Text>
            <span className="muted">{t('admin.classes.students', { count: c.studentCount })}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Users({ users, classes, onChanged }: {
  users: AdminUser[]; classes: AdminClass[]; onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState({
    role: 'student' as Role, fullName: '', loginCode: '', password: '',
    locale: 'ar' as Locale, classId: '' as string,
  });
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    const body = {
      role: draft.role,
      fullName: draft.fullName,
      loginCode: draft.loginCode,
      password: draft.password,
      locale: draft.locale,
      // A student must carry a class and staff must not — the API enforces it too.
      ...(draft.role === 'student' ? { classId: Number(draft.classId) } : {}),
    };
    try {
      await apiSend<{ id: number }>('POST', '/admin/users', body);
      setDraft({ ...draft, fullName: '', loginCode: '', password: '' });
      onChanged();
    } catch (err) {
      setProblem(err instanceof ApiError && err.status === 409 ? 'admin.users.taken'
        : err instanceof ApiError && err.status === 400 ? 'admin.users.needClass'
        : 'app.error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="card stack" onSubmit={add}>
        <div>
          <label htmlFor="role">{t('admin.users.role')}</label>
          <select id="role" className="field" value={draft.role}
                  onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}>
            <option value="student">{t('admin.role.student')}</option>
            <option value="teacher">{t('admin.role.teacher')}</option>
            <option value="principal">{t('admin.role.principal')}</option>
          </select>
        </div>

        <div>
          <label htmlFor="fullName">{t('admin.users.fullName')}</label>
          <input id="fullName" className="field" dir="auto" required
                 value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} />
        </div>

        <div>
          <label htmlFor="loginCode">{t('admin.users.loginCode')}</label>
          <input id="loginCode" className="field" dir="auto" required autoCapitalize="none"
                 value={draft.loginCode} onChange={(e) => setDraft({ ...draft, loginCode: e.target.value })} />
        </div>

        <div>
          <label htmlFor="newPassword">{t('admin.users.password')}</label>
          <input id="newPassword" className="field" type="password" required minLength={6}
                 autoComplete="new-password"
                 value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} />
        </div>

        <div>
          <label htmlFor="locale">{t('admin.users.locale')}</label>
          <select id="locale" className="field" value={draft.locale}
                  onChange={(e) => setDraft({ ...draft, locale: e.target.value as Locale })}>
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
        </div>

        {draft.role === 'student' && (
          <div>
            <label htmlFor="classId">{t('admin.users.class')}</label>
            <select id="classId" className="field" required value={draft.classId}
                    onChange={(e) => setDraft({ ...draft, classId: e.target.value })}>
              <option value="">—</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {problem && <p className="error" role="alert">{t(problem)}</p>}
        <button className="btn" type="submit" disabled={busy}>{t('admin.users.add')}</button>
      </form>

      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">{t('admin.users.fullName')}</th>
              <th scope="col">{t('admin.users.loginCode')}</th>
              <th scope="col">{t('admin.users.role')}</th>
              <th scope="col">{t('admin.users.class')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.isActive ? '' : 'row--absent'}>
                <th scope="row"><Text>{u.fullName}</Text></th>
                <td><Text>{u.loginCode}</Text></td>
                <td>{t(`admin.role.${u.role}`)}{!u.isActive && ` · ${t('admin.users.inactive')}`}</td>
                <td>{u.className ? <Text>{u.className}</Text> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Assignments({ users, classes, onChanged }: {
  users: AdminUser[]; classes: AdminClass[]; onChanged: () => void;
}) {
  const { t } = useTranslation();
  const teachers = users.filter((u) => u.role === 'teacher');
  const [teacherId, setTeacherId] = useState<number | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const chosen = teachers.find((x) => x.id === teacherId) ?? null;

  function choose(id: number) {
    setTeacherId(id);
    setSaved(false);
    setPicked(teachers.find((x) => x.id === id)?.assignedClassIds ?? []);
  }

  async function save() {
    setProblem(null);
    try {
      // Replaces the whole set rather than appending, which is what the API does.
      await apiSend('POST', '/admin/assignments', { teacherId, classIds: picked });
      setSaved(true);
      onChanged();
    } catch {
      setProblem('app.error');
    }
  }

  return (
    <div className="card stack">
      <div>
        <label htmlFor="teacher">{t('admin.assign.teacher')}</label>
        <select id="teacher" className="field" value={teacherId ?? ''}
                onChange={(e) => choose(Number(e.target.value))}>
          <option value="">—</option>
          {teachers.map((x) => <option key={x.id} value={x.id}>{x.fullName}</option>)}
        </select>
      </div>

      {chosen && (
        <>
          <fieldset className="stack--tight">
            <legend>{t('editor.classes')}</legend>
            {classes.map((c) => (
              <label key={c.id} className="option">
                <input type="checkbox" checked={picked.includes(c.id)}
                       onChange={(e) => setPicked(e.target.checked
                         ? [...picked, c.id]
                         : picked.filter((x) => x !== c.id))} />
                <Text>{c.name}</Text>
              </label>
            ))}
          </fieldset>
          {problem && <p className="error" role="alert">{t(problem)}</p>}
          {saved && <p className="muted" role="status">{t('admin.assign.saved')}</p>}
          <button className="btn" onClick={() => void save()}>{t('admin.assign.save')}</button>
        </>
      )}
    </div>
  );
}
