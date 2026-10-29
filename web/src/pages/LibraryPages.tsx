/**
 * The viewer's library: subscriptions feed, watch history, playlists (watch later is one of
 * them), a playlist page with reordering, and the notification inbox.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import {
  MdArrowDownward, MdArrowUpward, MdClose, MdDeleteOutline, MdErrorOutline, MdHistory, MdLock, MdOutlineNotifications,
  MdOutlinePlaylistPlay, MdOutlineSubscriptions, MdPlayArrow,
} from 'react-icons/md';
import { me, playlists } from '../api/endpoints';
import type { Notification, PlaylistItem, PlaylistSummary, VideoCard as Card } from '../api/types';
import { useAuth } from '../context/auth';
import VideoCard, { LoadMoreFooter, SkeletonCard } from '../components/Video/VideoCard';
import VideoCardMenu from '../components/Video/VideoCardMenu';
import { ConfirmDialog } from '../components/Common/Dialogs';
import { NotFoundPage } from '../components/Common/StatusScreen';
import { useToast } from '../components/Common/Toast';
import { useInfiniteList, type InfiniteList } from '../hooks/useInfiniteList';
import { errorText } from '../lib/errors';
import { formatDuration, timeAgo } from '../lib/format';
import './SubscriptionsPage.css';
import './LibraryPages.css';

function PageHeader({ icon: Icon, title, subtitle, actions }: { icon: IconType; title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="subscriptions-header library-header">
      <div>
        <h1 className="subscriptions-title"><Icon className="subscriptions-title-icon" aria-hidden="true" />{title}</h1>
        {subtitle && <p className="subscriptions-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="library-header-actions">{actions}</div>}
    </header>
  );
}

function ListBody<T extends Card>({ list, empty, row = false, extra }: { list: InfiniteList<T>; empty: ReactNode; row?: boolean; extra?: (v: T) => ReactNode }) {
  const { t } = useTranslation();
  const cls = row ? 'video-list' : 'video-grid';
  if (list.status === 'loading') return <div className={cls}>{Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} row={row} />)}</div>;
  if (list.status === 'error' && list.items.length === 0) {
    return (
      <div className="empty-state">
        <MdErrorOutline className="empty-state-icon" aria-hidden="true" />
        <p className="empty-state-title">{t('home.loadErrorTitle')}</p>
        <button type="button" className="btn btn-secondary" onClick={list.retry}>{t('home.retry')}</button>
      </div>
    );
  }
  if (list.items.length === 0) return <>{empty}</>;
  return (
    <>
      <div className={cls}>{list.items.map((v) => <div key={v.id} className="library-item"><VideoCard video={v} variant={row ? 'row' : 'grid'} menu={<VideoCardMenu video={v} />} />{extra?.(v)}</div>)}</div>
      <LoadMoreFooter list={list} />
    </>
  );
}

export function SubscriptionsPage() {
  const { t } = useTranslation();
  const fetchPage = useCallback(async (cursor: string | null) => { const r = await me.feed(cursor); return { items: r.items, next: r.nextCursor }; }, []);
  const list = useInfiniteList(fetchPage);
  return (
    <div className="subscriptions-page">
      <PageHeader icon={MdOutlineSubscriptions} title={t('subscription.feedTitle')} subtitle={t('subscription.feedSubtitle')} />
      <ListBody list={list} empty={(
        <div className="empty-state">
          <MdOutlineSubscriptions className="empty-state-icon" aria-hidden="true" />
          <h2 className="empty-state-title">{t('subscription.feedEmpty')}</h2>
          <Link to="/" className="btn btn-primary">{t('subscription.feedExplore')}</Link>
        </div>
      )} />
    </div>
  );
}

export function HistoryPage() {
  const { t } = useTranslation();
  const [toast, showToast] = useToast();
  const [confirmClear, setConfirmClear] = useState(false);
  const fetchPage = useCallback(async (cursor: string | null) => { const r = await me.history(cursor); return { items: r.items, next: r.nextCursor }; }, []);
  const list = useInfiniteList(fetchPage);
  const remove = async (id: string) => {
    try { await me.removeHistory(id); list.setItems((items) => items.filter((v) => v.id !== id)); } catch (err) { showToast(errorText(t, err)); }
  };
  return (
    <div className="subscriptions-page">
      <PageHeader icon={MdHistory} title={t('nav.history')}
        actions={list.items.length > 0 && <button type="button" className="btn btn-secondary" onClick={() => setConfirmClear(true)}><MdDeleteOutline /><span>{t('library.clearHistory')}</span></button>} />
      <ListBody list={list} row empty={<div className="empty-state"><MdHistory className="empty-state-icon" aria-hidden="true" /><p className="empty-state-title">{t('library.historyEmpty')}</p></div>}
        extra={(v) => (
          <div className="library-item-side">
            {v.positionSec > 0 && v.durationSec ? <div className="library-resume" style={{ width: `${Math.min(100, (v.positionSec / v.durationSec) * 100)}%` }} /> : null}
            <button type="button" className="btn-icon" onClick={() => void remove(v.id)} aria-label={t('library.removeFromHistory')} title={t('library.removeFromHistory')}><MdClose /></button>
          </div>
        )} />
      {confirmClear && (
        <ConfirmDialog title={t('library.clearHistory')} message={t('library.clearHistoryConfirm')} confirmLabel={t('library.clearHistory')} danger onClose={() => setConfirmClear(false)}
          onConfirm={async () => { await me.clearHistory(); list.setItems([]); setConfirmClear(false); }} />
      )}
      {toast}
    </div>
  );
}

export function PlaylistsPage() {
  const { t } = useTranslation();
  const [lists, setLists] = useState<PlaylistSummary[] | null>(null);
  useEffect(() => { playlists.mine().then((r) => setLists(r.items)).catch(() => setLists([])); }, []);
  return (
    <div className="subscriptions-page">
      <PageHeader icon={MdOutlinePlaylistPlay} title={t('nav.playlists')} />
      {lists === null ? <div className="video-grid">{Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} />)}</div> : (
        <div className="video-grid">
          {lists.map((p) => (
            <Link key={p.id} to={`/playlist/${p.id}`} className="playlist-card">
              <div className="playlist-card-cover"><MdOutlinePlaylistPlay aria-hidden="true" /><span className="playlist-card-count">{t('library.videoCount', { count: p.count })}</span></div>
              <p className="playlist-card-title">{p.kind === 'watch_later' ? t('nav.watchLater') : p.title}</p>
              <p className="playlist-card-meta">{t(`library.visibility.${p.visibility}`)} · {timeAgo(t, p.updatedAt)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function PlaylistPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [toast, showToast] = useToast();
  const [data, setData] = useState<{ playlist: PlaylistSummary; items: PlaylistItem[] } | null | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let live = true;
    setData(undefined);
    playlists.get(id).then((d) => { if (live) setData(d); }).catch(() => { if (live) setData(null); });
    return () => { live = false; };
  }, [id]);

  if (data === null) return <NotFoundPage />;
  if (data === undefined) return <div className="subscriptions-page"><div className="spinner" /></div>;

  const p = data.playlist;
  const mine = user?.id === p.owner;
  const first = data.items.find((i): i is Exclude<PlaylistItem, { unavailable: true }> => !i.unavailable);
  const title = p.kind === 'watch_later' ? t('nav.watchLater') : p.title;

  const move = async (index: number, delta: number) => {
    const items = [...data.items];
    const target = index + delta;
    const a = items.at(index);
    const b = items.at(target);
    if (!a || !b) return;
    items.splice(index, 1, b);
    items.splice(target, 1, a);
    setData({ ...data, items });
    try { await playlists.reorder(id, items.map((i) => i.id)); }
    catch (err) { showToast(errorText(t, err)); setData(await playlists.get(id)); }
  };
  const remove = async (videoId: string) => {
    try { await playlists.removeItem(id, videoId); setData({ ...data, items: data.items.filter((i) => i.id !== videoId) }); } catch (err) { showToast(errorText(t, err)); }
  };

  return (
    <div className="subscriptions-page playlist-page">
      <PageHeader icon={MdOutlinePlaylistPlay} title={title} subtitle={`${t('library.videoCount', { count: data.items.length })} · ${t(`library.visibility.${p.visibility}`)}`}
        actions={(
          <>
            {first && <Link to={`/watch/${first.id}?list=${p.id}`} className="btn btn-primary"><MdPlayArrow /><span>{t('library.playAll')}</span></Link>}
            {mine && p.kind === 'custom' && <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(true)}><MdDeleteOutline /><span>{t('library.deletePlaylist')}</span></button>}
          </>
        )} />
      {p.description && <p className="playlist-description">{p.description}</p>}
      {data.items.length === 0 ? <div className="empty-state"><p className="empty-state-title">{t('library.playlistEmpty')}</p></div> : (
        <ol className="playlist-items">
          {data.items.map((item, index) => (
            <li key={item.id} className="playlist-row">
              <span className="playlist-row-index tabular-nums">{index + 1}</span>
              {item.unavailable ? (
                <div className="playlist-row-unavailable"><MdLock aria-hidden="true" /> {t('common.unavailable')}</div>
              ) : (
                <Link to={`/watch/${item.id}?list=${p.id}`} className="playlist-row-link">
                  <span className="playlist-row-thumb">{item.thumbnail ? <img src={item.thumbnail} alt="" loading="lazy" /> : null}{item.durationSec ? <span className="video-duration">{formatDuration(item.durationSec)}</span> : null}</span>
                  <span className="playlist-row-text"><span className="playlist-row-title">{item.title}</span><span className="playlist-row-meta">{item.channel.name}</span></span>
                </Link>
              )}
              {mine && (
                <span className="playlist-row-actions">
                  <button type="button" className="btn-icon" onClick={() => void move(index, -1)} disabled={index === 0} aria-label={t('library.moveUp')}><MdArrowUpward /></button>
                  <button type="button" className="btn-icon" onClick={() => void move(index, 1)} disabled={index === data.items.length - 1} aria-label={t('library.moveDown')}><MdArrowDownward /></button>
                  <button type="button" className="btn-icon" onClick={() => void remove(item.id)} aria-label={t('library.removeFromPlaylist')}><MdClose /></button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {confirmDelete && (
        <ConfirmDialog title={t('library.deletePlaylist')} message={t('library.deletePlaylistConfirm', { name: p.title })} confirmLabel={t('common.delete')} danger onClose={() => setConfirmDelete(false)}
          onConfirm={async () => { await playlists.remove(id); navigate('/playlists'); }} />
      )}
      {toast}
    </div>
  );
}

export function NotificationsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [next, setNext] = useState<string | null>(null);

  useEffect(() => {
    me.notifications().then((r) => {
      setItems(r.items);
      setNext(r.nextCursor);
      const unread = r.items.filter((n) => !n.read).map((n) => n.id);
      if (unread.length) void me.markRead(unread).catch(() => undefined);
    }).catch(() => setItems([]));
  }, []);

  const more = async () => {
    const r = await me.notifications(next);
    setItems((cur) => [...(cur ?? []), ...r.items]);
    setNext(r.nextCursor);
  };

  return (
    <div className="subscriptions-page">
      <PageHeader icon={MdOutlineNotifications} title={t('nav.notifications')} />
      {items === null ? <div className="spinner" /> : items.length === 0 ? (
        <div className="empty-state"><MdOutlineNotifications className="empty-state-icon" aria-hidden="true" /><p className="empty-state-title">{t('library.notificationsEmpty')}</p></div>
      ) : (
        <ul className="notification-list">
          {items.map((n) => {
            const d = n.data as { videoId?: string; title?: string; channelName?: string };
            return (
              <li key={n.id} className={`notification-item ${n.read ? '' : 'is-unread'}`}>
                <Link to={d.videoId ? `/watch/${d.videoId}` : '/'}>
                  <span className="notification-text">{t('library.uploadNotice', { channel: d.channelName ?? '', title: d.title ?? '' })}</span>
                  <span className="notification-time">{timeAgo(t, n.createdAt)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {next && <div className="comment-more"><button type="button" className="btn btn-secondary" onClick={() => void more()}>{t('common.loadMore')}</button></div>}
    </div>
  );
}
