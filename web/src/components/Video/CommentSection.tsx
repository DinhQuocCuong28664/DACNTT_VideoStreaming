/**
 * Comments under a video: newest first with the creator's pinned comment on top, replies one
 * level deep (a reply to a reply mentions its author), delete for the author or the creator,
 * pin for the creator, report for everyone else. Counts come from the API.
 */
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import { MdExpandLess, MdExpandMore, MdMoreVert, MdOutlineDelete, MdOutlinedFlag, MdOutlinePushPin, MdPushPin } from 'react-icons/md';
import { comments as api } from '../../api/endpoints';
import type { Comment, User } from '../../api/types';
import { useAuth } from '../../context/auth';
import { timeAgo } from '../../lib/format';
import Avatar from '../Common/Avatar';
import { ConfirmDialog } from '../Common/Dialogs';
import { useToast } from '../Common/Toast';
import ReportDialog from './ReportDialog';

interface Thread { items: Comment[]; cursor: string | null; loaded: boolean; open: boolean; loading: boolean }

const mergeById = (current: Comment[], incoming: Comment[]) => {
  const seen = new Set(current.map((c) => c.id));
  return [...current, ...incoming.filter((c) => !seen.has(c.id))];
};

function Composer({ user, initialText = '', placeholder, ariaLabel, submitLabel, autoFocus = false, compact = false, onSubmit, onCancel }: {
  user: User | null; initialText?: string; placeholder: string; ariaLabel: string; submitLabel: string; autoFocus?: boolean; compact?: boolean;
  onSubmit: (text: string) => Promise<boolean>; onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(initialText);
  const [focused, setFocused] = useState(autoFocus);
  const [posting, setPosting] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || posting) return;
    setPosting(true);
    try {
      if (await onSubmit(text.trim())) { setText(''); setFocused(false); }
    } finally {
      setPosting(false);
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)} className={`comment-form ${compact ? 'comment-form-compact' : ''}`}>
      <Avatar src={user?.avatar} className="comment-avatar" fallbackClassName="avatar-placeholder comment-avatar">{user?.displayName.charAt(0).toUpperCase()}</Avatar>
      <div className="comment-form-body">
        <input type="text" className="comment-input" placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)} maxLength={1000} autoFocus={autoFocus} aria-label={ariaLabel} />
        {(focused || text) && (
          <div className="comment-form-actions">
            <button type="button" className="btn btn-plain" onClick={() => { setText(''); setFocused(false); onCancel?.(); }}>{t('common.cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={posting || !text.trim()}>{posting ? t('watch.commentSubmitting') : submitLabel}</button>
          </div>
        )}
      </div>
    </form>
  );
}

interface Action { key: string; icon: IconType; label: string; onSelect: () => void }

