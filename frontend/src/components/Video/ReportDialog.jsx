import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MdClose, MdErrorOutline } from 'react-icons/md';
import Modal from '../Common/Modal';
import videoApi from '../../api/videoApi';
import './ReportDialog.css';

/** Khớp với REPORT_REASONS ở backend (src/utils/moderation.js). */
const REASONS = ['sexual', 'violent', 'hateful', 'harassment', 'dangerous', 'child_abuse', 'spam', 'other'];
const DETAILS_MAX = 500;

/**
 * Hộp thoại báo cáo video kiểu YouTube: chọn một lý do, thêm mô tả nếu muốn.
 * Gửi xong thì đóng và để trang gọi hiện thông báo; lỗi hiện ngay trong hộp.
 */
const ReportDialog = ({ videoId, onClose, onReported }) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason) return;
    setSending(true);
    setError('');
    try {
      const res = await videoApi.reportVideo(videoId, reason, details.trim());
      onReported(Boolean(res.data?.data?.alreadyReported));
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      setSending(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="report-dialog-title" busy={sending} className="report-modal">
      <form className="dialog" onSubmit={handleSubmit}>
        <div className="dialog-header">
          <h2 id="report-dialog-title" className="dialog-title">{t('report.title')}</h2>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            disabled={sending}
            aria-label={t('common.close')}
          >
            <MdClose />
          </button>
        </div>

        <div className="dialog-body report-body">
          {error && (
            <p className="field-error report-error" role="alert">
              <MdErrorOutline aria-hidden="true" /> {t('report.failed', { message: error })}
            </p>
          )}

          <fieldset className="report-reasons" disabled={sending}>
            <legend className="radio-group-title">{t('report.question')}</legend>
            <div className="radio-group">
              {REASONS.map((key) => (
                <label key={key} className="radio-row">
                  <input
                    type="radio"
                    name="report-reason"
                    value={key}
                    checked={reason === key}
                    onChange={() => setReason(key)}
                    required
                  />
                  <span className="radio-row-label">{t(`report.reasons.${key}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="studio-field">
            <span className="studio-field-label">
              <span>{t('report.detailsLabel')}</span>
              <span className="studio-field-counter">{details.length}/{DETAILS_MAX}</span>
            </span>
            <textarea
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={DETAILS_MAX}
              placeholder={t('report.detailsPlaceholder')}
              disabled={sending}
            />
          </label>

          <p className="field-help">{t('report.hint')}</p>
        </div>

        <div className="dialog-footer">
          <button type="button" className="btn btn-plain" onClick={onClose} disabled={sending}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={sending || !reason}>
            {sending && <span className="spinner spinner-sm" aria-hidden="true" />}
            <span>{sending ? t('report.submitting') : t('report.submit')}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default ReportDialog;
