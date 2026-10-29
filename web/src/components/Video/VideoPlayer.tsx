/**
 * hls.js player with custom controls (YouTube-like chrome), adaptive bitrate and v2 playback:
 *  - every request to the CDN host gets the CloudFront policy query (never the API host);
 *  - the AES-128 key request carries the playback token header;
 *  - a 403 from the CDN asks the page for a fresh grant and reloads the source in place;
 *  - side-loaded WebVTT captions, chapter marks and the sprite seek preview;
 *  - the 30-second view rule and a heartbeat a minute for resume and analytics.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import Hls, { type Level } from 'hls.js';
import {
  FiCheck, FiChevronLeft, FiChevronRight, FiClock, FiCode, FiLink, FiMaximize, FiMinimize, FiPause, FiPlay, FiRepeat, FiSettings,
  FiVolume1, FiVolume2, FiVolumeX,
} from 'react-icons/fi';
import { MdClosedCaption, MdClosedCaptionOff } from 'react-icons/md';
import type { Playback } from '../../api/types';
import { addWatched, cueAt, parseSpriteVtt, qualityLabel, reachedView, signUrl, withStartTime, type SpriteCue } from '../../lib/playback';
import './VideoPlayer.css';

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const CONTEXT_MENU_GAP = 8;
const NOTICE_MS = 2000;
/** Every recovery path is bounded: an error that never clears must not loop forever. */
const MAX_NETWORK_RETRIES = 3;
const MAX_MEDIA_RECOVERIES = 2;
const MAX_GRANT_RENEWALS = 2;
const NETWORK_RETRY_DELAYS_MS = [1000, 3000, 7000];
export const HEARTBEAT_MS = 60_000;

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(Math.floor(seconds % 60)).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

const PiPIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="14" rx="2" /><rect x="12" y="11" width="7" height="5" rx="1" fill="currentColor" stroke="none" />
  </svg>
);

export interface VideoPlayerProps {
  grant: Playback;
  /** Asks the API for a new grant (the policy expired or the CDN refused). */
  renew: () => Promise<Playback>;
  poster?: string | null;
  /** Path of the seek-preview VTT on the CDN, or null. */
  previewVtt?: string | null;
  chapters?: { startSec: number; title: string }[];
  startTime?: number | null;
  shareUrl?: string | null;
  /** The iframe snippet offered as "Copy embed code"; null hides the item. */
  embedCode?: string | null;
  onView?: (playbackToken: string) => void;
  onHeartbeat?: (b: { positionSec: number; watchedSec: number; playbackToken: string }) => void;
}

