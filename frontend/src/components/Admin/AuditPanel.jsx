import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdBlock, MdCheck, MdErrorOutline, MdOutlineVerifiedUser } from 'react-icons/md';
import adminApi from '../../api/adminApi';
import useInfiniteList from '../../hooks/useInfiniteList';
import useToast from '../Common/Toast';
import { LoadMoreFooter } from '../Video/VideoListParts';
import { useAuth } from '../../context/useAuth';
import { can } from '../../utils/roles';
import GuardedThumb from './GuardedThumb';

const nameOf = (user) => user?.displayName || user?.username || '?';

const SampleItem = ({ sample, onLabelled }) => {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const video = sample.video || {};

  const label = async (result) => {
    setBusy(true);
    setError('');
    try {
      await adminApi.labelAuditSample(sample._id, result, note.trim());
      onLabelled(sample, result);
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
          {t('admin.uploadedBy', { name: nameOf(video.user) })} · @{video.user?.username}
          {video.user?.email ? ` · ${video.user.email}` : ''}
        </p>
        <label className="studio-field">
          <span className="studio-field-label">
            <span>{t('admin.audit.noteLabel')}</span>
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
        <Link to={`/watch/${video._id}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
          <span>{t('admin.watch')}</span>
        </Link>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => label('pass')}>
          <MdCheck />
          <span>{t('admin.audit.pass')}</span>
        </button>
        <button type="button" className="btn admin-btn-danger" disabled={busy} onClick={() => label('fail')}>
          <MdBlock />
          <span>{t('admin.audit.fail')}</span>
        </button>
      </div>
    </li>
  );
};

/**
 * Kiểm tra mẫu ngẫu nhiên các video máy đã duyệt: cách duy nhất để ước lượng tỉ lệ false negative.
 * Chỉ admin lấy mẫu mới; operator gán nhãn các video đã được lấy.
 */
const AuditPanel = ({ onChanged }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [toast, showToast] = useToast();
  const [size, setSize] = useState(20);
  const [drawing, setDrawing] = useState(false);
  const [reload, setReload] = useState(0);

  const fetchPage = useCallback(
    async (page) => {
      void reload; // đổi `reload` để nạp lại hàng chờ sau khi lấy mẫu mới
      const res = await adminApi.getAuditSamples('pending', page, 20);
      const { samples, pagination } = res.data.data;
      return { items: samples, pages: pagination?.pages, total: pagination?.total };
    },
    [reload],
  );
  const list = useInfiniteList(fetchPage);
  const { items, setItems } = list;

  const handleDraw = async (e) => {
    e.preventDefault();
    setDrawing(true);
    try {
      const res = await adminApi.createAuditSample(Number(size));
      showToast(t('admin.audit.drawnToast', { count: res.data.data.drawn }));
      setReload((n) => n + 1);
      onChanged?.();
    } catch (err) {
      showToast(t('admin.decideFailed', { message: err.response?.data?.message || err.message }));
    } finally {
      setDrawing(false);
    }
  };

  const handleLabelled = (sample, result) => {
    setItems((prev) => prev.filter((s) => s._id !== sample._id));
    showToast(t(result === 'pass' ? 'admin.audit.passedToast' : 'admin.audit.failedToast', { title: sample.video?.title }));
    onChanged?.();
  };

  let body;
  if (list.status === 'loading') {
    body = <div className="flex-center admin-loading"><div className="spinner" /></div>;
  } else if (items.length === 0) {
    body = (
      <div className="empty-state">
        <MdOutlineVerifiedUser className="empty-state-icon" aria-hidden="true" />
        <p className="empty-state-title">{t('admin.audit.empty')}</p>
      </div>
    );
  } else {
    body = (
      <>
        <ul className="admin-queue">
          {items.map((sample) => (
            <SampleItem key={sample._id} sample={sample} onLabelled={handleLabelled} />
          ))}
        </ul>
        <LoadMoreFooter list={list} />
      </>
    );
  }

  return (
    <>
      <p className="admin-muted admin-intro">{t('admin.audit.intro')}</p>
      {can(user, 'moderation:sample') && (
        <form className="admin-inline-form" onSubmit={handleDraw}>
          <label>
            <span>{t('admin.audit.size')}</span>
            <input type="number" min={1} max={100} value={size} onChange={(e) => setSize(e.target.value)} disabled={drawing} />
          </label>
          <button type="submit" className="btn btn-secondary" disabled={drawing}>
            {drawing && <span className="spinner spinner-sm" aria-hidden="true" />}
            <span>{t('admin.audit.draw')}</span>
          </button>
        </form>
      )}
      {body}
      {toast}
    </>
  );
};

export default AuditPanel;
