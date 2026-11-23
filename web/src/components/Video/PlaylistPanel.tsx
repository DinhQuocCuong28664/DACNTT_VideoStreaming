/**
 * The playlist beside the player, as on YouTube: where the video is in the list, every video of
 * it in play order, and the loop and shuffle switches.
 */
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdLock, MdPlayArrow, MdRepeat, MdShuffle } from 'react-icons/md';
import type { PlaylistItem } from '../../api/types';
import { formatDuration } from '../../lib/format';
import { queuePosition } from '../../lib/queue';
import './PlaylistPanel.css';

export interface PlaylistPanelProps {
  listId: string;
  title: string;
  items: PlaylistItem[];
  /** Ids of the playable videos in play order. */
  order: string[];
  currentId: string;
  shuffle: boolean;
  loop: boolean;
  onShuffle: () => void;
  onLoop: () => void;
}

export default function PlaylistPanel({ listId, title, items, order, currentId, shuffle, loop, onShuffle, onLoop }: PlaylistPanelProps) {
  const { t } = useTranslation();
  const currentRef = useRef<HTMLLIElement>(null);
  const byId = new Map(items.map((i) => [i.id, i]));
  // Shuffled: the play order; otherwise the list as saved, with unavailable videos in place.
  const shown = shuffle ? order.flatMap((id) => { const i = byId.get(id); return i ? [i] : []; }) : items;
  const position = queuePosition(order, currentId);

  // Keep the video being watched in view inside the scrolling list.
  useEffect(() => {
    const row = currentRef.current;
    const box = row?.parentElement;
    if (row && box) box.scrollTop = row.offsetTop - box.offsetTop - box.clientHeight / 2 + row.clientHeight / 2;
  }, [currentId, shuffle]);

  return (
    <section className="playlist-panel" aria-label={t('watch.playlistPanel', { name: title })}>
      <header className="playlist-panel-header">
        <div className="playlist-panel-heading">
          <Link to={`/playlist/${listId}`} className="playlist-panel-title">{title}</Link>
          {position && <span className="playlist-panel-position tabular-nums">{position.index} / {position.total}</span>}
        </div>
        <div className="playlist-panel-actions">
          <button type="button" className="btn-icon" onClick={onLoop} aria-pressed={loop} aria-label={t('watch.loopPlaylist')} title={t('watch.loopPlaylist')}><MdRepeat /></button>
          <button type="button" className="btn-icon" onClick={onShuffle} aria-pressed={shuffle} aria-label={t('watch.shufflePlaylist')} title={t('watch.shufflePlaylist')}><MdShuffle /></button>
        </div>
      </header>
      <ol className="playlist-panel-list">
        {shown.map((item, i) => {
          const current = item.id === currentId;
          return (
            <li key={item.id} ref={current ? currentRef : undefined} className={`playlist-panel-row${current ? ' is-current' : ''}`}>
              <span className="playlist-panel-index tabular-nums" aria-hidden="true">{current ? <MdPlayArrow /> : i + 1}</span>
              {item.unavailable ? (
                <span className="playlist-panel-unavailable"><MdLock aria-hidden="true" /> {t('common.unavailable')}</span>
              ) : (
                <Link to={`/watch/${item.id}?list=${listId}`} className="playlist-panel-link" aria-current={current ? 'true' : undefined}>
                  <span className="playlist-panel-thumb">
                    {item.thumbnail ? <img src={item.thumbnail} alt="" loading="lazy" /> : null}
                    {item.durationSec ? <span className="video-duration">{formatDuration(item.durationSec)}</span> : null}
                  </span>
                  <span className="playlist-panel-text">
                    <span className="playlist-panel-name">{item.title}</span>
                    <span className="playlist-panel-channel">{item.channel.name}</span>
                  </span>
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
