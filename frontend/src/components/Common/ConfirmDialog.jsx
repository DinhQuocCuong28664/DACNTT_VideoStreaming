import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import './ConfirmDialog.css';

/**
 * Small yes/no dialog that replaces `window.confirm`, built on the shared Modal
 * so it looks like the rest of the app and keeps its focus handling.
 *
 * `onConfirm` may return a promise: the buttons stay disabled and Esc does
 * nothing until it settles, so the action cannot be sent twice or dismissed
 * half way. The parent closes the dialog (unmounts it) when it is done; if it
 * keeps the dialog open, for example to retry, the buttons become usable again.
 *
 * Focus lands on Cancel first (the first button in the footer), so pressing
 * Enter by habit never deletes anything.
 */
const ConfirmDialog = ({ title, message, confirmLabel, onConfirm, onClose, danger = false }) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      labelledBy="confirm-dialog-title"
      describedBy="confirm-dialog-message"
      busy={busy}
      className="confirm-modal"
    >
      <div className="dialog confirm-dialog">
        <h2 id="confirm-dialog-title" className="confirm-dialog-title">
          {title}
        </h2>
        <p id="confirm-dialog-message" className="confirm-dialog-message">
          {message}
        </p>
        <div className="confirm-dialog-actions">
          <button type="button" className="btn btn-plain" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy && <span className="spinner spinner-sm" aria-hidden="true" />}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmDialog;
