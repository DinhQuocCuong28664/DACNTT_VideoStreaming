import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/useAuth';
import useAuthRedirect from '../../hooks/useAuthRedirect';
import GoogleSignInButton from './GoogleSignInButton';
import AuthLayout, { AuthField, AuthError } from './AuthLayout';

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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
    setMismatch(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setMismatch(true);
      return;
    }

    setLoading(true);
    try {
      await register(formData.username, formData.email, formData.password);
      goAfterAuth();
    } catch (err) {
      setError(err.response?.data?.message || t('auth.registerFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title={t('auth.registerTitle')} subtitle={t('auth.registerSubtitle')}>
      <form className="auth-form" onSubmit={handleSubmit}>
        <AuthError>{error}</AuthError>

        <AuthField
          id="username"
          name="username"
          type="text"
          label={t('auth.usernameLabel')}
          help={t('auth.usernameHelp')}
          autoComplete="username"
          value={formData.username}
          onChange={handleChange}
          required
          minLength={3}
          autoFocus
        />

        <AuthField
          id="reg-email"
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          value={formData.email}
          onChange={handleChange}
          required
        />

        <div className="auth-field-pair">
          <AuthField
            id="reg-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            label={t('auth.passwordLabel')}
            autoComplete="new-password"
            value={formData.password}
            onChange={handleChange}
            required
            minLength={6}
          />
          <AuthField
            id="confirmPassword"
            name="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            label={t('auth.confirmPasswordLabel')}
            autoComplete="new-password"
            value={formData.confirmPassword}
            onChange={handleChange}
            error={mismatch ? t('auth.passwordMismatch') : ''}
            required
            minLength={6}
          />
        </div>
        <p className="field-help">{t('auth.passwordHint')}</p>

        <label className="auth-check">
          <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
          {t('auth.showPassword')}
        </label>

        <div className="auth-divider"><span>{t('auth.or')}</span></div>
        <GoogleSignInButton
          onCredential={async (credential) => {
            await loginWithGoogle(credential);
            goAfterAuth();
          }}
          onError={setError}
        />

        <div className="auth-actions">
          <Link to="/login" state={location.state} className="btn btn-ghost">
            {t('auth.signInInstead')}
          </Link>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? t('auth.registerSubmitting') : t('auth.registerSubmit')}
          </button>
        </div>
      </form>
    </AuthLayout>
  );
};

export default RegisterForm;
