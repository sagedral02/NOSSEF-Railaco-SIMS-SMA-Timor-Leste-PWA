import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, DataProvider, I18nProvider, OfflineProvider, ToastProvider, useAuth, useData, ZoomProvider } from './context/AppContexts';
import AppShell, { Toasts } from './components/AppShell';
import { Denied, Skeleton } from './components/ui';
import Login from './pages/Login';
import PublicAdmissions from './pages/PublicAdmissions';
import InstallPrompt from './components/InstallPrompt';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const AdmissionsDesk = lazy(() => import('./pages/AdmissionsDesk'));
const Students = lazy(() => import('./pages/Students'));
const StudentProfile = lazy(() => import('./pages/StudentProfile'));
const Staff = lazy(() => import('./pages/Staff'));
const Academic = lazy(() => import('./pages/Academic'));
const Schedules = lazy(() => import('./pages/Schedules'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Grades = lazy(() => import('./pages/Grades'));
const ReportCards = lazy(() => import('./pages/ReportCards'));
const Finance = lazy(() => import('./pages/Finance'));
const Counseling = lazy(() => import('./pages/Counseling'));
const Extracurricular = lazy(() => import('./pages/Extracurricular'));
const Library = lazy(() => import('./pages/Library'));
const Assets = lazy(() => import('./pages/Assets'));
const Communications = lazy(() => import('./pages/Communications'));
const ReportsCenter = lazy(() => import('./pages/ReportsCenter'));
const Admin = lazy(() => import('./pages/Admin'));
const StudentPortal = lazy(() => import('./pages/StudentPortal'));
const GuardianPortal = lazy(() => import('./pages/GuardianPortal'));

function Guard({ perm, children }: { perm?: string[]; children: ReactNode }) {
  const { can } = useAuth();
  if (perm && !perm.some((p) => can(p))) return <Denied />;
  return <>{children}</>;
}

function Authed() {
  const { user, loading } = useAuth();
  const { db, error } = useData();
  const loc = useLocation();
  if (loading) return <div className="min-h-dvh grid place-items-center text-sm text-ink2">Memuat sesi...</div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  const home = user.roles.includes('STUDENT') ? '/student/home' : user.roles.includes('GUARDIAN') ? '/guardian/home' : '/dashboard';
  return (
    <AppShell>
      {!db ? (
        error ? <div className="bg-white border border-line rounded-lg p-6 text-sm text-bad">{error}</div> : <div className="bg-white border border-line rounded-lg"><Skeleton rows={10} /></div>
      ) : (
        <Suspense fallback={<div className="bg-white border border-line rounded-lg"><Skeleton rows={8} /></div>}>
          <Routes>
            <Route path="/" element={<Navigate to={home} replace />} />
            <Route path="/dashboard" element={user.roles.some((r) => r === 'STUDENT' || r === 'GUARDIAN') ? <Navigate to={home} replace /> : <Dashboard />} />
            <Route path="/admissions/*" element={<Guard perm={['admission.view']}><AdmissionsDesk /></Guard>} />
            <Route path="/students" element={<Guard perm={['student.view']}><Students /></Guard>} />
            <Route path="/students/:id" element={<Guard perm={['student.view']}><StudentProfile /></Guard>} />
            <Route path="/staff" element={<Guard perm={['staff.view']}><Staff /></Guard>} />
            <Route path="/academic" element={<Guard perm={['academic.view']}><Academic /></Guard>} />
            <Route path="/schedules" element={<Guard perm={['schedule.view']}><Schedules /></Guard>} />
            <Route path="/attendance" element={<Guard perm={['attendance.view']}><Attendance /></Guard>} />
            <Route path="/grades/*" element={<Guard perm={['assessment.view']}><Grades /></Guard>} />
            <Route path="/reports/*" element={<Guard perm={['report.view']}><ReportCards /></Guard>} />
            <Route path="/finance" element={<Guard perm={['finance.view']}><Finance /></Guard>} />
            <Route path="/counseling" element={<Guard perm={['counseling.view', 'discipline.view', 'counseling.summary']}><Counseling /></Guard>} />
            <Route path="/extracurricular" element={<Guard perm={['extracurricular.view']}><Extracurricular /></Guard>} />
            <Route path="/library" element={<Guard perm={['library.view']}><Library /></Guard>} />
            <Route path="/assets" element={<Guard perm={['asset.view']}><Assets /></Guard>} />
            <Route path="/announcements" element={<Communications />} />
            <Route path="/notifications" element={<Communications initial="notifications" />} />
            <Route path="/reports-center" element={<Guard perm={['system.view_jobs', 'system.import']}><ReportsCenter /></Guard>} />
            <Route path="/admin" element={<Guard perm={['user.view', 'audit.view']}><Admin /></Guard>} />
            <Route path="/student/:tab" element={<Guard perm={['self.view']}><StudentPortal /></Guard>} />
            <Route path="/guardian/:tab" element={<Guard perm={['self.view']}><GuardianPortal /></Guard>} />
            <Route path="*" element={<Denied code="NOT_FOUND" />} />
          </Routes>
        </Suspense>
      )}
    </AppShell>
  );
}

function DataWrapped() {
  const { reload } = useData();
  return (
    <OfflineProvider onSynced={reload}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<Login mode="forgot" />} />
        <Route path="/ppdb/*" element={<PublicAdmissions />} />
        <Route path="/*" element={<Authed />} />
      </Routes>
      <Toasts />
      <InstallPrompt />
    </OfflineProvider>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <ZoomProvider>
        <ToastProvider>
          <AuthProvider>
            <DataProvider>
              <DataWrapped />
            </DataProvider>
          </AuthProvider>
        </ToastProvider>
      </ZoomProvider>
    </I18nProvider>
  );
}
