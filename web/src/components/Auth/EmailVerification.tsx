import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { MdCheckCircle, MdClose, MdErrorOutline, MdOutlineMarkEmailUnread } from 'react-icons/md';
import { auth } from '../../api/endpoints';
import { useAuth } from '../../context/auth';
import { errorText } from '../../lib/errors';
import './EmailVerification.css';

/** "Send the verification e-mail again" with its status line. The server limits resends. */
export function ResendVerificationButton({ className = 'btn btn-secondary' }: { className?: string }) {
  const { t } = useTranslation();
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const send = async () => {
    setStatus('sending');
    try {
      const res = await auth.resendVerification();
      // Another tab verified meanwhile: reload the profile so every reminder disappears.
      if (!res.sent) void refreshUser();
      setStatus('sent');
      setMessage(t('verify.resendSent'));
    } catch (err) {
      setStatus('error');
      setMessage(errorText(t, err));
    }
  };

  return (
    <div className="resend-verification">
      <button type="button" className={className} onClick={send} disabled={status === 'sending'}>
        {status === 'sending' ? t('verify.resending') : t('verify.resend')}
      </button>
      {status === 'sent' && <p className="resend-verification-status is-success" role="status"><MdCheckCircle aria-hidden="true" /> {message}</p>}
      {status === 'error' && <p className="resend-verification-status is-error" role="alert"><MdErrorOutline aria-hidden="true" /> {message}</p>}
    </div>
  );
}

const DISMISS_KEY = 'verifyBannerDismissed';
const readDismissed = () => {
  try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
};

/** Reminder for unverified accounts; hidden on the upload page, which has its own. */
export function EmailVerificationBanner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();
  const [dismissed, setDismissed] = useState(readDismissed);
  if (!user || user.emailVerified || dismissed || location.pathname === '/upload') return null;

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* hidden until the next load */ }
  };

  return (
    <div className="verify-banner" role="region" aria-label={t('verify.title')}>
      <MdOutlineMarkEmailUnread className="verify-banner-icon" aria-hidden="true" />
      <p className="verify-banner-text">
        <Trans i18nKey="verify.bannerText" values={{ email: user.email }} components={{ 1: <strong /> }} />
      </p>
      <div className="verify-banner-actions">
        <ResendVerificationButton className="btn btn-ghost" />
        <button type="button" className="btn-icon" onClick={dismiss} aria-label={t('verify.dismiss')} title={t('verify.dismiss')}><MdClose /></button>
      </div>
    </div>
  );
}
