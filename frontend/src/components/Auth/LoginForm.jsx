import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/useAuth';
import useAuthRedirect from '../../hooks/useAuthRedirect';
import GoogleSignInButton from './GoogleSignInButton';
import AuthLayout, { AuthField, AuthError } from './AuthLayout';

const LoginForm = () => {
  const { t } = useTranslation();
  const { login, loginWithGoogle } = useAuth();
  const goAfterAuth = useAuthRedirect();
  const location = useLocation();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await login(formData.email, formData.password);
      goAfterAuth();
    } catch (err) {
      setError(err.response?.data?.message || t('auth.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title={t('auth.loginTitle')} subtitle={t('auth.loginSubtitle')}>
      <form className="auth-form" onSubmit={handleSubmit}>
        <AuthError>{error}</AuthError>

        <AuthField
          id="email"
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          value={formData.email}
          onChange={handleChange}
          required
          autoFocus
        />

        <AuthField
          id="password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          label={t('auth.passwordLabel')}
          autoComplete="current-password"
          value={formData.password}
          onChange={handleChange}
          required
          minLength={6}
        />

        <div className="auth-row">
          <label className="auth-check">
            <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
            {t('auth.showPassword')}
          </label>
          <Link to="/forgot-password" state={location.state} className="auth-link">
            {t('auth.forgotPassword')}
          </Link>
        </div>

        <div className="auth-divider"><span>{t('auth.or')}</span></div>
        <GoogleSignInButton
          onCredential={async (credential) => {
            await loginWithGoogle(credential);
            goAfterAuth();
          }}
          onError={setError}
        />

        <div className="auth-actions">
          <Link to="/register" state={location.state} className="btn btn-ghost">
            {t('auth.createAccount')}
          </Link>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? t('auth.loginSubmitting') : t('auth.loginSubmit')}
          </button>
        </div>
      </form>
    </AuthLayout>
  );
};

export default LoginForm;
