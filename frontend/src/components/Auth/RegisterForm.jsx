import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/useAuth';
import useAuthRedirect from '../../hooks/useAuthRedirect';
import GoogleSignInButton from './GoogleSignInButton';
import LogoIcon from '../Layout/LogoIcon';
import './AuthForm.css';

const RegisterForm = () => {
  const { t } = useTranslation();
  const { register, loginWithGoogle } = useAuth();
  const goAfterAuth = useAuthRedirect();
  const location = useLocation();
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
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

    if (formData.password !== formData.confirmPassword) {
      setError(t('auth.passwordMismatch'));
      setLoading(false);
      return;
    }

    try {
      await register(formData.username, formData.email, formData.password);
      goAfterAuth();
    } catch (err) {
      setError(
        err.response?.data?.message || t('auth.registerFailed')
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
        <h1 className="auth-title">{t('auth.registerTitle')}</h1>
        <p className="auth-subtitle">{t('auth.registerSubtitle')}</p>

        {error && <div className="auth-error">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="label" htmlFor="username">{t('auth.usernameLabel')}</label>
            <input
              id="username"
              name="username"
              type="text"
              className="input"
              placeholder="username"
              value={formData.username}
              onChange={handleChange}
              required
              minLength={3}
            />
          </div>

          <div className="form-group">
            <label className="label" htmlFor="reg-email">Email</label>
            <input
              id="reg-email"
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
            <label className="label" htmlFor="reg-password">{t('auth.passwordLabel')}</label>
            <input
              id="reg-password"
              name="password"
              type="password"
              className="input"
              placeholder={t('auth.passwordHint')}
              value={formData.password}
              onChange={handleChange}
              required
              minLength={6}
            />
          </div>

          <div className="form-group">
            <label className="label" htmlFor="confirmPassword">{t('auth.confirmPasswordLabel')}</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              className="input"
              placeholder={t('auth.confirmPasswordPlaceholder')}
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              minLength={6}
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? t('auth.registerSubmitting') : t('auth.registerSubmit')}
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
          {t('auth.haveAccount')} <Link to="/login" state={location.state}>{t('auth.loginLink')}</Link>
        </p>
      </div>
    </div>
  );
};

export default RegisterForm;
