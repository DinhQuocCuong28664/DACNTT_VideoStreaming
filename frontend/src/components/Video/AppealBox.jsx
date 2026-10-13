import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MdErrorOutline } from 'react-icons/md';
import videoApi from '../../api/videoApi';
import './AppealBox.css';

const MAX_MESSAGE = 500;

/**
 * Khiếu nại của chủ video với video bị gỡ.
 *
 * Santa Clara Principles: người bị gỡ nội dung phải biết có thể khiếu nại và được một người thật xét
 * lại. Mỗi quyết định khiếu nại được một lần; nếu lần trước đã bị bác thì gửi lại cùng quyết định sẽ
 * nhận 409, và hộp này nói rõ điều đó thay vì để người dùng gửi mãi.
 */
const AppealBox = ({ videoId }) => {
  const { t } = useTranslation();
  const [appeal, setAppeal] = useState(undefined); // undefined: đang nạp, null: chưa có
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    videoApi
      .getOwnAppeal(videoId)
      .then((res) => !cancelled && setAppeal(res.data.data.appeal))
      .catch(() => !cancelled && setAppeal(null));
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const res = await videoApi.createAppeal(videoId, message.trim());
      setAppeal(res.data.data.appeal);
      setOpen(false);
      setMessage('');
    } catch (err) {
      const already = err.response?.data?.errorCode === 'APPEAL_ALREADY_FILED';
      setError(already ? t('appeal.alreadyFiled') : err.response?.data?.message || err.message);
    } finally {
      setSending(false);
    }
  };

  if (appeal === undefined) return null;

  const status = appeal?.status;
  const canAppeal = !appeal || status !== 'open';

  return (
    <div className="appeal-box">
      {appeal && (
        <p className={`appeal-status is-${status}`}>
          {t(`appeal.status.${status}`)}
          {appeal.resolutionNote && <span className="appeal-reply"> {t('appeal.reply', { note: appeal.resolutionNote })}</span>}
        </p>
      )}

      {canAppeal && !open && (
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
          {t('appeal.start')}
        </button>
      )}

      {open && (
        <form onSubmit={handleSubmit} className="appeal-form">
          <label className="studio-field">
            <span className="studio-field-label">
              <span>{t('appeal.label')}</span>
              <span className="studio-field-counter">{message.length}/{MAX_MESSAGE}</span>
            </span>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={MAX_MESSAGE}
              placeholder={t('appeal.placeholder')}
              disabled={sending}
              required
            />
          </label>
          {error && (
            <p className="field-error" role="alert">
              <MdErrorOutline aria-hidden="true" /> {error}
            </p>
          )}
          <div className="appeal-actions">
            <button type="button" className="btn btn-plain" onClick={() => setOpen(false)} disabled={sending}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={sending || !message.trim()}>
              {sending && <span className="spinner spinner-sm" aria-hidden="true" />}
              <span>{t('appeal.send')}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default AppealBox;
