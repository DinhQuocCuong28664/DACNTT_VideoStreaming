import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { MdErrorOutline } from 'react-icons/md';
import { videos } from '../../api/endpoints';
import { errorText, isApiError } from '../../lib/errors';
import './AppealBox.css';

const MIN_MESSAGE = 10;
const MAX_MESSAGE = 500;

/** The owner's appeal of a removed or held video: its status, or a form to file one. */
export default function AppealBox({ videoId }: { videoId: string }) {
  const { t } = useTranslation();
  const [appeal, setAppeal] = useState<{ status: string; resolution: string | null } | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    videos.appealStatus(videoId).then((r) => { if (live) setAppeal(r.appeal); }).catch(() => { if (live) setAppeal(null); });
    return () => { live = false; };
  }, [videoId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const r = await videos.appeal(videoId, message.trim());
      setAppeal({ status: r.appeal.status, resolution: null });
      setOpen(false);
      setMessage('');
    } catch (err) {
      setError(isApiError(err, 'APPEAL_OPEN') ? t('appeal.alreadyFiled') : errorText(t, err));
    } finally {
      setSending(false);
    }
  };

  if (appeal === undefined) return null;
  const canAppeal = !appeal || appeal.status !== 'open';
  return (
    <div className="appeal-box">
      {appeal && (
        <p className={`appeal-status is-${appeal.status}`}>
          {t(`appeal.status.${appeal.status}`)}
          {appeal.resolution && <span className="appeal-reply"> {t('appeal.reply', { note: appeal.resolution })}</span>}
        </p>
      )}
      {canAppeal && !open && <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>{t('appeal.start')}</button>}
      {open && (
        <form onSubmit={(e) => void submit(e)} className="appeal-form">
          <label className="studio-field">
            <span className="studio-field-label"><span>{t('appeal.label')}</span><span className="studio-field-counter">{message.length}/{MAX_MESSAGE}</span></span>
            <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} minLength={MIN_MESSAGE} maxLength={MAX_MESSAGE} placeholder={t('appeal.placeholder')} disabled={sending} required />
          </label>
          {error && <p className="field-error" role="alert"><MdErrorOutline aria-hidden="true" /> {error}</p>}
          <div className="appeal-actions">
            <button type="button" className="btn btn-plain" onClick={() => setOpen(false)} disabled={sending}>{t('common.cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={sending || message.trim().length < MIN_MESSAGE}>
              {sending && <span className="spinner spinner-sm" aria-hidden="true" />}<span>{t('appeal.send')}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
