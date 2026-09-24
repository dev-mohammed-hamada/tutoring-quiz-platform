import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DirectionProvider } from './components/DirectionProvider';
import { useSession } from './auth/SessionProvider';
import { LoginPage } from './pages/LoginPage';
import { AppHeader } from './components/AppHeader';
import type { Role } from './api/types';

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

/** Stand-in until Tasks 15-17 land the real screens. */
function Soon({ title }: { title: string }) {
  return (
    <main className="page stack">
      <AppHeader />
      <h2>{title}</h2>
    </main>
  );
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

        <Route path="/quizzes" element={<RequireRole roles={['student']}><Soon title="Quizzes" /></RequireRole>} />
        <Route path="/teach" element={<RequireRole roles={['teacher', 'principal']}><Soon title="My quizzes" /></RequireRole>} />
        <Route path="/admin" element={<RequireRole roles={['principal']}><Soon title="Administration" /></RequireRole>} />

        <Route path="*" element={
          loading ? <Loading /> : <Navigate to={user ? HOME[user.role] : '/login'} replace />
        } />
      </Routes>
    </DirectionProvider>
  );
}
