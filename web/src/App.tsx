import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DirectionProvider } from './components/DirectionProvider';
import { useSession } from './auth/SessionProvider';
import { LoginPage } from './pages/LoginPage';
import { QuizListPage } from './pages/QuizListPage';
import { AttemptPage } from './pages/AttemptPage';
import { ResultPage } from './pages/ResultPage';
import { HistoryPage } from './pages/HistoryPage';
import { TeacherHomePage } from './pages/TeacherHomePage';
import { QuizEditorPage } from './pages/QuizEditorPage';
import { QuizReportPage } from './pages/QuizReportPage';
import { AdminPage } from './pages/AdminPage';
import { AdminImportPage } from './pages/AdminImportPage';
import type { Role } from './api/types';

const staff: Role[] = ['teacher', 'principal'];

/** Where each role lands after signing in. */
const HOME: Record<Role, string> = {
  student: '/quizzes',
  teacher: '/teach',
  principal: '/admin',
};

function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user, loading } = useSession();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  // Wrong role is sent home rather than shown a door it cannot open.
  if (!roles.includes(user.role)) return <Navigate to={HOME[user.role]} replace />;
  return <>{children}</>;
}

function Loading() {
  const { t } = useTranslation();
  return <main className="page"><p className="muted">{t('app.loading')}</p></main>;
}

export default function App() {
  const { i18n } = useTranslation();
  const { user, loading } = useSession();
  const locale = i18n.language === 'en' ? 'en' : 'ar';

  return (
    <DirectionProvider locale={locale}>
      <Routes>
        <Route path="/login" element={
          loading ? <Loading /> : user ? <Navigate to={HOME[user.role]} replace /> : <LoginPage />
        } />

        <Route path="/quizzes" element={<RequireRole roles={['student']}><QuizListPage /></RequireRole>} />
        <Route path="/attempts/:id" element={<RequireRole roles={['student']}><AttemptPage /></RequireRole>} />
        <Route path="/attempts/:id/result" element={<RequireRole roles={['student']}><ResultPage /></RequireRole>} />
        <Route path="/history" element={<RequireRole roles={['student']}><HistoryPage /></RequireRole>} />
        <Route path="/teach" element={<RequireRole roles={staff}><TeacherHomePage /></RequireRole>} />
        <Route path="/teach/quizzes/new" element={<RequireRole roles={staff}><QuizEditorPage /></RequireRole>} />
        <Route path="/teach/quizzes/:id" element={<RequireRole roles={staff}><QuizEditorPage /></RequireRole>} />
        <Route path="/teach/quizzes/:id/classes/:classId" element={<RequireRole roles={staff}><QuizReportPage /></RequireRole>} />
        <Route path="/admin" element={<RequireRole roles={['principal']}><AdminPage /></RequireRole>} />
        <Route path="/admin/import" element={<RequireRole roles={['principal']}><AdminImportPage /></RequireRole>} />

        <Route path="*" element={
          loading ? <Loading /> : <Navigate to={user ? HOME[user.role] : '/login'} replace />
        } />
      </Routes>
    </DirectionProvider>
  );
}
