/**
 * Card shown over the player when a video ends with autoplay on: the next video starts after a
 * short countdown unless the viewer cancels it or plays it at once.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MdClose, MdPlayArrow } from 'react-icons/md';
import type { VideoCard } from '../../api/types';
import './UpNext.css';

export const UP_NEXT_SECONDS = 8;

export default function UpNext({ video, onPlay, onCancel }: { video: VideoCard; onPlay: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [left, setLeft] = useState(UP_NEXT_SECONDS);
  // A new callback on each render of the page must not restart the second that is running.
  const play = useRef(onPlay);
  play.current = onPlay;

  useEffect(() => {
    if (left <= 0) { play.current(); return undefined; }
    const timer = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);

  return (
    <div className="up-next" role="dialog" aria-labelledby="up-next-title">
      <p className="up-next-label" aria-live="polite">{t('watch.upNextIn', { count: left })}</p>
      <div className="up-next-card">
        {video.thumbnail && <img className="up-next-thumb" src={video.thumbnail} alt="" />}
        <div>
          <p id="up-next-title" className="up-next-title">{video.title}</p>
          <p className="up-next-channel">{video.channel.name}</p>
        </div>
      </div>
      <div className="up-next-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}><MdClose aria-hidden="true" /><span>{t('common.cancel')}</span></button>
        <button type="button" className="btn btn-primary" onClick={onPlay} autoFocus><MdPlayArrow aria-hidden="true" /><span>{t('watch.playNow')}</span></button>
      </div>
    </div>
  );
}
