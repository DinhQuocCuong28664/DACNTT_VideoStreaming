import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdAdd, MdCheckBox, MdCheckBoxOutlineBlank, MdClose, MdMoreVert, MdOutlinedFlag, MdOutlinePlaylistAdd, MdOutlineShare, MdOutlineWatchLater } from 'react-icons/md';
import { playlists } from '../../api/endpoints';
import type { PlaylistSummary, VideoCard } from '../../api/types';
import { useAuth } from '../../context/auth';
import { errorText, isApiError } from '../../lib/errors';
import { Modal } from '../Common/Dialogs';
import { useToast } from '../Common/Toast';
import ReportDialog from './ReportDialog';

const EDGE_GAP = 8;

/** "Save to playlist": tick lists to add or remove the video, or create a new list. */
export function SaveToPlaylistDialog({ videoId, onClose, notify }: { videoId: string; onClose: () => void; notify: (text: string) => void }) {
  const { t } = useTranslation();
  const [lists, setLists] = useState<PlaylistSummary[] | null>(null);
  const [contains, setContains] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const mine = (await playlists.mine()).items;
      // A playlist does not say which videos it holds in the summary; read each (lists are few).
      const has = new Set<string>();
      await Promise.all(mine.map(async (p) => { const full = await playlists.get(p.id); if (full.items.some((i) => i.id === videoId)) has.add(p.id); }));
      if (live) { setLists(mine); setContains(has); }
    })().catch(() => { if (live) setLists([]); });
    return () => { live = false; };
  }, [videoId]);

  const toggle = async (p: PlaylistSummary) => {
    const inList = contains.has(p.id);
    try {
      if (inList) await playlists.removeItem(p.id, videoId);
      else await playlists.add(p.id, videoId);
      setContains((s) => { const n = new Set(s); if (inList) n.delete(p.id); else n.add(p.id); return n; });
      notify(inList ? t('library.removedFrom', { name: p.title }) : t('library.savedTo', { name: p.title }));
    } catch (err) {
      notify(isApiError(err, 'ALREADY_IN_PLAYLIST') ? t('library.alreadyIn') : errorText(t, err));
    }
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      const { playlist } = await playlists.create({ title: title.trim(), visibility: 'private' });
      await playlists.add(playlist.id, videoId);
      notify(t('library.savedTo', { name: playlist.title }));
      onClose();
    } catch (err) {
      notify(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="save-dialog-title" busy={busy} className="save-modal">
      <div className="dialog save-dialog">
        <div className="dialog-header">
          <h2 id="save-dialog-title" className="dialog-title">{t('library.saveTo')}</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label={t('common.close')}><MdClose /></button>
        </div>
        <div className="dialog-body">
          {lists === null ? <div className="spinner" /> : (
            <ul className="save-list">
              {lists.map((p) => (
                <li key={p.id}>
                  <button type="button" className="dropdown-item" onClick={() => void toggle(p)} aria-pressed={contains.has(p.id)}>
                    {contains.has(p.id) ? <MdCheckBox aria-hidden="true" /> : <MdCheckBoxOutlineBlank aria-hidden="true" />}
                    <span>{p.kind === 'watch_later' ? t('nav.watchLater') : p.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form className="save-new" onSubmit={(e) => void create(e)}>
            <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} placeholder={t('library.newPlaylist')} aria-label={t('library.newPlaylist')} />
            <button type="submit" className="btn btn-secondary" disabled={busy || !title.trim()}><MdAdd /><span>{t('library.create')}</span></button>
          </form>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Three-dot menu of a video card: share, watch later, save to playlist, report. Keyboard: the
 * first item takes focus, arrows move, Esc closes and returns focus to the button.
 */
export default function VideoCardMenu({ video }: { video: VideoCard }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<'report' | 'save' | null>(null);
  const [usedOnce, setUsedOnce] = useState(false);
  const [toast, showToast] = useToast();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const items = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  const close = (restore = false) => { setOpen(false); if (restore) triggerRef.current?.focus(); };
  const needLogin = () => navigate('/login', { state: { from: `${location.pathname}${location.search}` } });

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const trigger = triggerRef.current?.getBoundingClientRect();
    if (!open || !panel || !trigger) return;
    const fitsBelow = trigger.bottom + panel.offsetHeight + EDGE_GAP <= window.innerHeight;
    const fitsAbove = trigger.top - panel.offsetHeight - EDGE_GAP >= 0;
    panel.dataset['placement'] = !fitsBelow && fitsAbove ? 'top' : 'bottom';
    items()[0]?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (e: Event) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', outside);
    document.addEventListener('focusin', outside);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('focusin', outside); };
  }, [open]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    const focusAt = (n: number) => list.at((n + list.length) % list.length)?.focus();
    if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); focusAt(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusAt(i - 1); }
    else if (e.key === 'Tab') close();
  };

  const share = async () => {
    close(true);
    try { await navigator.clipboard.writeText(`${window.location.origin}/watch/${video.id}`); showToast(t('videoCard.linkCopied')); } catch { showToast(t('videoCard.copyFailed')); }
  };
  const watchLater = async () => {
    close(true);
    if (!isAuthenticated) return needLogin();
    try { await playlists.add('watch-later', video.id); showToast(t('library.savedTo', { name: t('nav.watchLater') })); }
    catch (err) { showToast(isApiError(err, 'ALREADY_IN_PLAYLIST') ? t('library.alreadyIn') : errorText(t, err)); }
    return undefined;
  };
  const openDialog = (d: 'report' | 'save') => { close(true); if (!isAuthenticated) needLogin(); else setDialog(d); };

  return (
    <div ref={rootRef} className={`video-card-menu${open ? ' is-open' : ''}`}>
      <button ref={triggerRef} type="button" className="btn-icon video-card-menu-trigger" onClick={() => { setUsedOnce(true); setOpen((v) => !v); }}
        aria-label={t('videoCard.actions')} aria-haspopup="menu" aria-expanded={open}><MdMoreVert /></button>
      {open && (
        <div ref={panelRef} className="menu-panel video-card-menu-panel" role="menu" aria-label={t('videoCard.actions')} onKeyDown={onKeyDown}>
          <button type="button" role="menuitem" tabIndex={-1} className="dropdown-item" onClick={() => void watchLater()}><MdOutlineWatchLater aria-hidden="true" /><span>{t('library.saveWatchLater')}</span></button>
          <button type="button" role="menuitem" tabIndex={-1} className="dropdown-item" onClick={() => openDialog('save')}><MdOutlinePlaylistAdd aria-hidden="true" /><span>{t('library.saveTo')}</span></button>
          <button type="button" role="menuitem" tabIndex={-1} className="dropdown-item" onClick={() => void share()}><MdOutlineShare aria-hidden="true" /><span>{t('videoCard.share')}</span></button>
          {user?.id !== video.channel.id && (
            <button type="button" role="menuitem" tabIndex={-1} className="dropdown-item" onClick={() => openDialog('report')}><MdOutlinedFlag aria-hidden="true" /><span>{t('videoCard.report')}</span></button>
          )}
        </div>
      )}
      {dialog === 'report' && <ReportDialog target={{ kind: 'video', id: video.id }} onClose={() => setDialog(null)} onReported={(r) => { setDialog(null); showToast(r ? t('report.already') : t('report.success')); }} />}
      {dialog === 'save' && <SaveToPlaylistDialog videoId={video.id} onClose={() => setDialog(null)} notify={showToast} />}
      {usedOnce && createPortal(toast, document.body)}
    </div>
  );
}
