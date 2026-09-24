import { useTranslation } from 'react-i18next';
import { MdErrorOutline } from 'react-icons/md';
import LogoIcon from '../Layout/LogoIcon';
import './AuthForm.css';

/**
 * Khung dùng chung cho bốn trang xác thực (đăng nhập, đăng ký, quên mật khẩu,
 * đặt lại mật khẩu), theo kiểu trang đăng nhập tài khoản Google: một thẻ lớn
 * ở giữa, nửa trái là logo, tiêu đề và một dòng phụ, nửa phải là biểu mẫu.
 * Dưới thẻ là hàng chọn ngôn ngữ. Trên màn hẹp hai nửa xếp chồng.
 */
const AuthLayout = ({ title, subtitle, children }) => {
  const { t, i18n } = useTranslation();

  return (
    <div className="auth-page">
      <main className="auth-card">
        <div className="auth-card-intro">
          <span className="auth-logo" aria-hidden="true">
            <LogoIcon size={22} />
          </span>
          <h1 className="auth-title">{title}</h1>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
        </div>
        <div className="auth-card-body">{children}</div>
      </main>

      <footer className="auth-page-footer">
        <label className="auth-lang">
          <span className="visually-hidden">{t('language.label')}</span>
          <select value={i18n.resolvedLanguage} onChange={(e) => i18n.changeLanguage(e.target.value)}>
            <option value="vi">{t('language.vi')}</option>
            <option value="en">{t('language.en')}</option>
          </select>
        </label>
      </footer>
    </div>
  );
};

/** Ô nhập viền có nhãn nằm trong viền, kèm dòng gợi ý hoặc dòng lỗi bên dưới. */
export const AuthField = ({ label, help, error, id, ...inputProps }) => (
  <div className="auth-field">
    <label className={`studio-field ${error ? 'has-error' : ''}`} htmlFor={id}>
      <span className="studio-field-label">{label}</span>
      <input id={id} aria-invalid={Boolean(error)} {...inputProps} />
    </label>
    {error ? (
      <p className="field-error">
        <MdErrorOutline aria-hidden="true" /> {error}
      </p>
    ) : (
      help && <p className="field-help">{help}</p>
    )}
  </div>
);

/** Lỗi chung của biểu mẫu (sai mật khẩu, email đã tồn tại...) phía trên các ô. */
export const AuthError = ({ children }) =>
  children ? (
    <p className="auth-error" role="alert">
      <MdErrorOutline aria-hidden="true" />
      <span>{children}</span>
    </p>
  ) : null;

export default AuthLayout;
