import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { MdOutlineMarkEmailRead } from 'react-icons/md';
import authApi from '../../api/authApi';
import AuthLayout, { AuthField, AuthError } from './AuthLayout';

const ForgotPasswordForm = () => {
  const { t } = useTranslation();
  // Trang này đến từ trang đăng nhập nên trang đích vẫn còn trong state; giữ
  // lại để lúc quay về đăng nhập người dùng không mất chỗ họ định vào. Trang
  // đặt lại mật khẩu thì không giữ được, vì mở từ liên kết trong e-mail, tức
  // một ngữ cảnh trình duyệt mới không mang theo state nào.
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.message || t('auth.forgotFailed'));
    } finally {
      setLoading(false);
    }
  };

  const backLink = (
    <Link to="/login" state={location.state} className="btn btn-ghost">
      {t('auth.backToLogin')}
    </Link>
  );

  return (
    <AuthLayout title={t('auth.forgotTitle')} subtitle={t('auth.forgotSubtitle')}>
      {sent ? (
        <div className="auth-form">
          <div className="auth-state">
            <MdOutlineMarkEmailRead className="auth-state-icon" aria-hidden="true" />
            <p className="auth-state-title">{t('auth.checkInbox')}</p>
            <p className="auth-state-desc">
              <Trans i18nKey="auth.forgotSent" values={{ email }} components={{ 1: <strong /> }} />
            </p>
          </div>
          <div className="auth-actions">{backLink}</div>
        </div>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit}>
          <AuthError>{error}</AuthError>
          <AuthField
            id="email"
            name="email"
            type="email"
            label="Email"
            help={t('auth.forgotHelp')}
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <div className="auth-actions">
            {backLink}
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? t('auth.forgotSubmitting') : t('auth.forgotSubmit')}
            </button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
};

export default ForgotPasswordForm;
