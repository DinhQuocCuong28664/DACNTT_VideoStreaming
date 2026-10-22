import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdExpandLess, MdExpandMore, MdMoreVert, MdOutlineDelete, MdOutlinePushPin, MdPushPin } from 'react-icons/md';
import Avatar from '../Common/Avatar';
import ConfirmDialog from '../Common/ConfirmDialog';
import useToast from '../Common/Toast';
import { useAuth } from '../../context/useAuth';
import videoApi from '../../api/videoApi';
import { timeAgo } from '../../utils/format';

const PAGE_SIZE = 20;

const mergeById = (current, incoming) => {
  const seen = new Set(current.map((c) => c._id));
  return [...current, ...incoming.filter((c) => !seen.has(c._id))];
};

const byCreatedAt = (a, b) => new Date(a.createdAt) - new Date(b.createdAt);

/** The text box used for a new comment and for a reply. */
const CommentComposer = ({
  user,
  initialText = '',
  placeholder,
  ariaLabel,
  submitLabel,
  autoFocus,
  compact,
  onSubmit,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [text, setText] = useState(initialText);
  const [focused, setFocused] = useState(Boolean(autoFocus));
  const [posting, setPosting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() || posting) return;
    setPosting(true);
    try {
      const ok = await onSubmit(text.trim());
      if (ok) {
        setText('');
        setFocused(false);
      }
    } finally {
      setPosting(false);
    }
  };

  const cancel = () => {
    setText('');
    setFocused(false);
    onCancel?.();
  };

  return (
    <form onSubmit={handleSubmit} className={`comment-form ${compact ? 'comment-form-compact' : ''}`}>
      <Avatar src={user?.avatar} className="comment-avatar" fallbackClassName="avatar-placeholder comment-avatar">
        {user?.username?.charAt(0).toUpperCase()}
      </Avatar>
      <div className="comment-form-body">
        <input
          type="text"
          className="comment-input"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          maxLength={1000}
          autoFocus={autoFocus}
          aria-label={ariaLabel}
        />
        {(focused || text) && (
          <div className="comment-form-actions">
            <button type="button" className="btn btn-plain" onClick={cancel}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={posting || !text.trim()}>
              {posting ? t('watch.commentSubmitting') : submitLabel}
            </button>
          </div>
        )}
      </div>
    </form>
  );
};

