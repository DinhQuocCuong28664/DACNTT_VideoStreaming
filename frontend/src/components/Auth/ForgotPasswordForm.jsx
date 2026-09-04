import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import authApi from '../../api/authApi';
import LogoIcon from '../Layout/LogoIcon';
import './AuthForm.css';

const ForgotPasswordForm = () => {
  const { t } = useTranslation();
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
      setError(
        err.response?.data?.message || t('auth.forgotFailed')
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
        <h1 className="auth-title">{t('auth.forgotTitle')}</h1>
        <p className="auth-subtitle">
          {t('auth.forgotSubtitle')}
        </p>

        {error && <div className="auth-error">{error}</div>}

        {sent ? (
          <div className="auth-error" style={{ background: 'rgba(0, 206, 201, 0.1)', borderColor: 'rgba(0, 206, 201, 0.25)', color: 'var(--text-primary)' }}>
            <Trans i18nKey="auth.forgotSent" values={{ email }} components={{ 1: <strong /> }} />
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                className="input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? t('auth.forgotSubmitting') : t('auth.forgotSubmit')}
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

export default ForgotPasswordForm;
