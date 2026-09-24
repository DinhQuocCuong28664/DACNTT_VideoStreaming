import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MdCheckCircleOutline } from 'react-icons/md';
import authApi from '../../api/authApi';
import AuthLayout, { AuthField, AuthError } from './AuthLayout';

const ResetPasswordForm = () => {
  const { t } = useTranslation();
  const { token } = useParams();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
    setMismatch(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      setMismatch(true);
      return;
    }

    setLoading(true);
    setError('');

    try {
      await authApi.resetPassword(token, formData.password);
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(err.response?.data?.message || t('auth.resetFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title={t('auth.resetTitle')} subtitle={t('auth.resetSubtitle')}>
      {done ? (
        <div className="auth-form">
          <div className="auth-state">
            <MdCheckCircleOutline className="auth-state-icon is-success" aria-hidden="true" />
            <p className="auth-state-title">{t('auth.resetDone')}</p>
          </div>
          <div className="auth-actions">
            <Link to="/login" className="btn btn-primary">
              {t('auth.backToLogin')}
            </Link>
          </div>
        </div>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit}>
          <AuthError>{error}</AuthError>
          <AuthField
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            label={t('auth.newPasswordLabel')}
            help={t('auth.passwordHint')}
            autoComplete="new-password"
            value={formData.password}
            onChange={handleChange}
            required
            minLength={6}
            autoFocus
          />
          <AuthField
            id="confirmPassword"
            name="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            label={t('auth.confirmNewPasswordLabel')}
            autoComplete="new-password"
            value={formData.confirmPassword}
            onChange={handleChange}
            error={mismatch ? t('auth.passwordMismatch') : ''}
            required
            minLength={6}
          />
          <label className="auth-check">
            <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
            {t('auth.showPassword')}
          </label>
          <div className="auth-actions">
            <Link to="/login" className="btn btn-ghost">
              {t('auth.backToLogin')}
            </Link>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? t('auth.resetSubmitting') : t('auth.resetSubmit')}
            </button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
};

export default ResetPasswordForm;
