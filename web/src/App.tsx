import { lazy, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useAuth } from './context/auth';
import MainLayout from './components/Layout/MainLayout';
import { ForbiddenPage, NotFoundPage, Spinner } from './components/Common/StatusScreen';
import HomePage from './pages/HomePage';

// The watch page pulls hls.js (about 160 kB gzip); it loads on its route and is prefetched
// when the browser is idle, so the first page stays light.
const loadWatchPage = () => import('./pages/WatchPage');
const WatchPage = lazy(loadWatchPage);
const AuthPages = {
  Login: lazy(() => import('./pages/auth/LoginPage')),
  Register: lazy(() => import('./pages/auth/RegisterPage')),
  Forgot: lazy(() => import('./pages/auth/ForgotPasswordPage')),
  Reset: lazy(() => import('./pages/auth/ResetPasswordPage')),
  Verify: lazy(() => import('./pages/auth/VerifyEmailPage')),
};
const Pending = lazy(() => import('./pages/Pending'));

export const isInternalPath = (v: unknown): v is string => typeof v === 'string' && v.startsWith('/') && !v.startsWith('//');

function prefetchWatchPageWhenIdle() {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return undefined;
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(() => void loadWatchPage(), { timeout: 5000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(() => void loadWatchPage(), 3000);
  return () => clearTimeout(id);
}

/** Sends guests to sign-in and remembers where they wanted to go. */
function Protected({ children, staff = false }: { children: ReactNode; staff?: boolean }) {
  const { isAuthenticated, isStaff, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: `${location.pathname}${location.search}` }} replace />;
  if (staff && !isStaff) return <Navigate to="/403" replace />;
  return children;
}

/** Signed-in users skip the auth pages, back to where they came from. */
function GuestOnly({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (isAuthenticated) {
    const from = (location.state as { from?: unknown } | null)?.from;
    return <Navigate to={isInternalPath(from) ? from : '/'} replace />;
  }
  return children;
}

/** Channel pages live at /@handle; anything else at the root level is a 404. */
function ChannelRoute() {
  const { ref = '' } = useParams();
  return ref.startsWith('@') ? <Pending name="channel" /> : <NotFoundPage />;
}

export default function App() {
  useEffect(prefetchWatchPageWhenIdle, []);
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/results" element={<HomePage />} />
          <Route path="/watch/:id" element={<WatchPage />} />
          <Route path="/landing" element={<Pending name="landing" />} />
          <Route path="/subscriptions" element={<Protected><Pending name="subscriptions" /></Protected>} />
          <Route path="/history" element={<Protected><Pending name="history" /></Protected>} />
          <Route path="/playlists" element={<Protected><Pending name="playlists" /></Protected>} />
          <Route path="/playlist/:id" element={<Pending name="playlist" />} />
          <Route path="/notifications" element={<Protected><Pending name="notifications" /></Protected>} />
          <Route path="/upload" element={<Protected><Pending name="upload" /></Protected>} />
          <Route path="/studio/*" element={<Protected><Pending name="studio" /></Protected>} />
          <Route path="/settings" element={<Protected><Pending name="settings" /></Protected>} />
          <Route path="/admin" element={<Protected staff><Pending name="admin" /></Protected>} />
          <Route path="/:ref" element={<ChannelRoute />} />
        </Route>
        <Route path="/login" element={<GuestOnly><AuthPages.Login /></GuestOnly>} />
        <Route path="/register" element={<GuestOnly><AuthPages.Register /></GuestOnly>} />
        <Route path="/forgot-password" element={<GuestOnly><AuthPages.Forgot /></GuestOnly>} />
        <Route path="/reset-password" element={<GuestOnly><AuthPages.Reset /></GuestOnly>} />
        {/* Signed-in users open verification links too. */}
        <Route path="/verify-email" element={<AuthPages.Verify />} />
        <Route path="/403" element={<ForbiddenPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