function Item({ comment, creatorName, actions, menuOpen, onToggleMenu, onReply, children }: {
  comment: Comment; creatorName: string; actions: Action[]; menuOpen: boolean; onToggleMenu: () => void; onReply: () => void; children?: ReactNode;
}) {
  const { t } = useTranslation();
  const isReply = comment.parentId !== null;
  return (
    <article className={`comment-item ${isReply ? 'comment-reply' : ''}`}>
      <Avatar src={comment.author.avatar} className={isReply ? 'comment-avatar comment-avatar-sm' : 'comment-avatar'} fallbackClassName={`avatar-placeholder comment-avatar ${isReply ? 'comment-avatar-sm' : ''}`}>
        {comment.author.name.charAt(0).toUpperCase() || '?'}
      </Avatar>
      <div className="comment-body">
        {comment.pinned && <p className="comment-pinned-badge"><MdPushPin aria-hidden="true" /> {t('watch.pinnedBy', { name: creatorName })}</p>}
        <p className="comment-head">
          {comment.author.handle
            ? <Link to={`/@${comment.author.handle}`} className={`comment-author ${comment.byCreator ? 'is-creator' : ''}`}>@{comment.author.handle}</Link>
            : <span className="comment-author">{comment.author.name}</span>}
          <span className="comment-time">{timeAgo(t, comment.createdAt)}</span>
        </p>
        <p className="comment-text">{comment.body}</p>
        <div className="comment-actions"><button type="button" className="btn btn-plain comment-reply-btn" onClick={onReply}>{t('watch.reply')}</button></div>
        {children}
      </div>
      {actions.length > 0 && (
        <div className="comment-menu">
          <button type="button" className="btn-icon comment-menu-trigger" onClick={onToggleMenu} aria-label={t('watch.commentActions')} aria-expanded={menuOpen} aria-haspopup="menu"><MdMoreVert /></button>
          {menuOpen && (
            <div className="menu-panel comment-menu-panel" role="menu">
              {actions.map(({ key, icon: Icon, label, onSelect }) => (
                <button key={key} type="button" role="menuitem" className="dropdown-item" onClick={onSelect}><Icon aria-hidden="true" /><span>{label}</span></button>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function CommentSection({ videoId, creatorId, creatorHandle, unlockToken }: { videoId: string; creatorId: string; creatorHandle: string | null; unlockToken?: string | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [toast, showToast] = useToast();
  const [list, setList] = useState<Comment[]>([]);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [threads, setThreads] = useState<ReadonlyMap<string, Thread>>(new Map());
  const [replying, setReplying] = useState<{ topId: string; targetId: string; key: string; mention: string } | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Comment | null>(null);
  const [reporting, setReporting] = useState<Comment | null>(null);

  const isCreator = user?.id === creatorId;
  const creatorName = creatorHandle ? `@${creatorHandle}` : '';
  const empty: Thread = { items: [], cursor: null, loaded: false, open: false, loading: false };
  const thread = (id: string): Thread => threads.get(id) ?? empty;
  const patchThread = (id: string, patch: Partial<Thread>) => setThreads((prev) => new Map(prev).set(id, { ...(prev.get(id) ?? empty), ...patch }));

  const loadPage = useCallback(async (cursor: string | null) => {
    const r = await api.list(videoId, cursor, unlockToken);
    setList((prev) => (cursor ? mergeById(prev, r.items) : r.items));
    setTotal(r.total);
    setNext(r.nextCursor);
  }, [videoId, unlockToken]);

  useEffect(() => {
    setList([]); setThreads(new Map()); setReplying(null); setNext(null);
    loadPage(null).catch(() => undefined);
  }, [loadPage]);

  useEffect(() => {
    if (!openMenu) return undefined;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof MouseEvent && (e.target as Element).closest('.comment-menu')) return;
      setOpenMenu(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [openMenu]);

  const goToLogin = () => navigate('/login', { state: { from: `${location.pathname}${location.search}` } });

  const post = async (text: string) => {
    try {
      const { comment } = await api.create(videoId, text);
      setList((prev) => {
        const [first, ...rest] = prev;
        return first?.pinned ? [first, comment, ...rest] : [comment, ...prev];
      });
      setTotal((n) => n + 1);
      return true;
    } catch {
      showToast(t('watch.commentFailed'));
      return false;
    }
  };

  const loadReplies = async (topId: string, cursor: string | null) => {
    patchThread(topId, { open: true, loading: true });
    try {
      const r = await api.replies(topId, cursor);
      setThreads((prev) => {
        const cur = prev.get(topId) ?? { ...empty, open: true };
        return new Map(prev).set(topId, { ...cur, items: mergeById(cursor ? cur.items : [], r.items), cursor: r.nextCursor, loaded: true, loading: false });
      });
    } catch {
      patchThread(topId, { loading: false });
      showToast(t('watch.repliesLoadFailed'));
    }
  };

  const toggleReplies = (topId: string) => {
    const th = thread(topId);
    if (th.open) patchThread(topId, { open: false });
    else if (th.loaded) patchThread(topId, { open: true });
    else void loadReplies(topId, null);
  };

  const startReply = (c: Comment) => {
    if (!isAuthenticated) return goToLogin();
    const mention = c.parentId && c.author.handle ? `@${c.author.handle} ` : '';
    setReplying({ topId: c.parentId ?? c.id, targetId: c.id, key: `${c.id}-${Date.now()}`, mention });
    return undefined;
  };

  const postReply = async (topId: string, text: string) => {
    try {
      const { comment } = await api.create(videoId, text, topId);
      patchThread(topId, { items: [...thread(topId).items, comment], open: true });
      setList((prev) => prev.map((c) => (c.id === topId ? { ...c, replyCount: c.replyCount + 1 } : c)));
      setTotal((n) => n + 1);
      setReplying(null);
      return true;
    } catch {
      showToast(t('watch.commentFailed'));
      return false;
    }
  };

  const confirmDelete = async () => {
    const c = pendingDelete;
    if (!c) return;
    try {
      await api.remove(c.id);
      if (c.parentId) {
        const topId = c.parentId;
        patchThread(topId, { items: thread(topId).items.filter((r) => r.id !== c.id) });
        setList((prev) => prev.map((x) => (x.id === topId ? { ...x, replyCount: Math.max(0, x.replyCount - 1) } : x)));
        setTotal((n) => Math.max(0, n - 1));
      } else {
        setList((prev) => prev.filter((x) => x.id !== c.id));
        setTotal((n) => Math.max(0, n - 1 - c.replyCount));
      }
    } catch {
      showToast(t('watch.deleteCommentFailed'));
    } finally {
      setPendingDelete(null);
    }
  };

  const setPin = async (c: Comment, pin: boolean) => {
    setOpenMenu(null);
    try {
      if (pin) await api.pin(c.id);
      else await api.unpin(c.id);
      setList((prev) => {
        const others = prev.filter((x) => x.id !== c.id).map((x) => ({ ...x, pinned: false }));
        const self = { ...c, pinned: pin };
        return pin ? [self, ...others] : [self, ...others].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      });
      showToast(pin ? t('watch.pinned') : t('watch.unpinned'));
    } catch {
      showToast(t('watch.pinFailed'));
    }
  };

  const actionsFor = (c: Comment): Action[] => {
    const actions: Action[] = [];
    if (isCreator && !c.parentId) actions.push({ key: 'pin', icon: MdOutlinePushPin, label: c.pinned ? t('watch.unpin') : t('watch.pin'), onSelect: () => void setPin(c, !c.pinned) });
    if (user && (user.id === c.author.id || isCreator)) actions.push({ key: 'delete', icon: MdOutlineDelete, label: t('watch.deleteComment'), onSelect: () => { setOpenMenu(null); setPendingDelete(c); } });
    if (user?.id !== c.author.id) {
      actions.push({ key: 'report', icon: MdOutlinedFlag, label: t('watch.reportComment'), onSelect: () => { setOpenMenu(null); if (!isAuthenticated) goToLogin(); else setReporting(c); } });
    }
    return actions;
  };

  const render = (c: Comment, extra?: ReactNode) => (
    <Item key={c.id} comment={c} creatorName={creatorName} actions={actionsFor(c)} menuOpen={openMenu === c.id}
      onToggleMenu={() => setOpenMenu(openMenu === c.id ? null : c.id)} onReply={() => startReply(c)}>
      {replying?.targetId === c.id && (
        <Composer key={replying.key} user={user} initialText={replying.mention} placeholder={t('watch.replyPlaceholder')} ariaLabel={t('watch.replyAriaLabel')}
          submitLabel={t('watch.reply')} autoFocus compact onSubmit={(text) => postReply(replying.topId, text)} onCancel={() => setReplying(null)} />
      )}
      {extra}
    </Item>
  );

  return (
    <section className="comments-section" aria-labelledby="comments-heading">
      <h2 id="comments-heading" className="comments-heading">{t('watch.commentsHeading', { count: total })}</h2>
      {isAuthenticated
        ? <Composer user={user} placeholder={t('watch.commentPlaceholder')} ariaLabel={t('watch.commentAriaLabel')} submitLabel={t('watch.commentSubmit')} onSubmit={post} />
        : <p className="comment-login-hint"><Link to="/login" state={{ from: location.pathname }}>{t('nav.login')}</Link> {t('watch.loginPrompt')}</p>}
      <div className="comment-list">
        {list.map((c) => {
          const th = thread(c.id);
          return render(c, (
            <>
              {c.replyCount > 0 && (
                <button type="button" className="btn btn-ghost comment-replies-toggle" onClick={() => toggleReplies(c.id)} aria-expanded={th.open}>
                  {th.open ? <MdExpandLess aria-hidden="true" /> : <MdExpandMore aria-hidden="true" />}{t('watch.repliesCount', { count: c.replyCount })}
                </button>
              )}
              {th.open && (
                <div className="comment-replies">
                  {th.items.map((r) => render(r))}
                  {th.loading && <p className="comment-replies-loading">{t('watch.loadingReplies')}</p>}
                  {!th.loading && th.cursor && <button type="button" className="btn btn-ghost comment-replies-more" onClick={() => void loadReplies(c.id, th.cursor)}>{t('watch.moreReplies')}</button>}
                </div>
              )}
            </>
          ));
        })}
      </div>
      {next && (
        <div className="comment-more">
          <button type="button" className="btn btn-secondary" disabled={loadingMore}
            onClick={() => { setLoadingMore(true); loadPage(next).catch(() => showToast(t('watch.commentsLoadFailed'))).finally(() => setLoadingMore(false)); }}>
            {loadingMore ? t('watch.loadingComments') : t('watch.moreComments')}
          </button>
        </div>
      )}
      {pendingDelete && (
        <ConfirmDialog title={t('watch.deleteComment')} danger confirmLabel={t('common.delete')} onConfirm={confirmDelete} onClose={() => setPendingDelete(null)}
          message={!pendingDelete.parentId && pendingDelete.replyCount > 0 ? t('watch.confirmDeleteThread', { count: pendingDelete.replyCount }) : t('watch.confirmDeleteComment')} />
      )}
      {reporting && (
        <ReportDialog target={{ kind: 'comment', id: reporting.id }} onClose={() => setReporting(null)}
          onReported={(repeated) => { setReporting(null); showToast(repeated ? t('report.comment.already') : t('report.comment.success')); }} />
      )}
      {toast}
    </section>
  );
}
