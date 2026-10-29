import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  MdBlock, MdCheck, MdErrorOutline, MdLock, MdOutlineShare, MdOutlineShield, MdOutlineThumbDown, MdOutlineThumbUp, MdStars,
  MdThumbDown, MdThumbUp, MdWarningAmber,
} from 'react-icons/md';
import { channels, me, videos } from '../api/endpoints';
import type { LockedStub, Playback, VideoCard as Card, VideoDetails } from '../api/types';
import { useAuth } from '../context/auth';
import Avatar from '../components/Common/Avatar';
import { useToast } from '../components/Common/Toast';
import { NotFoundPage } from '../components/Common/StatusScreen';
import VideoPlayer from '../components/Video/VideoPlayer';
import VideoCard from '../components/Video/VideoCard';
import SubscribeButton from '../components/Channel/SubscribeButton';
import { errorText, isApiError } from '../lib/errors';
import { formatDate, formatViews } from '../lib/format';
import { parseStartTime } from '../lib/playback';
import './WatchPage.css';
import '../components/Video/LockedVideoOverlay.css';

const UNLOCK_KEY = (id: string) => `unlock:${id}`;
const readUnlock = (id: string) => { try { return sessionStorage.getItem(UNLOCK_KEY(id)); } catch { return null; } };

type Loaded =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'blocked'; code: 'VIDEO_REMOVED' | 'VIDEO_UNDER_REVIEW' }
  | { kind: 'password' }
  | { kind: 'video'; video: VideoDetails };

