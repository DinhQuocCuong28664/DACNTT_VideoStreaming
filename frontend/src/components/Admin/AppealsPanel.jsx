import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdBlock, MdErrorOutline, MdOutlineVerifiedUser } from 'react-icons/md';
import adminApi from '../../api/adminApi';
import useInfiniteList from '../../hooks/useInfiniteList';
import useToast from '../Common/Toast';
import { LoadMoreFooter } from '../Video/VideoListParts';
import { timeAgo } from '../../utils/format';
import GuardedThumb from './GuardedThumb';

const nameOf = (user) => user?.displayName || user?.username || '?';

const AppealItem = ({ appeal, onResolved }) => {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const video = appeal.video || {};
  const labels = (video.moderation?.labels || []).slice(0, 3);

  const resolve = async (decision) => {
    setBusy(true);
    setError('');
    try {
      await adminApi.resolveAppeal(appeal._id, decision, note.trim());
      onResolved(appeal, decision);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      setBusy(false);
    }
  };

  return (
    <li className="admin-item">
      <GuardedThumb src={video.thumbnailUrl} duration={video.duration} />

      <div className="admin-item-body">
        <h2 className="admin-item-title">
          <Link to={`/watch/${video._id}`} target="_blank" rel="noopener noreferrer">
            {video.title || '—'}
          </Link>
        </h2>
        <p className="admin-muted">
          {t('admin.appeals.from', { name: nameOf(appeal.owner) })} · @{appeal.owner?.username} · {timeAgo(t, appeal.createdAt)}
          {appeal.owner?.email ? ` · ${appeal.owner.email}` : ''}
        </p>

        <div className="admin-chips">
          <span className="admin-chip is-danger">
            <MdBlock aria-hidden="true" />
            {appeal.decisionSource === 'auto' ? t('admin.blockedAuto') : t('admin.appeals.blockedByStaff')}
          </span>
        </div>

        {labels.length > 0 && (
          <div className="admin-labels">
            <span className="admin-labels-title">{t('admin.detected')}</span>
            {labels.map((l) => (
              <span key={l.name} className={`admin-label${l.action === 'block' ? ' is-block' : ''}`}>
                {l.name} <strong className="tabular-nums">{l.confidence}%</strong>
              </span>
            ))}
          </div>
        )}

        <blockquote className="admin-quote">{appeal.message}</blockquote>

        <label className="studio-field">
          <span className="studio-field-label">
            <span>{t('admin.appeals.noteLabel')}</span>
            <span className="studio-field-counter">{note.length}/500</span>
          </span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} disabled={busy} />
        </label>
        {error && (
          <p className="field-error" role="alert">
            <MdErrorOutline aria-hidden="true" /> {t('admin.decideFailed', { message: error })}
          </p>
        )}
      </div>

      <div className="admin-item-actions">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => resolve('uphold')}>
          <MdOutlineVerifiedUser />
          <span>{t('admin.appeals.uphold')}</span>
        </button>
        <button type="button" className="btn admin-btn-danger" disabled={busy} onClick={() => resolve('reject')}>
          <MdBlock />
          <span>{t('admin.appeals.reject')}</span>
        </button>
      </div>
    </li>
  );
};

/** Hàng khiếu nại chờ xét, cũ nhất trước. */
const AppealsPanel = ({ onChanged }) => {
  const { t } = useTranslation();
  const [toast, showToast] = useToast();

  const fetchPage = useCallback(async (page) => {
    const res = await adminApi.getAppeals('open', page, 20);
    const { appeals, pagination } = res.data.data;
    return { items: appeals, pages: pagination?.pages, total: pagination?.total };
  }, []);
  const list = useInfiniteList(fetchPage);
  const { items, setItems } = list;

  const handleResolved = (appeal, decision) => {
    setItems((prev) => prev.filter((a) => a._id !== appeal._id));
    showToast(t(decision === 'uphold' ? 'admin.appeals.upheldToast' : 'admin.appeals.rejectedToast', { title: appeal.video?.title }));
    onChanged?.();
  };

  if (list.status === 'loading') {
    return <div className="flex-center admin-loading"><div className="spinner" /></div>;
  }
  if (list.status === 'error' && items.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-state-title">{t('admin.loadFailed')}</p>
        <button type="button" className="btn btn-secondary" onClick={list.retry}>{t('home.retry')}</button>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="empty-state">
        <MdOutlineVerifiedUser className="empty-state-icon" aria-hidden="true" />
        <p className="empty-state-title">{t('admin.appeals.empty')}</p>
      </div>
    );
  }

  return (
    <>
      <ul className="admin-queue">
        {items.map((appeal) => (
          <AppealItem key={appeal._id} appeal={appeal} onResolved={handleResolved} />
        ))}
      </ul>
      <LoadMoreFooter list={list} />
      {toast}
    </>
  );
};

export default AppealsPanel;
