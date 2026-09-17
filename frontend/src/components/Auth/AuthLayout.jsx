import { useTranslation } from 'react-i18next';
import { FiCheck } from 'react-icons/fi';
import './AuthForm.css';

/**
 * Khung dùng chung cho bốn trang xác thực (đăng nhập, đăng ký, quên mật khẩu,
 * đặt lại mật khẩu).
 *
 * Trước đây mỗi biểu mẫu tự dựng lại đúng khung `auth-page > auth-card`, nên
 * muốn đổi bố cục là phải sửa bốn nơi giống hệt nhau. Giờ biểu mẫu chỉ lo nội
 * dung của thẻ, còn bố cục trang nằm ở đây.
 *
 * Bố cục bất đối xứng: một panel đảo màu bên trái giới thiệu nền tảng, biểu
 * mẫu bên phải. Panel chỉ là trình bày — không có liên kết hay nút nào — và
 * được ẩn trên màn hình hẹp để biểu mẫu chiếm trọn chỗ.
 */
const AuthLayout = ({ children }) => {
  const { t } = useTranslation();
  const points = ['auth.asidePoint1', 'auth.asidePoint2', 'auth.asidePoint3'];

  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <div className="texture-dots" aria-hidden="true" />
        <div className="glow auth-aside-glow" aria-hidden="true" />
        <div className="auth-aside-ring" aria-hidden="true" />

        <div className="auth-aside-content">
          <span className="section-label on-inverted is-live">{t('auth.asideLabel')}</span>

          <h2 className="auth-aside-title display-heading">
            {t('landing.heroTitlePrefix')}{' '}
            <span className="auth-aside-accent">{t('landing.heroTitleAccent')}</span>
          </h2>

          <ul className="auth-aside-points">
            {points.map((key) => (
              <li key={key}>
                <span className="auth-aside-check" aria-hidden="true">
                  <FiCheck />
                </span>
                {t(key)}
              </li>
            ))}
          </ul>
        </div>

        {/* Hai thẻ nổi nhỏ: thuật ngữ kỹ thuật giữ nguyên tiếng Anh như ở trang
            giới thiệu, chỉ để minh hoạ nên ẩn khỏi trình đọc màn hình. */}
        <div className="auth-float auth-float-a" aria-hidden="true">
          <span className="auth-float-dot" />
          HLS · 1080p
        </div>
        <div className="auth-float auth-float-b" aria-hidden="true">
          master.m3u8 · READY
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">{children}</div>
      </main>
    </div>
  );
};

export default AuthLayout;
