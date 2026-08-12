import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './context/useAuth';
import { registerNavigator } from './api/axiosClient';
import MainLayout from './components/Layout/MainLayout';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import UploadPage from './pages/UploadPage';
import WatchPage from './pages/WatchPage';
import ChannelPage from './pages/ChannelPage';
import LandingPage from './pages/LandingPage';

/**
 * Protected Route — redirects to /login if not authenticated
 */
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

/**
 * Guest Route — redirects to / if already authenticated
 */
const GuestRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
};

/**
 * Đăng ký hàm điều hướng của React Router cho lớp gọi API.
 * Nhờ đó khi phiên đăng nhập hết hạn (HTTP 401), ứng dụng chuyển về trang đăng
 * nhập bằng cơ chế điều hướng nội bộ thay vì tải lại toàn bộ trang.
 * Component này phải nằm bên trong <BrowserRouter> mới dùng được useNavigate.
 */
const NavigatorRegistrar = () => {
  const navigate = useNavigate();

  useEffect(() => {
    registerNavigator(navigate);
    return () => registerNavigator(null);
  }, [navigate]);

  return null;
};

function App() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: '100vh' }}>
        <div className="spinner" style={{ width: 48, height: 48 }} />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <NavigatorRegistrar />
      <Routes>
        {/* Routes with Navbar (MainLayout) */}
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/landing" element={<LandingPage />} />
          <Route path="/watch/:id" element={<WatchPage />} />
          <Route path="/channel/:userId" element={<ChannelPage />} />
          <Route
            path="/upload"
            element={
              <ProtectedRoute>
                <UploadPage />
              </ProtectedRoute>
            }
          />
        </Route>

        {/* Auth routes (no Navbar) */}
        <Route
          path="/login"
          element={
            <GuestRoute>
              <LoginPage />
            </GuestRoute>
          }
        />
        <Route
          path="/register"
          element={
            <GuestRoute>
              <RegisterPage />
            </GuestRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <GuestRoute>
              <ForgotPasswordPage />
            </GuestRoute>
          }
        />
        <Route
          path="/reset-password/:token"
          element={
            <GuestRoute>
              <ResetPasswordPage />
            </GuestRoute>
          }
        />

        {/* 404 fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
