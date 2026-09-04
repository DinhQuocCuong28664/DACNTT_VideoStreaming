import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import authApi from '../../api/authApi';
import LogoIcon from '../Layout/LogoIcon';
import './AuthForm.css';

const ResetPasswordForm = () => {
  const { t } = useTranslation();
  const { token } = useParams();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      await authApi.resetPassword(token, formData.password);
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(
        err.response?.data?.message || t('auth.resetFailed')
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
        <h1 className="auth-title">{t('auth.resetTitle')}</h1>
        <p className="auth-subtitle">{t('auth.resetSubtitle')}</p>

        {error && <div className="auth-error">{error}</div>}

        {done ? (
          <div className="auth-error" style={{ background: 'rgba(0, 206, 201, 0.1)', borderColor: 'rgba(0, 206, 201, 0.25)', color: 'var(--text-primary)' }}>
            {t('auth.resetDone')}
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="label" htmlFor="password">{t('auth.newPasswordLabel')}</label>
              <input
                id="password"
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
              <label className="label" htmlFor="confirmPassword">{t('auth.confirmNewPasswordLabel')}</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                className="input"
                placeholder={t('auth.confirmNewPasswordPlaceholder')}
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                minLength={6}
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? t('auth.resetSubmitting') : t('auth.resetSubmit')}
            </button>
          </form>
        )}

        <p className="auth-footer">
          <Link to="/login">← {t('auth.backToLogin')}</Link>
        </p>
      </div>
    </div>
  );
};

export default ResetPasswordForm;
