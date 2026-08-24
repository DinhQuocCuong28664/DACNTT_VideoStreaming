import { useEffect, useRef } from 'react';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GIS_MAX_WIDTH = 400; // giới hạn tối đa mà Google Identity Services cho phép

/**
 * Nút "Đăng nhập bằng Google" dùng Google Identity Services (script được
 * nạp trong index.html). Không tự render gì nếu chưa cấu hình Client ID —
 * tránh crash ở máy dev nào chưa tạo OAuth Client ID trên Google Cloud.
 *
 * Không tự gọi API bên trong — nhận `onCredential` để dùng lại được cho cả
 * đăng nhập (LoginForm/RegisterForm gọi loginWithGoogh + navigate) lẫn liên
 * kết tài khoản (SettingsPage gọi linkGoogleAccount), mỗi nơi tự quyết định
 * làm gì với credential trả về.
 */
const GoogleSignInButton = ({ onCredential, onError, text = 'continue_with' }) => {
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!CLIENT_ID || !buttonRef.current) return;

    const handleCredentialResponse = async (response) => {
      try {
        await onCredential(response.credential);
      } catch (err) {
        onError?.(
          err.response?.data?.message ||
            'Xác thực Google thất bại. Vui lòng thử lại.'
        );
      }
    };

    let cancelled = false;
    let resizeObserver;

    // Google chỉ nhận width là số px cố định, không nhận "100%" — phải tự đo
    // chiều rộng thật của khung chứa (auth-card co giãn theo breakpoint) rồi
    // vẽ lại nút mỗi khi kích thước đổi, tránh nút tràn ra ngoài khung.
    const renderButton = () => {
      if (!buttonRef.current) return;
      const width = Math.min(buttonRef.current.clientWidth, GIS_MAX_WIDTH);
      if (width <= 0) return;
      buttonRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        width,
        text,
        locale: 'vi',
        // Google chỉ cho chọn 1 trong vài shape cố định (rectangular/pill/
        // circle/square), không tự set số px bo góc tuỳ ý được — cả 2 lựa
        // chọn thử đều lệch với input/nút chính (10px). Dùng 'rectangular'
        // (mặc định, bo góc nhỏ nhất) làm nền, rồi crop đúng 10px bằng CSS
        // overflow:hidden ở khung chứa thay vì phụ thuộc option của Google.
        shape: 'rectangular',
      });
    };

    // Script trong index.html có async/defer nên có thể chưa sẵn sàng ngay
    // khi component mount — chờ tới khi window.google xuất hiện.
    const tryInit = () => {
      if (cancelled) return;
      if (!window.google?.accounts?.id) {
        setTimeout(tryInit, 100);
        return;
      }

      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: handleCredentialResponse,
      });

      renderButton();

      resizeObserver = new ResizeObserver(renderButton);
      resizeObserver.observe(buttonRef.current);
    };

    tryInit();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!CLIENT_ID) return null;

  return <div ref={buttonRef} className="google-signin-button" />;
};

export default GoogleSignInButton;
