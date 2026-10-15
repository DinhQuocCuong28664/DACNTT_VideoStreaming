import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdCheckCircleOutline, MdErrorOutline } from 'react-icons/md';
import authApi from '../api/authApi';
import { useAuth } from '../context/useAuth';
import AuthLayout from '../components/Auth/AuthLayout';
import ResendVerificationButton from '../components/Auth/ResendVerificationButton';

/**
 * Mỗi token chỉ được gửi lên máy chủ một lần cho cả phiên trang.
 *
 * Máy chủ tiêu token ngay lần gọi đầu, nên lần gọi thứ hai luôn báo "liên kết
 * hết hạn". StrictMode chạy effect hai lần ở môi trường phát triển, và effect
 * cũng chạy lại khi đổi ngôn ngữ; cả hai phải dùng lại đúng kết quả lần đầu.
 */
const attempts = new Map();
const verifyOnce = (token) => {
  if (!attempts.has(token)) attempts.set(token, authApi.verifyEmail(token));
  return attempts.get(token);
};

/**
 * Trang mở từ liên kết trong email xác minh: /verify-email/:token.
 *
 * Không đặt trong GuestRoute: người đang đăng nhập (thường là chính chủ, mở
 * thư trên cùng máy) cũng phải vào được. Khi đó hồ sơ được tải lại để thanh
 * nhắc xác minh và lời nhắc ở trang tải lên biến mất ngay.
 */
const VerifyEmailPage = () => {
  const { t } = useTranslation();
  const { token } = useParams();
  const { user, isAuthenticated, refreshUser } = useAuth();
  const [status, setStatus] = useState('verifying'); // verifying | done | failed
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    verifyOnce(token)
      .then(async () => {
        if (isAuthenticated) await refreshUser().catch(() => {});
        if (active) setStatus('done');
      })
      .catch((err) => {
        if (!active) return;
        setStatus('failed');
        setMessage(err.response?.data?.message || t('verify.failed'));
      });
    return () => {
      active = false;
    };
  }, [token, isAuthenticated, refreshUser, t]);

  // Bấm lại một liên kết đã dùng: token không còn, nhưng email đã xác minh rồi.
  const alreadyVerified = status === 'failed' && user?.emailVerified === true;

  let body;
  if (status === 'verifying') {
    body = (
      <div className="auth-state">
        <div className="spinner" />
        <p className="auth-state-desc">{t('verify.verifying')}</p>
      </div>
    );
  } else if (status === 'done' || alreadyVerified) {
    body = (
      <>
        <div className="auth-state">
          <MdCheckCircleOutline className="auth-state-icon is-success" aria-hidden="true" />
          <p className="auth-state-title">{t('verify.doneTitle')}</p>
          <p className="auth-state-desc">{t('verify.doneDesc')}</p>
        </div>
        <div className="auth-actions">
          {isAuthenticated ? (
            <>
              <Link to="/" className="btn btn-ghost">
                {t('verify.goHome')}
              </Link>
              <Link to="/upload" className="btn btn-primary">
                {t('verify.goUpload')}
              </Link>
            </>
          ) : (
            <Link to="/login" state={{ from: '/upload' }} className="btn btn-primary">
              {t('auth.loginSubmit')}
            </Link>
          )}
        </div>
      </>
    );
  } else {
    body = (
      <>
        <div className="auth-state">
          <MdErrorOutline className="auth-state-icon" aria-hidden="true" />
          <p className="auth-state-title">{t('verify.failedTitle')}</p>
          <p className="auth-state-desc">{message}</p>
          <p className="auth-state-desc">{t('verify.failedHint')}</p>
        </div>
        <div className="auth-actions">
          {isAuthenticated ? (
            <ResendVerificationButton className="btn btn-primary" />
          ) : (
            <Link to="/login" className="btn btn-primary">
              {t('verify.signInToResend')}
            </Link>
          )}
        </div>
      </>
    );
  }

  return (
    <AuthLayout title={t('verify.title')} subtitle={t('verify.subtitle')}>
      <div className="auth-form" aria-live="polite">
        {body}
      </div>
    </AuthLayout>
  );
};

export default VerifyEmailPage;
