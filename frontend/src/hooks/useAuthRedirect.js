import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Đưa người dùng trở lại trang họ định vào trước khi bị chặn vì chưa đăng nhập.
 *
 * Trước đây mọi lối đăng nhập đều gọi `navigate('/')`, nên ai bấm Upload lúc
 * chưa có phiên sẽ bị đá về trang danh mục sau khi đăng nhập xong và phải tự
 * tìm lại nút Upload. `ProtectedRoute` ghi trang đích vào state của router khi
 * chuyển hướng, còn hook này đọc lại state đó.
 *
 * Chỉ nhận đường dẫn nội bộ. State của router do chính mã trong ứng dụng đặt
 * chứ không đến từ URL, nhưng vẫn chặn cho chắc: chuỗi phải bắt đầu bằng một
 * dấu gạch chéo và không được bắt đầu bằng hai dấu, vì `//example.com` là URL
 * tuyệt đối theo giao thức hiện tại và sẽ dẫn ra ngoài trang.
 */
export const isInternalPath = (value) =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');

const useAuthRedirect = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from;

  return useCallback(() => {
    navigate(isInternalPath(from) ? from : '/', { replace: true });
  }, [navigate, from]);
};

export default useAuthRedirect;
