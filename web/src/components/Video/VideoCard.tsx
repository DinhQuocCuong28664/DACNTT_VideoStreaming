import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FiPlay } from 'react-icons/fi';
import { MdStars } from 'react-icons/md';
import Avatar from '../Common/Avatar';
import type { VideoCard as Card, VideoDetails } from '../../api/types';
import { formatDuration, formatViews, timeAgo } from '../../lib/format';
import './VideoCard.css';

type CardVideo = Card & Partial<Pick<VideoDetails, 'status' | 'processingProgress' | 'moderation' | 'description'>>;

/**
 * YouTube-style video card in three variants: `grid` (home, channel), `compact` (the "Up next"
 * column) and `row` (search results). The title link is stretched over the card, so the whole
 * card is one click target while `menu` sits outside the link.
 */
export default function VideoCard({ video, variant = 'grid', showAvatar = true, menu, thumbnailOverlay }: {
  video: CardVideo;
  variant?: 'grid' | 'compact' | 'row';
  showAvatar?: boolean;
  menu?: ReactNode;
  thumbnailOverlay?: ReactNode;
}) {
  const { t } = useTranslation();
  const [thumbFailed, setThumbFailed] = useState(false);
  const channelName = video.channel.name || t('videoCard.unknownChannel');
  const meta = `${t('videoCard.views', { count: video.views, value: formatViews(video.views) })}${video.publishedAt ? ` · ${timeAgo(t, video.publishedAt)}` : ''}`;
  const membersOnly = video.audience === 'members';

  const avatar = (
    <div className="video-card-avatar">
      <Avatar src={video.channel.avatar} fallbackClassName="mini-avatar">{channelName.charAt(0).toUpperCase()}</Avatar>
    </div>
  );
  const memberTag = membersOnly && (
    <div className="video-card-member-tag"><MdStars aria-hidden="true" /><span>{t('membership.badgeText')}</span></div>
  );

  return (
    <div className={`video-card video-card-${variant}`}>
      <div className="video-card-thumbnail">
        {video.thumbnail && !thumbFailed
          ? <img src={video.thumbnail} alt="" loading="lazy" onError={() => setThumbFailed(true)} />
          : <div className="thumbnail-placeholder"><FiPlay /></div>}
        {(video.durationSec ?? 0) > 0 && <span className="video-duration">{formatDuration(video.durationSec ?? 0)}</span>}
        {video.status === 'PROCESSING' && (
          <span className="video-status-badge video-status-badge-processing">
            {t('videoCard.processing')}{video.processingProgress ? ` (${video.processingProgress}%)` : ''}
          </span>
        )}
        {video.status === 'ERROR' && <span className="video-status-badge video-status-badge-error">{t('videoCard.failed')}</span>}
        {video.moderation?.status === 'removed' && <span className="video-status-badge video-status-badge-error">{t('videoCard.removed')}</span>}
        {video.moderation?.status === 'review' && <span className="video-status-badge">{t('videoCard.underReview')}</span>}
        {video.hasViolence && <span className="video-status-badge video-status-badge-violence">{t('videoCard.violenceBadge')}</span>}
        {thumbnailOverlay}
      </div>

      <div className="video-card-info">
        {variant === 'grid' && showAvatar && avatar}
        <div className="video-card-details">
          <h3 className="video-card-title"><Link to={`/watch/${video.id}`} className="video-card-link">{video.title}</Link></h3>
          {variant === 'row' ? (
            <>
              <p className="video-card-meta">{meta}</p>
              <div className="video-card-channel-row">{avatar}<span className="video-card-channel">{channelName}</span></div>
              {memberTag}
              {video.description && <p className="video-card-description">{video.description}</p>}
            </>
          ) : (
            <>
              <p className="video-card-channel">{channelName}</p>
              <p className="video-card-meta">{meta}</p>
              {memberTag}
            </>
          )}
        </div>
        {menu}
      </div>
    </div>
  );
}

/** Skeleton in the shape of the coming card. */
export function SkeletonCard({ row = false, avatar = true }: { row?: boolean; avatar?: boolean }) {
  return (
    <div className={`skeleton-card ${row ? 'skeleton-card-row' : ''}`} aria-hidden="true">
      <div className="skeleton skeleton-thumb" />
      <div className="skeleton-card-body">
        {!row && avatar && <div className="skeleton skeleton-avatar" />}
        <div className="skeleton-lines"><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line short" /></div>
      </div>
    </div>
  );
}

/** Footer of an infinite list: the sentinel, a keyboard fallback button, or Retry. */
export function LoadMoreFooter({ list }: { list: { hasMore: boolean; status: string; canLoadMore: boolean; loadMore(): void; retry(): void; sentinelRef: React.RefObject<HTMLDivElement | null> } }) {
  const { t } = useTranslation();
  if (!list.hasMore) return null;
  return (
    <div ref={list.sentinelRef} className="load-more">
      {list.status === 'error'
        ? <button type="button" className="btn btn-secondary" onClick={list.retry}>{t('home.retry')}</button>
        : <button type="button" className="btn btn-secondary load-more-btn" onClick={list.loadMore} disabled={!list.canLoadMore}>{t('home.loadMore')}</button>}
    </div>
  );
}