export default function VideoPlayer({ grant, renew, poster, previewVtt, chapters = [], startTime = null, shareUrl = null, embedCode = null, onView, onHeartbeat }: VideoPlayerProps) {
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const grantRef = useRef(grant);
  const renewRef = useRef(renew);
  const onViewRef = useRef(onView);
  const onHeartbeatRef = useRef(onHeartbeat);
  useEffect(() => { renewRef.current = renew; onViewRef.current = onView; onHeartbeatRef.current = onHeartbeat; }, [renew, onView, onHeartbeat]);

  const viewReportedRef = useRef(false);
  const watchedRef = useRef(0);
  const sinceBeatRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);
  const retries = useRef({ network: 0, media: 0, grant: 0 });
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const swallowClickUntil = useRef(0);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const [levels, setLevels] = useState<Level[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [autoLevel, setAutoLevel] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPiP, setIsPiP] = useState(false);
  const [captionLang, setCaptionLang] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsView, setSettingsView] = useState<'main' | 'speed' | 'quality' | 'captions'>('main');
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ time: number; pos: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isLooping, setIsLooping] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sprites, setSprites] = useState<SpriteCue[]>([]);

  const cdnOrigin = new URL(grant.masterUrl).origin;
  const signed = useCallback((url: string) => signUrl(url, cdnOrigin, grantRef.current.cdnQuery), [cdnOrigin]);

  // ── Source and hls.js ─────────────────────────────────────────────────────────────────
  const masterUrl = grant.masterUrl;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    grantRef.current = grant;
    viewReportedRef.current = false;
    watchedRef.current = 0;
    sinceBeatRef.current = 0;
    lastTimeRef.current = null;
    retries.current = { network: 0, media: 0, grant: 0 };
    setPlaybackError(null);

    if (!Hls.isSupported()) {
      // Native HLS cannot add the signed query to segment requests.
      setPlaybackError(tRef.current('player.unplayable'));
      return undefined;
    }

    const hls = new Hls({
      startLevel: -1,
      capLevelToPlayerSize: true,
      xhrSetup: (xhr, url) => {
        // The key URL is on the API host: add the playback token there, the CDN query nowhere else.
        if (new URL(url).origin === cdnOrigin) {
          xhr.open('GET', signUrl(url, cdnOrigin, grantRef.current.cdnQuery), true);
        } else if (url.includes('/key')) {
          xhr.open('GET', url, true);
          xhr.setRequestHeader('X-Playback-Token', grantRef.current.playbackToken);
        }
      },
    });
    hlsRef.current = hls;
    hls.loadSource(masterUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => setLevels(data.levels));
    hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => setCurrentLevel(data.level));
    hls.on(Hls.Events.FRAG_LOADED, () => {
      retries.current.network = 0;
      retries.current.media = 0;
      setPlaybackError((prev) => (prev === null ? prev : null));
    });

    const giveUp = (message: string) => {
      setPlaybackError(message);
      hls.destroy();
      if (hlsRef.current === hls) hlsRef.current = null;
    };

    hls.on(Hls.Events.ERROR, (_e, data) => {
      const status = (data.response as { code?: number } | undefined)?.code;
      // 403 means the grant expired or was refused; retrying the same URL never helps.
      // Checked before `fatal`, because hls.js marks the first 403s as non-fatal.
      if (status === 403 || status === 401) {
        if (retries.current.grant >= MAX_GRANT_RENEWALS) return giveUp(tRef.current('player.authFailed'));
        retries.current.grant += 1;
        setPlaybackError(tRef.current('player.renewing'));
        renewRef.current()
          .then((next) => {
            if (hlsRef.current !== hls) return;
            grantRef.current = next;
            setPlaybackError(null);
            // Reload the source: a refused manifest leaves nothing for startLoad() to resume.
            const at = video.currentTime;
            hls.loadSource(next.masterUrl);
            hls.once(Hls.Events.MANIFEST_PARSED, () => { video.currentTime = at; });
            hls.startLoad();
          })
          .catch(() => giveUp(tRef.current('player.forbidden')));
        return undefined;
      }
      if (!data.fatal) return undefined;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        if (retries.current.network >= MAX_NETWORK_RETRIES) return giveUp(tRef.current('player.networkFatal'));
        const delay = NETWORK_RETRY_DELAYS_MS.at(retries.current.network) ?? 7000;
        retries.current.network += 1;
        setPlaybackError(tRef.current('player.networkRetry'));
        clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => { if (hlsRef.current === hls) hls.startLoad(); }, delay);
        return undefined;
      }
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        if (retries.current.media >= MAX_MEDIA_RECOVERIES) return giveUp(tRef.current('player.mediaFatal'));
        retries.current.media += 1;
        setPlaybackError(tRef.current('player.mediaRetry'));
        hls.recoverMediaError();
        return undefined;
      }
      return giveUp(tRef.current('player.unplayable'));
    });

    return () => {
      clearTimeout(retryTimer.current);
      hls.destroy();
      if (hlsRef.current === hls) hlsRef.current = null;
    };
    // The grant object changes on renewal; only a new master URL rebuilds the player.
  }, [masterUrl, cdnOrigin]);

  // ── Seek preview sprites ──────────────────────────────────────────────────────────────
  useEffect(() => {
    setSprites([]);
    if (!previewVtt) return undefined;
    const url = new URL(previewVtt, `${cdnOrigin}/`).toString();
    let live = true;
    fetch(signed(url)).then((r) => (r.ok ? r.text() : '')).then((text) => { if (live && text) setSprites(parseSpriteVtt(text, url)); }).catch(() => undefined);
    return () => { live = false; };
  }, [previewVtt, cdnOrigin, signed]);

  // ── Element events: time, view rule, heartbeat ────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const report = () => {
      if (viewReportedRef.current) return;
      viewReportedRef.current = true;
      onViewRef.current?.(grantRef.current.playbackToken);
    };
    const beat = () => {
      if (sinceBeatRef.current <= 0) return;
      onHeartbeatRef.current?.({ positionSec: video.currentTime, watchedSec: Math.round(sinceBeatRef.current), playbackToken: grantRef.current.playbackToken });
      sinceBeatRef.current = 0;
    };
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      const playing = !video.paused && !video.seeking;
      const before = watchedRef.current;
      watchedRef.current = addWatched(watchedRef.current, lastTimeRef.current, video.currentTime, playing);
      sinceBeatRef.current += watchedRef.current - before;
      lastTimeRef.current = video.currentTime;
      if (reachedView(watchedRef.current, video.duration)) report();
    };
    const onEnded = () => { setIsPlaying(false); if (reachedView(watchedRef.current, video.duration)) report(); beat(); };
    const onPause = () => { setIsPlaying(false); beat(); };
    const handlers: [string, () => void][] = [
      ['timeupdate', onTimeUpdate],
      ['seeked', () => { lastTimeRef.current = video.currentTime; }],
      ['loadedmetadata', () => setDuration(video.duration || 0)],
      ['durationchange', () => setDuration(video.duration || 0)],
      ['progress', () => { if (video.buffered.length > 0) setBuffered(video.buffered.end(video.buffered.length - 1)); }],
      ['play', () => setIsPlaying(true)],
      ['pause', onPause],
      ['ended', onEnded],
      ['volumechange', () => { setVolume(video.volume); setMuted(video.muted); }],
      ['enterpictureinpicture', () => setIsPiP(true)],
      ['leavepictureinpicture', () => setIsPiP(false)],
    ];
    for (const [name, fn] of handlers) video.addEventListener(name, fn);
    const interval = setInterval(beat, HEARTBEAT_MS);
    const onHide = () => { if (document.visibilityState === 'hidden') beat(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      for (const [name, fn] of handlers) video.removeEventListener(name, fn);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onHide);
      beat();
    };
  }, [masterUrl]);

  // ── Start position from ?t= ────────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !startTime || startTime <= 0) return undefined;
    const seek = () => {
      const end = video.duration;
      video.currentTime = Number.isFinite(end) && end > 0 ? Math.min(startTime, Math.max(end - 1, 0)) : startTime;
    };
    if (video.readyState >= 1) { seek(); return undefined; }
    video.addEventListener('loadedmetadata', seek, { once: true });
    return () => video.removeEventListener('loadedmetadata', seek);
  }, [masterUrl, startTime]);

  // ── Captions: one track shown at a time ───────────────────────────────────────────────
  useEffect(() => {
    const tracks = videoRef.current?.textTracks;
    if (!tracks) return;
    for (const track of Array.from(tracks)) track.mode = track.language === captionLang ? 'showing' : 'disabled';
  }, [captionLang, grant.captions]);

  // ── Menus, fullscreen, auto-hide ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!showSettings) return undefined;
    const onDocClick = (e: globalThis.MouseEvent) => { if (!(e.target as Element).closest('.settings-wrapper')) setShowSettings(false); };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [showSettings]);

  useLayoutEffect(() => {
    const menu = contextMenuRef.current;
    const wrapper = wrapperRef.current;
    if (!contextMenu || !menu || !wrapper) return;
    const maxX = wrapper.clientWidth - menu.offsetWidth - CONTEXT_MENU_GAP;
    const maxY = wrapper.clientHeight - menu.offsetHeight - CONTEXT_MENU_GAP;
    menu.style.left = `${Math.max(CONTEXT_MENU_GAP, Math.min(contextMenu.x, maxX))}px`;
    menu.style.top = `${Math.max(CONTEXT_MENU_GAP, Math.min(contextMenu.y, maxY))}px`;
    menu.querySelector<HTMLElement>('[role^="menuitem"]')?.focus({ preventScroll: true });
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu) return undefined;
    const close = () => setContextMenu(null);
    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 2 || contextMenuRef.current?.contains(e.target as Node)) return;
      // The press that closes the menu must not also pause or seek.
      if (wrapperRef.current?.contains(e.target as Node)) swallowClickUntil.current = performance.now() + 1000;
      close();
    };
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', close);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, [contextMenu]);

  useEffect(() => {
    const onClickCapture = (e: globalThis.MouseEvent) => {
      if (performance.now() > swallowClickUntil.current) return;
      swallowClickUntil.current = 0;
      if (!wrapperRef.current?.contains(e.target as Node)) return;
      e.stopPropagation();
      e.preventDefault();
    };
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('click', onClickCapture, true);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      document.removeEventListener('click', onClickCapture, true);
      document.removeEventListener('fullscreenchange', onFs);
      clearTimeout(noticeTimer.current);
    };
  }, []);

  const scheduleHide = useCallback(() => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { if (isPlaying && !showSettings) setShowControls(false); }, 2800);
  }, [isPlaying, showSettings]);
  const handleActivity = useCallback(() => { setShowControls(true); scheduleHide(); }, [scheduleHide]);
  useEffect(() => {
    if (isPlaying) scheduleHide();
    else { clearTimeout(hideTimer.current); setShowControls(true); }
    return () => clearTimeout(hideTimer.current);
  }, [isPlaying, scheduleHide]);

  // ── Controls ───────────────────────────────────────────────────────────────────────────
  const video = () => videoRef.current;
  const togglePlay = () => { const v = video(); if (v) { if (v.paused) void v.play(); else v.pause(); } };
  const seekTo = (fraction: number) => { const v = video(); if (v && duration) v.currentTime = Math.min(Math.max(fraction, 0), 1) * duration; };
  const fractionOf = (e: MouseEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); return Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1); };
  const toggleMute = () => { const v = video(); if (v) v.muted = !v.muted; };
  const setLevel = (index: number) => { if (hlsRef.current) hlsRef.current.currentLevel = index; setAutoLevel(index === -1); setSettingsView('main'); setShowSettings(false); };
  const changeRate = (r: number) => { const v = video(); if (v) { v.playbackRate = r; setRate(r); } setSettingsView('main'); setShowSettings(false); };
  const togglePiP = async () => {
    const v = video();
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (v && document.pictureInPictureEnabled) await v.requestPictureInPicture();
    } catch { /* not critical */ }
    setShowSettings(false);
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await wrapperRef.current?.requestFullscreen();
    } catch { /* denied */ }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const v = video();
    if (!v) return;
    switch (e.key) {
      case ' ': case 'k': e.preventDefault(); togglePlay(); break;
      case 'ArrowRight': v.currentTime = Math.min(v.currentTime + 5, duration); break;
      case 'ArrowLeft': v.currentTime = Math.max(v.currentTime - 5, 0); break;
      case 'ArrowUp': e.preventDefault(); v.volume = Math.min(v.volume + 0.1, 1); break;
      case 'ArrowDown': e.preventDefault(); v.volume = Math.max(v.volume - 0.1, 0); break;
      case 'm': toggleMute(); break;
      case 'f': void toggleFullscreen(); break;
      case 'c': if (grant.captions.length) setCaptionLang((l) => (l ? null : grant.captions[0]?.lang ?? null)); break;
      default: break;
    }
    handleActivity();
  };
  const showNotice = (message: string) => { clearTimeout(noticeTimer.current); setNotice(message); noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS); };
  const onContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    if (contextMenu) { setContextMenu(null); return; }
    e.preventDefault();
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    setShowSettings(false);
    setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };
  const closeContextMenu = () => { setContextMenu(null); wrapperRef.current?.focus({ preventScroll: true }); };
  const onContextMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const items = Array.from(contextMenuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const focusAt = (i: number) => items.at((i + items.length) % items.length)?.focus();
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); closeContextMenu(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); focusAt(index + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusAt(index - 1); }
  };
  const copyText = async (text: string, done: string) => {
    closeContextMenu();
    try {
      await navigator.clipboard.writeText(text);
      showNotice(done);
    } catch {
      showNotice(t('player.copyFailed'));
    }
  };
  const copyUrl = (atTime: boolean) => {
    if (shareUrl) void copyText(withStartTime(shareUrl, atTime ? video()?.currentTime ?? 0 : 0), t('player.linkCopied'));
  };

  const level = levels.at(currentLevel);
  const currentQuality = autoLevel ? `Auto${level ? ` (${qualityLabel(level.width, level.height)})` : ''}` : level ? qualityLabel(level.width, level.height) : 'Auto';
  const VolumeIcon = muted || volume === 0 ? FiVolumeX : volume < 0.5 ? FiVolume1 : FiVolume2;
  const playedPct = duration ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered / duration) * 100 : 0;
  const hoverCue = hover ? cueAt(sprites, hover.time) : undefined;
  const hoverChapter = hover ? [...chapters].reverse().find((c) => c.startSec <= hover.time) : undefined;

  return (
    <div
      ref={wrapperRef}
      className={`video-player-wrapper ${showControls ? '' : 'controls-hidden'}`}
      onMouseMove={handleActivity}
      onMouseLeave={() => { if (isPlaying) setShowControls(false); }}
      onKeyDown={onKeyDown}
      onContextMenu={onContextMenu}
      tabIndex={0}
    >
      <video ref={videoRef} className="video-element" poster={poster ?? undefined} playsInline crossOrigin="anonymous" onClick={togglePlay}>
        {grant.captions.map((c) => <track key={c.lang} kind="subtitles" srcLang={c.lang} label={c.label} src={signed(c.url)} />)}
      </video>

      {!isPlaying && !playbackError && <button className="center-play-btn" onClick={togglePlay} aria-label={t('player.playVideo')}><FiPlay /></button>}
      {playbackError && <div className="video-error-overlay" role="alert"><p>{playbackError}</p></div>}
      <div className="player-notice-region" role="status" aria-live="polite">{notice && <div className="player-notice">{notice}</div>}</div>

      {contextMenu && (
        <div ref={contextMenuRef} className="player-context-menu" role="menu" aria-label={t('player.contextMenu')} onKeyDown={onContextMenuKeyDown} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          <button type="button" role="menuitemcheckbox" aria-checked={isLooping} tabIndex={-1} className="player-context-item"
            onClick={() => { const v = video(); if (v) { v.loop = !v.loop; setIsLooping(v.loop); } closeContextMenu(); }}>
            <FiRepeat aria-hidden="true" /><span>{t('player.loop')}</span>{isLooping && <FiCheck className="player-context-check" aria-hidden="true" />}
          </button>
          {shareUrl && (
            <>
              <button type="button" role="menuitem" tabIndex={-1} className="player-context-item" onClick={() => copyUrl(false)}><FiLink aria-hidden="true" /><span>{t('player.copyUrl')}</span></button>
              <button type="button" role="menuitem" tabIndex={-1} className="player-context-item" onClick={() => copyUrl(true)}><FiClock aria-hidden="true" /><span>{t('player.copyUrlAtTime')}</span></button>
              {embedCode && <button type="button" role="menuitem" tabIndex={-1} className="player-context-item" onClick={() => void copyText(embedCode, t('player.embedCopied'))}><FiCode aria-hidden="true" /><span>{t('player.copyEmbed')}</span></button>}
            </>
          )}
        </div>
      )}

      <div className="video-controls-bar" onClick={(e) => e.stopPropagation()}>
        <div
          className="player-progress-container"
          onClick={(e) => seekTo(fractionOf(e))}
          onMouseMove={(e) => { const f = fractionOf(e); setHover({ time: f * duration, pos: f * 100 }); }}
          onMouseLeave={() => setHover(null)}
        >
          {hover && (
            <div className="player-scrub-tooltip" style={{ left: `${hover.pos}%` }}>
              {hoverCue ? (
                <div className="player-scrub-preview" style={{ width: hoverCue.w, height: hoverCue.h, backgroundImage: `url("${signed(hoverCue.url)}")`, backgroundPosition: `-${hoverCue.x}px -${hoverCue.y}px` }} />
              ) : poster ? <div className="player-scrub-preview"><img src={poster} alt="" /></div> : null}
              {hoverChapter && <span className="player-scrub-chapter">{hoverChapter.title}</span>}
              <span className="player-scrub-time">{formatTime(hover.time)}</span>
            </div>
          )}
          <div className="player-progress-track" />
          <div className="player-progress-buffered" style={{ width: `${bufferedPct}%` }} />
          <div className="player-progress-played" style={{ width: `${playedPct}%` }} />
          {duration > 0 && chapters.slice(1).map((c) => <div key={c.startSec} className="player-chapter-gap" style={{ left: `${(c.startSec / duration) * 100}%` }} />)}
          <div className="player-progress-thumb" style={{ left: `${playedPct}%` }} />
        </div>

        <div className="controls-row">
          <button className="control-btn" onClick={togglePlay} aria-label={isPlaying ? t('player.pause') : t('player.play')}>{isPlaying ? <FiPause /> : <FiPlay />}</button>
          <div className="volume-control">
            <button className="control-btn" onClick={toggleMute} aria-label={t('player.toggleMute')}><VolumeIcon /></button>
            <input className="volume-slider" type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} aria-label={t('player.volume')}
              onChange={(e) => { const v = video(); if (v) { v.volume = Number(e.target.value); v.muted = v.volume === 0; } }} />
          </div>
          <span className="time-display">{formatTime(currentTime)} / {formatTime(duration)}</span>
          <div className="spacer" />
          {grant.captions.length > 0 && (
            <button className="control-btn" onClick={() => setCaptionLang((l) => (l ? null : grant.captions[0]?.lang ?? null))} aria-pressed={captionLang !== null} aria-label={t('player.captions')}>
              {captionLang ? <MdClosedCaption /> : <MdClosedCaptionOff />}
            </button>
          )}
          <div className="settings-wrapper">
            <button className="control-btn" onClick={() => { setShowSettings((s) => !s); setSettingsView('main'); }} aria-label={t('player.settingsAria')} title={t('player.settings')}><FiSettings /></button>
            {showSettings && (
              <div className="settings-menu">
                {settingsView === 'main' && (
                  <>
                    <button className="settings-option" onClick={() => setSettingsView('speed')}>
                      <span>{t('player.speed')}</span><span className="settings-option-value">{rate === 1 ? t('player.speedNormal') : `${rate}x`} <FiChevronRight /></span>
                    </button>
                    {levels.length > 1 && (
                      <button className="settings-option" onClick={() => setSettingsView('quality')}>
                        <span>{t('player.quality')}</span><span className="settings-option-value">{currentQuality} <FiChevronRight /></span>
                      </button>
                    )}
                    {grant.captions.length > 0 && (
                      <button className="settings-option" onClick={() => setSettingsView('captions')}>
                        <span>{t('player.captions')}</span>
                        <span className="settings-option-value">{grant.captions.find((c) => c.lang === captionLang)?.label ?? t('player.captionsOff')} <FiChevronRight /></span>
                      </button>
                    )}
                    {document.pictureInPictureEnabled && (
                      <button className={`settings-option ${isPiP ? 'active' : ''}`} onClick={() => void togglePiP()}>
                        <span className="settings-option-icon-label"><PiPIcon /> Picture-in-Picture</span>{isPiP && <FiCheck />}
                      </button>
                    )}
                  </>
                )}
                {settingsView === 'speed' && (
                  <>
                    <button className="settings-menu-header" onClick={() => setSettingsView('main')}><FiChevronLeft /> {t('player.speed')}</button>
                    {PLAYBACK_RATES.map((r) => (
                      <button key={r} className={`settings-option ${rate === r ? 'active' : ''}`} onClick={() => changeRate(r)}>
                        <span>{r === 1 ? t('player.speedNormal') : `${r}x`}</span>{rate === r && <FiCheck />}
                      </button>
                    ))}
                  </>
                )}
                {settingsView === 'quality' && (
                  <>
                    <button className="settings-menu-header" onClick={() => setSettingsView('main')}><FiChevronLeft /> {t('player.quality')}</button>
                    <button className={`settings-option ${autoLevel ? 'active' : ''}`} onClick={() => setLevel(-1)}><span>Auto</span>{autoLevel && <FiCheck />}</button>
                    {levels.map((l, i) => ({ l, i })).reverse().map(({ l, i }) => (
                      <button key={i} className={`settings-option ${!autoLevel && currentLevel === i ? 'active' : ''}`} onClick={() => setLevel(i)}>
                        <span>{qualityLabel(l.width, l.height)}</span>{!autoLevel && currentLevel === i && <FiCheck />}
                      </button>
                    ))}
                  </>
                )}
                {settingsView === 'captions' && (
                  <>
                    <button className="settings-menu-header" onClick={() => setSettingsView('main')}><FiChevronLeft /> {t('player.captions')}</button>
                    <button className={`settings-option ${captionLang === null ? 'active' : ''}`} onClick={() => { setCaptionLang(null); setShowSettings(false); }}>
                      <span>{t('player.captionsOff')}</span>{captionLang === null && <FiCheck />}
                    </button>
                    {grant.captions.map((c) => (
                      <button key={c.lang} className={`settings-option ${captionLang === c.lang ? 'active' : ''}`} onClick={() => { setCaptionLang(c.lang); setShowSettings(false); }}>
                        <span>{c.label}</span>{captionLang === c.lang && <FiCheck />}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
          <button className="control-btn" onClick={() => void toggleFullscreen()} aria-label={t('player.fullscreen')}>{isFullscreen ? <FiMinimize /> : <FiMaximize />}</button>
        </div>
      </div>
    </div>
  );
}
