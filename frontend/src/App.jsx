import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/useAuth';
import { registerNavigator } from './api/axiosClient';
import { isInternalPath } from './hooks/useAuthRedirect';
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
import SettingsPage from './pages/SettingsPage';
import AdminPage from './pages/AdminPage';
import NotFoundPage from './pages/NotFoundPage';
import ForbiddenPage from './pages/ForbiddenPage';

/**
 * Protected Route — redirects to /login if not authenticated
 *
 * Ghi kèm trang đích vào state của router để sau khi đăng nhập xong người dùng
 * quay lại đúng chỗ họ định vào, thay vì bị bỏ ở trang danh mục và phải tự tìm
 * lại. Xem `useAuthRedirect`, nơi đọc lại state này.
 */
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex-center full-screen-center">
        <div className="spinner" />
      </div>
    );
  }

  if (!isAuthenticated) {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to="/login" state={{ from }} replace />;
  }

  return children;
};

/**
 * Admin Route — chỉ quản trị viên (role === 'admin').
 *
 * Khách được đưa sang đăng nhập như ProtectedRoute; người dùng thường nhận
 * trang 403. Đây chỉ là lớp giao diện: mọi endpoint /api/admin tự kiểm tra
 * vai trò ở máy chủ (middleware requireAdmin).
 */
const AdminRoute = ({ children }) => {
  const { user } = useAuth();

  return (
    <ProtectedRoute>
      {user?.role === 'admin' ? children : <Navigate to="/403" replace />}
    </ProtectedRoute>
  );
};

/**
 * Guest Route — redirects to / if already authenticated
 *
 * Cũng phải tôn trọng trang đích như `ProtectedRoute`. Ngay khi đăng nhập thành
 * công thì `isAuthenticated` đổi sang true, và route này có thể chuyển hướng
 * trước cả khi biểu mẫu kịp gọi điều hướng của nó. Nếu ở đây cứ về "/" thì tuỳ
 * bên nào chạy trước mà người dùng lúc quay lại đúng chỗ, lúc lại rơi về trang
 * chủ. Cho cả hai cùng một đích thì kết quả không phụ thuộc thứ tự nữa.
 */
const GuestRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex-center full-screen-center">
        <div className="spinner" />
      </div>
    );
  }

  if (isAuthenticated) {
    const from = location.state?.from;
    return <Navigate to={isInternalPath(from) ? from : '/'} replace />;
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
      <div className="flex-center full-screen-center">
        <div className="spinner spinner-lg" />
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
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminPage />
              </AdminRoute>
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

        <Route path="/403" element={<ForbiddenPage />} />
        <Route path="/404" element={<NotFoundPage />} />

        {/* 404 fallback */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
