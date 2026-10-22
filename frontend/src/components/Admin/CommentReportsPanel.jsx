import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdCheck, MdErrorOutline, MdOutlineDelete, MdOutlinedFlag, MdOutlineVerifiedUser } from 'react-icons/md';
import adminApi from '../../api/adminApi';
import useInfiniteList from '../../hooks/useInfiniteList';
import useToast from '../Common/Toast';
import ConfirmDialog from '../Common/ConfirmDialog';
import { LoadMoreFooter } from '../Video/VideoListParts';
import { timeAgo } from '../../utils/format';
import GuardedThumb from './GuardedThumb';

const nameOf = (user) => user?.displayName || user?.username || '?';

const ReportedComment = ({ comment, onResolved }) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const video = comment.video || {};
  const reasons = Object.entries(comment.reportReasons || {}).sort((a, b) => b[1] - a[1]);

  const resolve = async (decision) => {
    setBusy(true);
    setError('');
    try {
      await adminApi.resolveCommentReports(comment._id, decision);
      onResolved(comment, decision);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      setBusy(false);
      setConfirming(false);
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
          {t('admin.comments.by', { name: nameOf(comment.user) })} · @{comment.user?.username} ·{' '}
          {timeAgo(t, comment.createdAt)}
          {comment.parentComment ? ` · ${t('admin.comments.isReply')}` : ''}
        </p>

        <blockquote className="admin-quote">{comment.content}</blockquote>

        <div className="admin-chips">
          {reasons.map(([reason, count]) => (
            <span key={reason} className="admin-chip">
              <MdOutlinedFlag aria-hidden="true" />
              {t(`report.reasons.${reason}`)}
              <span className="admin-chip-count tabular-nums">{count}</span>
            </span>
          ))}
        </div>

        {error && (
          <p className="field-error" role="alert">
            <MdErrorOutline aria-hidden="true" /> {t('admin.decideFailed', { message: error })}
          </p>
        )}
      </div>

      <div className="admin-item-actions">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => resolve('dismiss')}>
          <MdCheck />
          <span>{t('admin.comments.keep')}</span>
        </button>
        <button type="button" className="btn admin-btn-danger" disabled={busy} onClick={() => setConfirming(true)}>
          <MdOutlineDelete />
          <span>{t('admin.comments.remove')}</span>
        </button>
      </div>

      {confirming && (
        <ConfirmDialog
          title={t('admin.comments.remove')}
          message={
            comment.replyCount > 0
              ? t('admin.comments.confirmRemoveThread', { count: comment.replyCount })
              : t('admin.comments.confirmRemove')
          }
          confirmLabel={t('common.delete')}
          danger
          onConfirm={() => resolve('remove')}
          onClose={() => setConfirming(false)}
        />
      )}
    </li>
  );
};

/**
 * Comments that viewers reported, most reported first. Keeping a comment
 * closes its reports; removing it deletes the comment (and its replies). These
 * decisions are not part of the video accuracy figures.
 */
const CommentReportsPanel = ({ onChanged }) => {
  const { t } = useTranslation();
  const [toast, showToast] = useToast();

  const fetchPage = useCallback(async (page) => {
    const res = await adminApi.getReportedComments(page, 20);
    const { comments, pagination } = res.data.data;
    return { items: comments, pages: pagination?.pages, total: pagination?.total };
  }, []);
  const list = useInfiniteList(fetchPage);
  const { items, setItems } = list;

  const handleResolved = (comment, decision) => {
    setItems((prev) => prev.filter((c) => c._id !== comment._id));
    showToast(t(decision === 'remove' ? 'admin.comments.removedToast' : 'admin.comments.keptToast'));
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
    // The toast stays mounted: handling the last comment empties the list.
    return (
      <>
        <div className="empty-state">
          <MdOutlineVerifiedUser className="empty-state-icon" aria-hidden="true" />
          <p className="empty-state-title">{t('admin.comments.empty')}</p>
        </div>
        {toast}
      </>
    );
  }

  return (
    <>
      <p className="admin-muted admin-intro">{t('admin.comments.intro')}</p>
      <ul className="admin-queue">
        {items.map((comment) => (
          <ReportedComment key={comment._id} comment={comment} onResolved={handleResolved} />
        ))}
      </ul>
      <LoadMoreFooter list={list} />
      {toast}
    </>
  );
};

export default CommentReportsPanel;
