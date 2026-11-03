import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdErrorOutline, MdOutlineVideoLibrary } from 'react-icons/md';
import { channels } from '../api/endpoints';
import type { ChannelPage as ChannelData, Membership } from '../api/types';
import Avatar from '../components/Common/Avatar';
import { NotFoundPage } from '../components/Common/StatusScreen';
import { useToast } from '../components/Common/Toast';
import VideoCard, { LoadMoreFooter, SkeletonCard } from '../components/Video/VideoCard';
import SubscribeButton from '../components/Channel/SubscribeButton';
import { JoinButton } from '../components/Channel/Membership';
import { useInfiniteList } from '../hooks/useInfiniteList';
import { formatDate } from '../lib/format';
import './ChannelPage.css';

/** A channel at /@handle: banner, header, subscribe and join, its public videos and About. */
export default function ChannelPage({ handle }: { handle: string }) {
  const { t, i18n } = useTranslation();
  const [toast, showToast] = useToast();
  const [data, setData] = useState<ChannelData | null | undefined>(undefined);
  const [tab, setTab] = useState<'videos' | 'about'>('videos');
  const [descExpanded, setDescExpanded] = useState(false);
  const ref = `@${handle}`;

  useEffect(() => {
    let live = true;
    setData(undefined);
    setTab('videos');
    channels.get(ref).then((d) => { if (live) setData(d); }).catch(() => { if (live) setData(null); });
    return () => { live = false; };
  }, [ref]);

  const fetchPage = useCallback(async (cursor: string | null) => {
    const r = await channels.videos(ref, cursor);
    return { items: r.items, next: r.nextCursor };
  }, [ref]);
  const list = useInfiniteList(fetchPage);

  if (data === null) return <NotFoundPage />;
  if (data === undefined) return <div className="channel-page"><div className="skeleton channel-skeleton-header" /></div>;

  const c = data.channel;
  const isOwner = Boolean(data.viewer?.isOwner);
  const setMembership = (m: Membership) => setData((d) => (d ? { ...d, viewer: d.viewer ? { ...d.viewer, membership: m } : d.viewer } : d));

  let videosBody;
  if (list.status === 'loading') videosBody = <div className="video-grid">{Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} avatar={false} />)}</div>;
  else if (list.status === 'error' && list.items.length === 0) {
    videosBody = (
      <div className="empty-state">
        <MdErrorOutline className="empty-state-icon" aria-hidden="true" />
        <p className="empty-state-title">{t('home.loadErrorTitle')}</p>
        <button type="button" className="btn btn-secondary" onClick={list.retry}>{t('home.retry')}</button>
      </div>
    );
  } else if (list.items.length === 0) {
    videosBody = (
      <div className="empty-state">
        <MdOutlineVideoLibrary className="empty-state-icon" aria-hidden="true" />
        <p className="empty-state-title">{isOwner ? t('channel.emptyOwner') : t('channel.empty')}</p>
        {isOwner && <Link to="/upload" className="btn btn-primary">{t('home.emptyAction')}</Link>}
      </div>
    );
  } else {
    videosBody = (
      <>
        <div className="video-grid">{list.items.map((v) => <VideoCard key={v.id} video={v} showAvatar={false} />)}</div>
        <LoadMoreFooter list={list} />
      </>
    );
  }

  return (
    <div className="channel-page">
      {c.banner && <div className="channel-banner"><img src={c.banner} alt="" /></div>}
      <header className="channel-header">
        <Avatar src={c.avatar} className="channel-header-avatar" fallbackClassName="avatar-placeholder channel-header-avatar">{c.displayName.charAt(0).toUpperCase()}</Avatar>
        <div className="channel-header-text">
          <h1 className="channel-header-name">{c.displayName}</h1>
          <p className="channel-header-meta">
            <span className="channel-header-handle">@{c.handle}</span>
            <span>{t('subscription.subscribersCount', { count: c.subscribers })}</span>
            <span>{t('channel.videoCount', { count: c.videos })}</span>
          </p>
          {c.description && (
            <button type="button" className={`channel-header-desc ${descExpanded ? 'is-expanded' : ''}`} onClick={() => setDescExpanded((v) => !v)} aria-expanded={descExpanded}>{c.description}</button>
          )}
          <div className="channel-header-actions">
            {isOwner ? (
              <>
                <Link to="/settings" className="btn btn-secondary">{t('channel.customize')}</Link>
                <Link to="/studio" className="btn btn-secondary">{t('channel.manageVideos')}</Link>
              </>
            ) : (
              <>
                <JoinButton channel={{ id: c.id, name: c.displayName, avatar: c.avatar }} tiers={data.tiers} membership={data.viewer?.membership ?? null} onChange={setMembership} notify={showToast} />
                <SubscribeButton channelId={c.id} channelName={c.displayName} subscribed={Boolean(data.viewer?.subscribed)}
                  onChange={(s) => setData((d) => (d ? { ...d, channel: { ...d.channel, subscribers: s.subscribers }, viewer: d.viewer ? { ...d.viewer, subscribed: s.subscribed } : d.viewer } : d))} />
              </>
            )}
          </div>
        </div>
      </header>

      <div className="channel-tabs" role="tablist">
        <button type="button" role="tab" className="channel-tab" aria-selected={tab === 'videos'} onClick={() => setTab('videos')}>{t('channel.videos')}</button>
        <button type="button" role="tab" className="channel-tab" aria-selected={tab === 'about'} onClick={() => setTab('about')}>{t('channel.about')}</button>
      </div>

      {tab === 'videos' ? (
        <section className="channel-videos" role="tabpanel">{videosBody}</section>
      ) : (
        <section className="channel-about" role="tabpanel">
          <h2 className="channel-about-heading">{t('channel.description')}</h2>
          <p className="channel-about-desc">{c.description || t('channel.noDescription')}</p>
          <h2 className="channel-about-heading">{t('channel.stats')}</h2>
          <ul className="channel-about-stats">
            <li>{t('channel.joined', { date: formatDate(i18n.resolvedLanguage ?? 'vi', c.createdAt) })}</li>
            <li>{t('channel.videoCount', { count: c.videos })}</li>
          </ul>
        </section>
      )}
      {toast}
    </div>
  );
}
