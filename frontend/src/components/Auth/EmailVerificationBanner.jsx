import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { MdClose, MdOutlineMarkEmailUnread } from 'react-icons/md';
import { useAuth } from '../../context/useAuth';
import ResendVerificationButton from './ResendVerificationButton';
import './EmailVerification.css';

const DISMISS_KEY = 'verifyBannerDismissed';

// sessionStorage có thể bị chặn (chế độ riêng tư, cookie bị tắt); khi đó thanh
// nhắc chỉ ẩn được đến lần tải trang kế tiếp.
const readDismissed = () => {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * Thanh nhắc xác minh email cho tài khoản chưa xác minh.
 *
 * Không có nó, người vừa đăng ký chỉ biết phải xác minh khi bị chặn ở trang tải
 * lên. Ẩn trên chính trang tải lên (trang đó có lời nhắc riêng, đầy đủ hơn), và
 * người dùng tắt được trong phiên hiện tại.
 */
const EmailVerificationBanner = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();
  const [dismissed, setDismissed] = useState(readDismissed);

  if (!user || user.emailVerified !== false || dismissed || location.pathname === '/upload') {
    return null;
  }

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // xem readDismissed
    }
  };

  return (
    <div className="verify-banner" role="region" aria-label={t('verify.title')}>
      <MdOutlineMarkEmailUnread className="verify-banner-icon" aria-hidden="true" />
      <p className="verify-banner-text">
        <Trans i18nKey="verify.bannerText" values={{ email: user.email }} components={{ 1: <strong /> }} />
      </p>
      <div className="verify-banner-actions">
        <ResendVerificationButton className="btn btn-ghost" />
        <button type="button" className="btn-icon" onClick={dismiss} aria-label={t('verify.dismiss')} title={t('verify.dismiss')}>
          <MdClose />
        </button>
      </div>
    </div>
  );
};

export default EmailVerificationBanner;
