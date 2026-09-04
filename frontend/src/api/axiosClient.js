import axios from 'axios';
import i18n from '../i18n';

/**
 * Hàm điều hướng do lớp React đăng ký vào.
 *
 * `axiosClient` nằm ngoài cây component nên không dùng được hook `useNavigate`.
 * Thay vì ép trình duyệt tải lại toàn bộ trang bằng `window.location.href`
 * (làm mất trạng thái ứng dụng và phải tải lại toàn bộ bundle), ứng dụng đăng ký
 * hàm điều hướng của React Router vào đây khi khởi động.
 */
let navigateFn = null;

export const registerNavigator = (fn) => {
  navigateFn = fn;
};

const redirectToLogin = () => {
  if (window.location.pathname === '/login') return;

  if (navigateFn) {
    navigateFn('/login', { replace: true });
  } else {
    // Dự phòng khi phiên hết hạn trước lúc React kịp đăng ký hàm điều hướng
    window.location.href = '/login';
  }
};

const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
  // Bắt buộc để trình duyệt gửi và nhận CloudFront Signed Cookie
  // dùng cho việc phát video ở chế độ riêng tư.
  withCredentials: true,
});

// Request Interceptor: Attach JWT token to every request
axiosClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Máy chủ trả về thông điệp lỗi bằng ngôn ngữ của tiêu đề này. Đọc trực
    // tiếp từ i18next thay vì từ navigator, vì người dùng có thể đã chọn ngôn
    // ngữ khác với ngôn ngữ trình duyệt, và lựa chọn của họ mới là thứ giao
    // diện đang hiển thị.
    config.headers['Accept-Language'] = i18n.resolvedLanguage || i18n.language;

    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle 401 unauthorized globally
axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      redirectToLogin();
    }
    return Promise.reject(error);
  }
);

export default axiosClient;