/** One comment or reply, with its menu. */
const CommentItem = ({ comment, pinned, ownerName, actions, menuOpen, onToggleMenu, onReply, children }) => {
  const { t } = useTranslation();
  const isReply = Boolean(comment.parentComment);

  return (
    <article className={`comment-item ${isReply ? 'comment-reply' : ''}`}>
      <Avatar
        src={comment.user?.avatar}
        className={isReply ? 'comment-avatar comment-avatar-sm' : 'comment-avatar'}
        fallbackClassName={`avatar-placeholder comment-avatar ${isReply ? 'comment-avatar-sm' : ''}`}
      >
        {comment.user?.username?.charAt(0).toUpperCase() || '?'}
      </Avatar>
      <div className="comment-body">
        {pinned && (
          <p className="comment-pinned-badge">
            <MdPushPin aria-hidden="true" /> {t('watch.pinnedBy', { name: ownerName })}
          </p>
        )}
        <p className="comment-head">
          <Link to={`/channel/${comment.user?._id}`} className="comment-author">
            @{comment.user?.username}
          </Link>
          {comment.createdAt && <span className="comment-time">{timeAgo(t, comment.createdAt)}</span>}
        </p>
        <p className="comment-text">{comment.content}</p>
        <div className="comment-actions">
          <button type="button" className="btn btn-plain comment-reply-btn" onClick={onReply}>
            {t('watch.reply')}
          </button>
        </div>
        {children}
      </div>
      {actions.length > 0 && (
        <div className="comment-menu">
          <button
            type="button"
            className="btn-icon comment-menu-trigger"
            onClick={onToggleMenu}
            aria-label={t('watch.commentActions')}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <MdMoreVert />
          </button>
          {menuOpen && (
            <div className="menu-panel comment-menu-panel" role="menu">
              {actions.map(({ key, icon: Icon, label, onSelect }) => (
                <button key={key} type="button" role="menuitem" className="dropdown-item" onClick={onSelect}>
                  <Icon aria-hidden="true" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
};

/**
 * Comments of a video: top-level comments newest first with the pinned one on
 * top, one level of replies loaded on demand, and the owner's pin control.
 */
const CommentSection = ({ videoId, videoOwner }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user: currentUser, isAuthenticated } = useAuth();
  const [toast, showToast] = useToast();

  const [comments, setComments] = useState([]);
  const [pinnedId, setPinnedId] = useState(null);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [threads, setThreads] = useState({});
  const [replyingTo, setReplyingTo] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const isVideoOwner = Boolean(currentUser && videoOwner && currentUser._id === videoOwner._id);
  const ownerName = videoOwner?.username ? `@${videoOwner.username}` : '';

  const applyPage = useCallback((data, first) => {
    setComments((prev) => (first ? data.comments : mergeById(prev, data.comments)));
    setPinnedId(data.pinnedCommentId || null);
    setTotal(data.total || 0);
    setNextCursor(data.nextCursor || null);
  }, []);

  useEffect(() => {
    // Ignore a slow answer for the previous video after the viewer moved on.
    let ignore = false;
    setComments([]);
    setThreads({});
    setReplyingTo(null);
    setNextCursor(null);
    videoApi
      .getComments(videoId, null, PAGE_SIZE)
      .then((res) => {
        if (!ignore) applyPage(res.data.data, true);
      })
      .catch((err) => console.error('Failed to load comments:', err));
    return () => {
      ignore = true;
    };
  }, [videoId, applyPage]);

  // Close a comment menu on an outside click or Esc.
  useEffect(() => {
    if (!openMenu) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'mousedown' && e.target.closest('.comment-menu')) return;
      setOpenMenu(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [openMenu]);

  const goToLogin = () => navigate('/login', { state: { from: location.pathname } });

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await videoApi.getComments(videoId, nextCursor, PAGE_SIZE);
      applyPage(res.data.data, false);
    } catch {
      showToast(t('watch.commentsLoadFailed'));
    } finally {
      setLoadingMore(false);
    }
  };

  const postComment = async (text) => {
    if (!isAuthenticated) {
      goToLogin();
      return false;
    }
    try {
      const res = await videoApi.addComment(videoId, text);
      const created = res.data.data.comment;
      setComments((prev) => {
        if (!pinnedId) return [created, ...prev];
        const [first, ...rest] = prev;
        return first && first._id === pinnedId ? [first, created, ...rest] : [created, ...prev];
      });
      setTotal((n) => n + 1);
      return true;
    } catch {
      showToast(t('watch.commentFailed'));
      return false;
    }
  };

  // A thread is { items, total, cursor, loaded, open, loading }. `loaded` is
  // false until the first page came from the server; replies the viewer
  // posted before that are already in `items`.
  const loadReplies = async (topId, after = null) => {
    setThreads((prev) => ({
      ...prev,
      [topId]: { items: [], total: 0, cursor: null, loaded: false, ...prev[topId], open: true, loading: true },
    }));
    try {
      const res = await videoApi.getReplies(topId, after, PAGE_SIZE);
      const { replies, total: replyTotal, nextCursor: cursor } = res.data.data;
      setThreads((prev) => ({
        ...prev,
        [topId]: {
          ...prev[topId],
          // Replies the viewer just posted may already be in the list; keep
          // one copy of each and the thread in posting order.
          items: mergeById(prev[topId]?.items || [], replies).sort(byCreatedAt),
          total: replyTotal,
          cursor: cursor || null,
          loaded: true,
          loading: false,
        },
      }));
    } catch {
      setThreads((prev) => ({ ...prev, [topId]: { ...prev[topId], loading: false } }));
      showToast(t('watch.repliesLoadFailed'));
    }
  };

  const toggleReplies = (topId) => {
    const thread = threads[topId];
    if (thread?.open) {
      setThreads((prev) => ({ ...prev, [topId]: { ...prev[topId], open: false } }));
    } else if (thread?.loaded) {
      setThreads((prev) => ({ ...prev, [topId]: { ...prev[topId], open: true } }));
    } else {
      loadReplies(topId);
    }
  };

  const startReply = (comment) => {
    if (!isAuthenticated) return goToLogin();
    const topId = comment.parentComment || comment._id;
    // Replying to a reply mentions its author, as YouTube does.
    const mention = comment.parentComment && comment.user?.username ? `@${comment.user.username} ` : '';
    // The box opens under the comment that was clicked; the reply itself is
    // filed under the top-level comment.
    setReplyingTo({ topId, targetId: comment._id, key: `${comment._id}-${Date.now()}`, mention });
    return undefined;
  };

  const postReply = async (topId, text) => {
    try {
      const res = await videoApi.addComment(videoId, text, topId);
      const created = res.data.data.comment;
      // The new reply shows at the end of the thread. A thread not loaded yet
      // stays `loaded: false`, so "show more replies" still fetches the older
      // ones (mergeById drops the duplicate).
      setThreads((prev) => ({
        ...prev,
        [topId]: {
          ...prev[topId],
          items: [...(prev[topId]?.items || []), created],
          total: (prev[topId]?.total ?? comments.find((c) => c._id === topId)?.replyCount ?? 0) + 1,
          open: true,
        },
      }));
      setComments((prev) => prev.map((c) => (c._id === topId ? { ...c, replyCount: (c.replyCount || 0) + 1 } : c)));
      setTotal((n) => n + 1);
      setReplyingTo(null);
      return true;
    } catch {
      showToast(t('watch.commentFailed'));
      return false;
    }
  };

  const confirmDelete = async () => {
    const comment = pendingDelete;
    try {
      await videoApi.deleteComment(comment._id);
      if (comment.parentComment) {
        const topId = comment.parentComment;
        setThreads((prev) => ({
          ...prev,
          [topId]: {
            ...prev[topId],
            items: (prev[topId]?.items || []).filter((r) => r._id !== comment._id),
            total: Math.max(0, (prev[topId]?.total || 1) - 1),
          },
        }));
        setComments((prev) =>
          prev.map((c) => (c._id === topId ? { ...c, replyCount: Math.max(0, (c.replyCount || 1) - 1) } : c))
        );
        setTotal((n) => Math.max(0, n - 1));
      } else {
        setComments((prev) => prev.filter((c) => c._id !== comment._id));
        setThreads((prev) => {
          const next = { ...prev };
          delete next[comment._id];
          return next;
        });
        if (pinnedId === comment._id) setPinnedId(null);
        setTotal((n) => Math.max(0, n - 1 - (comment.replyCount || 0)));
      }
    } catch {
      showToast(t('watch.deleteCommentFailed'));
    } finally {
      setPendingDelete(null);
    }
  };

  const setPin = async (comment, pin) => {
    setOpenMenu(null);
    try {
      await videoApi.setPinnedComment(videoId, pin ? comment._id : null);
      setPinnedId(pin ? comment._id : null);
      if (pin) setComments((prev) => [comment, ...prev.filter((c) => c._id !== comment._id)]);
      showToast(pin ? t('watch.pinned') : t('watch.unpinned'));
    } catch {
      showToast(t('watch.pinFailed'));
    }
  };

  const actionsFor = (comment) => {
    const actions = [];
    const isTop = !comment.parentComment;
    if (isVideoOwner && isTop) {
      const isPinned = pinnedId === comment._id;
      actions.push({
        key: 'pin',
        icon: MdOutlinePushPin,
        label: isPinned ? t('watch.unpin') : t('watch.pin'),
        onSelect: () => setPin(comment, !isPinned),
      });
    }
    const canDelete = currentUser && (currentUser._id === comment.user?._id || isVideoOwner);
    if (canDelete) {
      actions.push({
        key: 'delete',
        icon: MdOutlineDelete,
        label: t('watch.deleteComment'),
        onSelect: (e) => {
          // Focus the menu's trigger before the menu unmounts, so the dialog
          // hands focus back there when it closes.
          e.currentTarget.closest('.comment-menu')?.querySelector('.comment-menu-trigger')?.focus();
          setOpenMenu(null);
          setPendingDelete(comment);
        },
      });
    }
    return actions;
  };

  const renderItem = (comment, extra = null) => (
    <CommentItem
      key={comment._id}
      comment={comment}
      pinned={!comment.parentComment && pinnedId === comment._id}
      ownerName={ownerName}
      actions={actionsFor(comment)}
      menuOpen={openMenu === comment._id}
      onToggleMenu={() => setOpenMenu(openMenu === comment._id ? null : comment._id)}
      onReply={() => startReply(comment)}
    >
      {replyingTo?.targetId === comment._id && (
        <CommentComposer
          key={replyingTo.key}
          user={currentUser}
          initialText={replyingTo.mention}
          placeholder={t('watch.replyPlaceholder')}
          ariaLabel={t('watch.replyAriaLabel')}
          submitLabel={t('watch.reply')}
          autoFocus
          compact
          onSubmit={(text) => postReply(replyingTo.topId, text)}
          onCancel={() => setReplyingTo(null)}
        />
      )}
      {extra}
    </CommentItem>
  );

  return (
    <section className="comments-section" aria-labelledby="comments-heading">
      <h2 id="comments-heading" className="comments-heading">
        {t('watch.commentsHeading', { count: total })}
      </h2>

      {isAuthenticated ? (
        <CommentComposer
          user={currentUser}
          placeholder={t('watch.commentPlaceholder')}
          ariaLabel={t('watch.commentAriaLabel')}
          submitLabel={t('watch.commentSubmit')}
          onSubmit={postComment}
        />
      ) : (
        <p className="comment-login-hint">
          <Link to="/login" state={{ from: location.pathname }}>
            {t('nav.login')}
          </Link>{' '}
          {t('watch.loginPrompt')}
        </p>
      )}

      <div className="comment-list">
        {comments.map((comment) => {
          const thread = threads[comment._id];
          const replyCount = comment.replyCount || 0;
          const shownReplies = thread?.items || [];
          return renderItem(
            comment,
            <>
              {replyCount > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost comment-replies-toggle"
                  onClick={() => toggleReplies(comment._id)}
                  aria-expanded={Boolean(thread?.open)}
                >
                  {thread?.open ? <MdExpandLess aria-hidden="true" /> : <MdExpandMore aria-hidden="true" />}
                  {t('watch.repliesCount', { count: replyCount })}
                </button>
              )}
              {thread?.open && (
                <div className="comment-replies">
                  {shownReplies.map((reply) => renderItem(reply))}
                  {thread.loading && <p className="comment-replies-loading">{t('watch.loadingReplies')}</p>}
                  {!thread.loading && (thread.cursor || !thread.loaded) && (
                    <button
                      type="button"
                      className="btn btn-ghost comment-replies-more"
                      onClick={() => loadReplies(comment._id, thread.loaded ? thread.cursor : null)}
                    >
                      {t('watch.moreReplies')}
                    </button>
                  )}
                </div>
              )}
            </>
          );
        })}
      </div>

      {nextCursor && (
        <div className="comment-more">
          <button type="button" className="btn btn-secondary" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? t('watch.loadingComments') : t('watch.moreComments')}
          </button>
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={t('watch.deleteComment')}
          message={
            !pendingDelete.parentComment && pendingDelete.replyCount > 0
              ? t('watch.confirmDeleteThread', { count: pendingDelete.replyCount })
              : t('watch.confirmDeleteComment')
          }
          confirmLabel={t('common.delete')}
          danger
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
      {toast}
    </section>
  );
};

export default CommentSection;
