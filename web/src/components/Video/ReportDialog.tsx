import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { MdClose, MdErrorOutline } from 'react-icons/md';
import { comments, videos } from '../../api/endpoints';
import { errorText } from '../../lib/errors';
import { Modal } from '../Common/Dialogs';
import './ReportDialog.css';

/** The closed reason list of the API; overlapping options make reports uncountable. */
export const REPORT_REASONS = ['sexual', 'violent', 'hateful', 'harassment', 'dangerous', 'child_abuse', 'spam', 'other'] as const;
const DETAILS_MAX = 500;

/** Report a video or a comment. `onReported(repeated)` tells whether it was already reported. */
export default function ReportDialog({ target, onClose, onReported }: {
  target: { kind: 'video' | 'comment'; id: string };
  onClose: () => void;
  onReported: (repeated: boolean) => void;
}) {
  const { t } = useTranslation();
  const forComment = target.kind === 'comment';
  const text = (key: string) => t(forComment ? `report.comment.${key}` : `report.${key}`);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reason) return;
    setSending(true);
    setError('');
    try {
      const r = forComment ? await comments.report(target.id, reason, details.trim()) : await videos.report(target.id, reason, details.trim());
      onReported(r.repeated);
    } catch (err) {
      setError(errorText(t, err));
      setSending(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="report-dialog-title" busy={sending} className="report-modal">
      <form className="dialog" onSubmit={(e) => void submit(e)}>
        <div className="dialog-header">
          <h2 id="report-dialog-title" className="dialog-title">{text('title')}</h2>
          <button type="button" className="btn-icon" onClick={onClose} disabled={sending} aria-label={t('common.close')}><MdClose /></button>
        </div>
        <div className="dialog-body report-body">
          {error && <p className="field-error report-error" role="alert"><MdErrorOutline aria-hidden="true" /> {t('report.failed', { message: error })}</p>}
          <fieldset className="report-reasons" disabled={sending}>
            <legend className="radio-group-title">{text('question')}</legend>
            <div className="radio-group">
              {REPORT_REASONS.map((key) => (
                <label key={key} className="radio-row">
                  <input type="radio" name="report-reason" value={key} checked={reason === key} onChange={() => setReason(key)} required />
                  <span className="radio-row-label">{t(`report.reasons.${key}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="studio-field">
            <span className="studio-field-label"><span>{t('report.detailsLabel')}</span><span className="studio-field-counter">{details.length}/{DETAILS_MAX}</span></span>
            <textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={DETAILS_MAX} placeholder={text('detailsPlaceholder')} disabled={sending} />
          </label>
          <p className="field-help">{text('hint')}</p>
        </div>
        <div className="dialog-footer">
          <button type="button" className="btn btn-plain" onClick={onClose} disabled={sending}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={sending || !reason}>
            {sending && <span className="spinner spinner-sm" aria-hidden="true" />}<span>{sending ? t('report.submitting') : t('report.submit')}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
