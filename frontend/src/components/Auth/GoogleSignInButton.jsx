import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

/**
 * Nút "Đăng nhập bằng Google" dùng Google Identity Services (script được
 * nạp trong index.html). Không tự render gì nếu chưa cấu hình Client ID —
 * tránh crash ở máy dev nào chưa tạo OAuth Client ID trên Google Cloud.
 */
const GoogleSignInButton = ({ onError }) => {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!CLIENT_ID || !buttonRef.current) return;

    const handleCredentialResponse = async (response) => {
      try {
        await loginWithGoogle(response.credential);
        navigate('/');
      } catch (err) {
        onError?.(
          err.response?.data?.message ||
            'Đăng nhập Google thất bại. Vui lòng thử lại.'
        );
      }
    };

    let cancelled = false;

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

      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        width: 392,
        text: 'continue_with',
        locale: 'vi',
      });
    };

    tryInit();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!CLIENT_ID) return null;

  return <div ref={buttonRef} className="google-signin-button" />;
};

export default GoogleSignInButton;
