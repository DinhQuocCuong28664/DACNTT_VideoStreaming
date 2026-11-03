import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import './ConfirmDialog.css';

/**
 * Native <dialog> shown modal: focus trap, Esc and the backdrop close it (unless busy), and
 * focus returns to the opener.
 */
export function Modal({ onClose, labelledBy, describedBy, className = '', busy = false, children }: {
  onClose: () => void; labelledBy: string; describedBy?: string; className?: string; busy?: boolean; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement as HTMLElement | null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}
      onClick={(e) => { if (e.target === ref.current && !busy) onClose(); }}
    >
      {children}
    </dialog>
  );
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onClose, danger = false }: {
  title: string; message: string; confirmLabel: string; onConfirm: () => Promise<void> | void; onClose: () => void; danger?: boolean;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const confirm = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { if (mounted.current) setBusy(false); }
  };
  return (
    <Modal onClose={onClose} labelledBy="confirm-dialog-title" describedBy="confirm-dialog-message" busy={busy} className="confirm-modal">
      <div className="dialog confirm-dialog">
        <h2 id="confirm-dialog-title" className="confirm-dialog-title">{title}</h2>
        <p id="confirm-dialog-message" className="confirm-dialog-message">{message}</p>
        <div className="confirm-dialog-actions">
          <button type="button" className="btn btn-plain" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => void confirm()} disabled={busy}>
            {busy && <span className="spinner spinner-sm" aria-hidden="true" />}<span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
