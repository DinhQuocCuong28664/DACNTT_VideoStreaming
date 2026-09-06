import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/useAuth';
import useAuthRedirect from '../../hooks/useAuthRedirect';
import GoogleSignInButton from './GoogleSignInButton';
import LogoIcon from '../Layout/LogoIcon';
import './AuthForm.css';

const LoginForm = () => {
  const { t } = useTranslation();
  const { login, loginWithGoogle } = useAuth();
  const goAfterAuth = useAuthRedirect();
  const location = useLocation();
  const [formData, setFormData] = useState({ email: '', password: '' });
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
      setError(
        err.response?.data?.message || t('auth.loginFailed')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo-icon"><LogoIcon /></div>
          <span className="logo-text">VidShare</span>
        </div>
        <h1 className="auth-title">{t('auth.loginTitle')}</h1>
        <p className="auth-subtitle">{t('auth.loginSubtitle')}</p>

        {error && <div className="auth-error">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              className="input"
              placeholder="you@example.com"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label className="label" htmlFor="password">{t('auth.passwordLabel')}</label>
            <input
              id="password"
              name="password"
              type="password"
              className="input"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              required
              minLength={6}
            />
            <Link to="/forgot-password" state={location.state} style={{ alignSelf: 'flex-end', fontSize: 'var(--font-size-xs)', color: 'var(--accent-primary)', marginTop: 4 }}>
              {t('auth.forgotPassword')}
            </Link>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? t('auth.loginSubmitting') : t('auth.loginSubmit')}
          </button>
        </form>

        <div className="auth-divider"><span>{t('auth.or')}</span></div>
        <GoogleSignInButton
          onCredential={async (credential) => {
            await loginWithGoogle(credential);
            goAfterAuth();
          }}
          onError={setError}
        />

        <p className="auth-footer">
          {t('auth.noAccount')} <Link to="/register" state={location.state}>{t('auth.registerNow')}</Link>
        </p>
      </div>
    </div>
  );
};

export default LoginForm;