export default function WatchPage() {
  const { t, i18n } = useTranslation();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [toast, showToast] = useToast();

  const [state, setState] = useState<Loaded>({ kind: 'loading' });
  const [unlockToken, setUnlockToken] = useState<string | null>(() => readUnlock(id));
  const [grant, setGrant] = useState<Playback | null>(null);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [resumeAt, setResumeAt] = useState<number | null>(null);
  const [related, setRelated] = useState<Card[]>([]);
  const [relatedFilter, setRelatedFilter] = useState<'all' | 'channel'>('all');
  const [reaction, setReaction] = useState<'like' | 'dislike' | null>(null);
  const [likes, setLikes] = useState(0);
  const [subscribed, setSubscribed] = useState(false);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reload, setReload] = useState(0);

  // ── Load the video, then its playback grant ─────────────────────────────────────────
  useEffect(() => {
    let live = true;
    setState({ kind: 'loading' });
    setGrant(null);
    setGrantError(null);
    setWarningDismissed(false);
    setDescExpanded(false);
    (async () => {
      try {
        const { video } = await videos.get(id, unlockToken);
        if (!live) return;
        if ((video as LockedStub).locked === 'password' && !('title' in video)) return setState({ kind: 'password' });
        const v = video as VideoDetails;
        setState({ kind: 'video', video: v });
        setLikes(v.counters.likes);
      } catch (err) {
        if (!live) return;
        if (isApiError(err, 'VIDEO_REMOVED') || isApiError(err, 'VIDEO_UNDER_REVIEW')) setState({ kind: 'blocked', code: err.code as 'VIDEO_REMOVED' });
        else setState({ kind: 'missing' });
      }
    })();
    videos.related(id).then((r) => { if (live) setRelated(r.items); }).catch(() => undefined);
    return () => { live = false; };
  }, [id, unlockToken, reload, user?.id]);

  const video = state.kind === 'video' ? state.video : null;
  const playable = video !== null && video.locked === null;

  useEffect(() => {
    if (!playable) return undefined;
    let live = true;
    videos.playback(id, unlockToken).then((g) => { if (live) setGrant(g); }).catch((err: unknown) => { if (live) setGrantError(errorText(t, err)); });
    if (isAuthenticated) {
      videos.reaction(id).then((r) => { if (live) setReaction(r.kind); }).catch(() => undefined);
      me.progress(id).then((p) => { if (live && p.positionSec > 10) setResumeAt(p.positionSec); }).catch(() => undefined);
    }
    return () => { live = false; };
  }, [playable, id, unlockToken, isAuthenticated, t]);

  // The channel's subscription state for the subscribe button.
  const channelId = video?.channel.id;
  useEffect(() => {
    if (!channelId || !isAuthenticated) return;
    channels.get(channelId).then((c) => setSubscribed(Boolean(c.viewer?.subscribed))).catch(() => undefined);
  }, [channelId, isAuthenticated]);

  // Poll while the owner watches their video being processed.
  const processing = video?.status === 'PROCESSING' || video?.status === 'UPLOADING';
  useEffect(() => {
    if (!processing) return undefined;
    const timer = setInterval(() => setReload((n) => n + 1), 5000);
    return () => clearInterval(timer);
  }, [processing]);

  const renew = useCallback(() => videos.playback(id, unlockToken).then((g) => { setGrant(g); return g; }), [id, unlockToken]);
  const onView = useCallback((token: string) => {
    videos.view(id, token).then((r) => {
      if (r.counted) setState((s) => (s.kind === 'video' ? { kind: 'video', video: { ...s.video, views: r.views } } : s));
    }).catch(() => undefined);
  }, [id]);
  const onHeartbeat = useCallback((b: { positionSec: number; watchedSec: number; playbackToken: string }) => {
    void videos.heartbeat(id, b.playbackToken, { positionSec: b.positionSec, watchedSec: b.watchedSec }).catch(() => undefined);
  }, [id]);

  const goToLogin = () => navigate('/login', { state: { from: `${location.pathname}${location.search}` } });
  const react = async (kind: 'like' | 'dislike') => {
    if (!isAuthenticated) return goToLogin();
    const next = reaction === kind ? null : kind;
    try {
      const r = await videos.react(id, next);
      setReaction(r.kind);
      setLikes(r.likes);
    } catch (err) {
      showToast(errorText(t, err));
    }
    return undefined;
  };
  const share = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/watch/${id}`).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startTime = useMemo(() => parseStartTime(new URLSearchParams(location.search).get('t')) ?? resumeAt, [location.search, resumeAt]);

  // ── Screens without a player ────────────────────────────────────────────────────────
  if (state.kind === 'loading') {
    return (
      <div className="container watch-page"><div className="watch-layout"><div className="watch-main">
        <div className="skeleton skeleton-thumb watch-skeleton-player" />
        <div className="skeleton watch-skeleton-title" />
        <div className="skeleton watch-skeleton-meta" />
      </div></div></div>
    );
  }
  if (state.kind === 'missing') return <NotFoundPage />;
  if (state.kind === 'blocked') {
    const removed = state.code === 'VIDEO_REMOVED';
    const Icon = removed ? MdBlock : MdOutlineShield;
    return (
      <div className="container watch-page">
        <div className="empty-state watch-unavailable" role="alert">
          <Icon className="empty-state-icon" aria-hidden="true" />
          <p className="empty-state-title">{removed ? t('watch.removedTitle') : t('watch.underReviewTitle')}</p>
          <p className="empty-state-desc">{removed ? t('watch.removedBody') : t('watch.underReviewBody')}</p>
          <Link to="/" className="btn btn-secondary">{t('forbidden.home')}</Link>
        </div>
      </div>
    );
  }
  if (state.kind === 'password') {
    return <PasswordGate videoId={id} onUnlocked={(token) => { try { sessionStorage.setItem(UNLOCK_KEY(id), token); } catch { /* this page only */ } setUnlockToken(token); }} />;
  }

  const v = state.video;
  const isOwner = user?.id === v.channel.id;
  const moderation = v.moderation?.status;
  const description = v.description;
  const collapsible = description.length > 220 || description.split('\n').length > 3;
  const fromChannel = related.filter((r) => r.channel.id === v.channel.id);
  const shownRelated = relatedFilter === 'channel' ? fromChannel : related;
  const locale = i18n.resolvedLanguage === 'en' ? 'en-US' : 'vi-VN';

  let player;
  if (v.locked === 'removed') {
    player = <div className="player-placeholder"><MdBlock className="player-placeholder-icon" aria-hidden="true" /><p>{t('watch.removedTitle')}</p></div>;
  } else if (v.locked === 'members') {
    player = (
      <div className="player-locked-wrapper">
        {v.thumbnail && <img src={v.thumbnail} alt="" className="player-locked-thumb" />}
        <div className="yt-locked-overlay">
          <div className="yt-locked-icon-wrapper"><MdLock /></div>
          <h2 className="yt-locked-title">{t('membership.lockedTitle')}</h2>
          <p className="yt-locked-subtitle">{t('membership.lockedSubtitle', { name: v.channel.name })}</p>
          <Link to={`/@${v.channel.handle ?? ''}`} className="yt-locked-join-btn"><MdStars /><span>{t('membership.joinPrompt')}</span></Link>
        </div>
      </div>
    );
  } else if (v.locked === 'not_ready') {
    player = (
      <div className="player-placeholder">
        {v.status === 'ERROR' ? (
          <><MdErrorOutline className="player-placeholder-icon" aria-hidden="true" /><p>{t('watch.processingFailed')}</p></>
        ) : (
          <div className="processing-progress-box">
            <div className="spinner" />
            <p className="processing-status-text">{t('watch.transcoding')} {v.processingProgress ? `(${v.processingProgress}%)` : ''}</p>
            {Boolean(v.processingProgress) && (
              <div className="processing-progress-bar-container"><div className="processing-progress-bar-fill" style={{ width: `${Math.min(100, Math.max(5, v.processingProgress ?? 0))}%` }} /></div>
            )}
            <p className="processing-status-subtext">{(v.processingProgress ?? 0) < 25 ? t('watch.stagePreparing') : (v.processingProgress ?? 0) < 90 ? t('watch.stageTranscoding') : t('watch.stageFinalizing')}</p>
          </div>
        )}
      </div>
    );
  } else if (v.hasViolence && !warningDismissed) {
    player = (
      <div className="player-placeholder player-violence-warning">
        {v.thumbnail && <div className="violence-warning-backdrop" style={{ backgroundImage: `url(${v.thumbnail})` }} aria-hidden="true" />}
        <div className="violence-warning-content">
          <MdWarningAmber className="violence-warning-icon" aria-hidden="true" />
          <h2 className="violence-warning-title">{t('watch.violenceWarningTitle')}</h2>
          <p className="violence-warning-desc">{t('watch.violenceWarningDesc')}</p>
          <div className="violence-warning-actions">
            <button type="button" className="btn btn-primary violence-proceed-btn" onClick={() => setWarningDismissed(true)}>{t('watch.proceedButton')}</button>
            <button type="button" className="btn btn-plain violence-back-btn" onClick={() => navigate(-1)}>{t('watch.goBackButton')}</button>
          </div>
        </div>
      </div>
    );
  } else if (grantError) {
    player = <div className="player-placeholder"><MdErrorOutline className="player-placeholder-icon" aria-hidden="true" /><p>{grantError}</p></div>;
  } else if (!grant) {
    player = <div className="player-placeholder"><div className="spinner" /></div>;
  } else {
    player = (
      <VideoPlayer
        grant={grant} renew={renew} poster={v.thumbnail} previewVtt={v.previewVtt} chapters={v.chapters} startTime={startTime}
        shareUrl={`${window.location.origin}/watch/${v.id}`} onView={onView} onHeartbeat={onHeartbeat}
      />
    );
  }

  return (
    <div className="container watch-page">
      <div className="watch-layout">
        <div className="watch-main">
          {player}

          {(moderation === 'review' || moderation === 'removed') && (
            <div className={`watch-moderation-notice${moderation === 'removed' ? ' is-removed' : ''}`} role="status">
              {moderation === 'removed' ? <MdBlock aria-hidden="true" /> : <MdOutlineShield aria-hidden="true" />}
              <p>{isOwner ? (moderation === 'removed' ? t('watch.ownerRemovedNotice') : t('watch.ownerUnderReviewNotice')) : t('watch.adminNotice', { status: t(`moderationStatus.${moderation}`) })}</p>
            </div>
          )}

          <h1 className="watch-title">
            {v.title}
            {v.hasViolence && <span className="watch-violence-chip" title={t('watch.violenceWarningBadge')}><MdWarningAmber aria-hidden="true" /> {t('watch.violenceWarningBadge')}</span>}
          </h1>

          <div className="watch-owner-row">
            <div className="watch-owner-meta">
              <Link to={`/@${v.channel.handle ?? ''}`} className="watch-owner">
                <Avatar src={v.channel.avatar} className="watch-owner-avatar" fallbackClassName="avatar-placeholder watch-owner-avatar">{v.channel.name.charAt(0).toUpperCase()}</Avatar>
                <div className="watch-owner-text">
                  <p className="watch-owner-name">{v.channel.name}</p>
                  {v.channel.handle && <p className="watch-owner-handle">@{v.channel.handle}</p>}
                </div>
              </Link>
              <SubscribeButton channelId={v.channel.id} channelName={v.channel.name} subscribed={subscribed} onChange={(s) => setSubscribed(s.subscribed)} />
            </div>
            <div className="watch-actions">
              <div className="segmented-pill">
                <button type="button" onClick={() => void react('like')} aria-pressed={reaction === 'like'} aria-label={t('watch.like')} title={t('watch.like')}>
                  {reaction === 'like' ? <MdThumbUp /> : <MdOutlineThumbUp />}<span className="tabular-nums">{formatViews(likes)}</span>
                </button>
                <span className="segmented-divider" aria-hidden="true" />
                <button type="button" onClick={() => void react('dislike')} aria-pressed={reaction === 'dislike'} aria-label={t('watch.dislike')} title={t('watch.dislike')}>
                  {reaction === 'dislike' ? <MdThumbDown /> : <MdOutlineThumbDown />}
                </button>
              </div>
              <button type="button" className="btn btn-secondary" onClick={() => void share()}>
                {copied ? <MdCheck /> : <MdOutlineShare />}<span>{copied ? t('watch.copied') : t('watch.share')}</span>
              </button>
            </div>
          </div>

          <div className={`watch-description${descExpanded ? ' is-expanded' : ''}${collapsible ? ' is-collapsible' : ''}`} onClick={() => { if (collapsible && !descExpanded) setDescExpanded(true); }}>
            <p className="watch-description-meta">
              <span>{t('watch.viewsFull', { count: v.views, value: v.views.toLocaleString(locale) })}</span>
              {v.publishedAt && <span>{formatDate(i18n.resolvedLanguage ?? 'vi', v.publishedAt)}</span>}
            </p>
            {description && <div className="watch-description-text">{description}</div>}
            {v.chapters.length > 0 && descExpanded && (
              <ol className="watch-chapters">
                {v.chapters.map((c) => <li key={c.startSec}><Link to={`/watch/${v.id}?t=${c.startSec}`}>{formatTimestamp(c.startSec)}</Link> {c.title}</li>)}
              </ol>
            )}
            {collapsible && (
              <button type="button" className="watch-description-toggle" onClick={(e) => { e.stopPropagation(); setDescExpanded((x) => !x); }} aria-expanded={descExpanded}>
                {descExpanded ? t('watch.showLess') : t('watch.showMore')}
              </button>
            )}
          </div>
        </div>

        {related.length > 0 && (
          <aside className="watch-sidebar" aria-label={t('watch.relatedVideos')}>
            {fromChannel.length > 0 && (
              <div className="watch-sidebar-chips" role="tablist">
                <button type="button" role="tab" className="chip" aria-selected={relatedFilter === 'all'} onClick={() => setRelatedFilter('all')}>{t('categories.all')}</button>
                <button type="button" role="tab" className="chip" aria-selected={relatedFilter === 'channel'} onClick={() => setRelatedFilter('channel')}>{t('watch.fromChannel', { name: v.channel.name })}</button>
              </div>
            )}
            <div className="watch-sidebar-list">{shownRelated.map((item) => <VideoCard key={item.id} video={item} variant="compact" />)}</div>
          </aside>
        )}
      </div>
      {toast}
    </div>
  );
}

const formatTimestamp = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

/** Password videos: the title stays hidden until the right password unlocks this one video. */
function PasswordGate({ videoId, onUnlocked }: { videoId: string; onUnlocked: (token: string) => void }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { unlockToken } = await videos.unlock(videoId, password);
      onUnlocked(unlockToken);
    } catch (err) {
      setError(isApiError(err, 'WRONG_PASSWORD') ? t('watch.wrongPassword') : errorText(t, err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="container watch-page">
      <form className="empty-state watch-password" onSubmit={(e) => void submit(e)}>
        <MdLock className="empty-state-icon" aria-hidden="true" />
        <p className="empty-state-title">{t('watch.passwordTitle')}</p>
        <p className="empty-state-desc">{t('watch.passwordDesc')}</p>
        <input type="password" className="form-input" value={password} onChange={(e) => setPassword(e.target.value)} aria-label={t('watch.passwordLabel')} autoFocus required />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy || !password}>{t('watch.unlock')}</button>
      </form>
    </div>
  );
}
