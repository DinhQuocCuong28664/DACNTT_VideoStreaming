import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MdCheckCircle, MdErrorOutline } from 'react-icons/md';
import authApi from '../../api/authApi';
import { useAuth } from '../../context/useAuth';
import './EmailVerification.css';

/**
 * Nút "Gửi lại email xác minh" kèm dòng trạng thái, dùng chung cho thanh nhắc
 * xác minh, trang tải lên, trang Cài đặt và trang mở liên kết hết hạn.
 *
 * Máy chủ giới hạn 5 thư mỗi giờ cho mỗi tài khoản; thông điệp 429 của nó hiện
 * thẳng ra đây. Nếu máy chủ báo email đã xác minh (tab khác vừa xác minh xong)
 * thì tải lại hồ sơ để mọi lời nhắc tự biến mất.
 */
const ResendVerificationButton = ({ className = 'btn btn-secondary' }) => {
  const { t } = useTranslation();
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [message, setMessage] = useState('');

  const send = async () => {
    setStatus('sending');
    setMessage('');
    try {
      const res = await authApi.resendVerification();
      setStatus('sent');
      setMessage(res.data?.message || '');
    } catch (err) {
      if (err.response?.data?.code === 'ALREADY_VERIFIED') {
        refreshUser().catch(() => {});
      }
      setStatus('error');
      setMessage(err.response?.data?.message || t('verify.resendFailed'));
    }
  };

  return (
    <div className="resend-verification">
      <button type="button" className={className} onClick={send} disabled={status === 'sending'}>
        {status === 'sending' ? t('verify.resending') : t('verify.resend')}
      </button>
      {status === 'sent' && (
        <p className="resend-verification-status is-success" role="status">
          <MdCheckCircle aria-hidden="true" /> {message}
        </p>
      )}
      {status === 'error' && (
        <p className="resend-verification-status is-error" role="alert">
          <MdErrorOutline aria-hidden="true" /> {message}
        </p>
      )}
    </div>
  );
};

export default ResendVerificationButton;
