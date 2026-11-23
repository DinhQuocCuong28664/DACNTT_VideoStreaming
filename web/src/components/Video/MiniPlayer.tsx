/**
 * The corner player, as on YouTube: a video the viewer was watching keeps playing while they browse
 * other pages. Expanding goes back to the watch page at the same second; closing stops it.
 */
import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdClose, MdOpenInFull } from 'react-icons/md';
import { videos } from '../../api/endpoints';
import type { MiniVideo } from '../../context/miniPlayer';
import VideoPlayer from './VideoPlayer';
import './MiniPlayer.css';

export default function MiniPlayer({ video, onClose }: { video: MiniVideo; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mediaRef = useRef<HTMLVideoElement | null>(null);
  const [grant, setGrant] = useState(video.grant);
  const { videoId, unlockToken } = video;

  const renew = useCallback(() => videos.playback(videoId, unlockToken).then((g) => { setGrant(g); return g; }), [videoId, unlockToken]);
  // The API counts a view once per viewer and video, so reporting again from here is harmless.
  const onView = useCallback((token: string) => { void videos.view(videoId, token).catch(() => undefined); }, [videoId]);
  const onHeartbeat = useCallback((b: { positionSec: number; watchedSec: number; playbackToken: string }) => {
    void videos.heartbeat(videoId, b.playbackToken, { positionSec: b.positionSec, watchedSec: b.watchedSec }).catch(() => undefined);
  }, [videoId]);

  const expand = () => {
    const el = mediaRef.current;
    const at = Math.floor(el?.currentTime ?? video.startAt);
    const playing = el ? !el.paused && !el.ended : video.playing;
    onClose();
    navigate(`/watch/${videoId}${at > 0 ? `?t=${at}` : ''}`, { state: { autoplay: playing } });
  };

  return (
    <section className="mini-player" aria-label={t('mini.label')}>
      <div className="mini-player-video">
        <VideoPlayer
          variant="mini" grant={grant} renew={renew} poster={video.poster} previewVtt={video.previewVtt} chapters={video.chapters}
          startTime={video.startAt} autoPlay={video.playing} mediaRef={mediaRef} onView={onView} onHeartbeat={onHeartbeat}
        />
        <div className="mini-player-actions">
          <button type="button" className="mini-player-btn" onClick={expand} aria-label={t('mini.expand')} title={t('mini.expand')}><MdOpenInFull /></button>
          <button type="button" className="mini-player-btn" onClick={onClose} aria-label={t('mini.close')} title={t('mini.close')}><MdClose /></button>
        </div>
      </div>
      <button type="button" className="mini-player-info" onClick={expand}>
        <span className="mini-player-title">{video.title}</span>
        <span className="mini-player-channel">{video.channelName}</span>
      </button>
    </section>
  );
}
