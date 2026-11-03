/**
 * Player for third-party iframes. It plays public and unlisted videos open to everyone, as a
 * guest: no cookies are used, so it works where browsers block third-party storage. Anything
 * that needs a login, a password or a membership shows a card that opens the watch page.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdErrorOutline, MdOpenInNew } from 'react-icons/md';
import { videos } from '../api/endpoints';
import type { Playback, VideoDetails } from '../api/types';
import VideoPlayer from '../components/Video/VideoPlayer';
import { Spinner } from '../components/Common/StatusScreen';
import { errorText } from '../lib/errors';
import { parseStartTime } from '../lib/playback';
import './WatchPage.css';
import './EmbedPage.css';

type State = { kind: 'loading' } | { kind: 'card'; title: string | null; reason: 'restricted' | 'missing' } | { kind: 'video'; video: VideoDetails };

export default function EmbedPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [grant, setGrant] = useState<Playback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchUrl = `${window.location.origin}/watch/${encodeURIComponent(id)}`;
  const startTime = useMemo(() => parseStartTime(new URLSearchParams(window.location.search).get('start') ?? new URLSearchParams(window.location.search).get('t')), []);

  useEffect(() => {
    let live = true;
    let found = false;
    (async () => {
      try {
        const { video } = await videos.get(id);
        if (!live) return;
        if (!('title' in video)) return setState({ kind: 'card', title: null, reason: 'restricted' });
        const open = (video.visibility === 'public' || video.visibility === 'unlisted') && video.audience === 'public' && video.locked === null;
        if (!open) return setState({ kind: 'card', title: video.title, reason: 'restricted' });
        found = true;
        setState({ kind: 'video', video });
        setGrant(await videos.playback(id));
      } catch (err) {
        if (!live) return;
        if (found) setError(errorText(t, err));
        else setState({ kind: 'card', title: null, reason: 'missing' });
      }
    })();
    return () => { live = false; };
  }, [id, t]);

  const renew = useCallback(() => videos.playback(id).then((g) => { setGrant(g); return g; }), [id]);
  const onView = useCallback((token: string) => { void videos.view(id, token).catch(() => undefined); }, [id]);
  const onHeartbeat = useCallback((b: { positionSec: number; watchedSec: number; playbackToken: string }) => {
    void videos.heartbeat(id, b.playbackToken, { positionSec: b.positionSec, watchedSec: b.watchedSec }).catch(() => undefined);
  }, [id]);

  if (state.kind === 'loading') return <div className="embed-page embed-center"><Spinner /></div>;
  if (state.kind === 'card') {
    return (
      <div className="embed-page embed-center">
        <div className="embed-card">
          <MdErrorOutline className="embed-card-icon" aria-hidden="true" />
          {state.title && <p className="embed-card-title">{state.title}</p>}
          <p>{state.reason === 'missing' ? t('embed.missing') : t('embed.restricted')}</p>
          {state.reason === 'restricted' && <a className="btn btn-primary" href={watchUrl} target="_blank" rel="noopener">{t('embed.watchOnSite')} <MdOpenInNew aria-hidden="true" /></a>}
        </div>
      </div>
    );
  }
  const v = state.video;
  return (
    <div className="embed-page">
      {error ? (
        <div className="player-placeholder"><MdErrorOutline className="player-placeholder-icon" aria-hidden="true" /><p>{error}</p></div>
      ) : grant ? (
        <VideoPlayer grant={grant} renew={renew} poster={v.thumbnail} previewVtt={v.previewVtt} chapters={v.chapters} startTime={startTime}
          shareUrl={watchUrl} onView={onView} onHeartbeat={onHeartbeat} />
      ) : (
        <div className="player-placeholder"><Spinner /></div>
      )}
      <a className="embed-title" href={watchUrl} target="_blank" rel="noopener">{v.title}</a>
    </div>
  );
}
