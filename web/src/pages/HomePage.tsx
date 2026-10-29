import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdErrorOutline, MdOutlineSearchOff, MdOutlineVideoLibrary } from 'react-icons/md';
import { discovery, videos } from '../api/endpoints';
import { CATEGORIES, type Category, type Channel, type VideoCard as Card } from '../api/types';
import VideoCard, { LoadMoreFooter, SkeletonCard } from '../components/Video/VideoCard';
import Avatar from '../components/Common/Avatar';
import { useInfiniteList } from '../hooks/useInfiniteList';
import { formatViews } from '../lib/format';
import './HomePage.css';

const isCategory = (v: string | null): v is Category => (CATEGORIES as readonly string[]).includes(v ?? '');

/**
 * Home (YouTube style): a sticky chip bar of categories over a grid with infinite scroll. At
 * /results?q= the same page shows Atlas Search results as rows, with matching channels first.
 */
export default function HomePage() {
  const { t } = useTranslation();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const rawCategory = params.get('category');
  const category = isCategory(rawCategory) ? rawCategory : null;
  const query = location.pathname === '/results' ? (params.get('q') ?? '').trim() : '';
  const isSearch = query.length > 0;
  const [channels, setChannels] = useState<Channel[]>([]);

  // Search pages by number; the list hook speaks cursors, so the page number is the cursor.
  const fetchPage = useCallback(async (cursor: string | null) => {
    if (isSearch) {
      const page = cursor ? Number(cursor) : 1;
      const r = await discovery.search(query, page, category);
      if (page === 1) setChannels(r.channels);
      return { items: r.items, next: r.nextPage ? String(r.nextPage) : null };
    }
    const r = await videos.list({ cursor, category });
    return { items: r.items, next: r.nextCursor };
  }, [isSearch, query, category]);

  const list = useInfiniteList<Card>(fetchPage);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [fetchPage]);

  const selectCategory = (c: Category | null) => {
    const next = new URLSearchParams(params);
    if (c) next.set('category', c);
    else next.delete('category');
    setParams(next);
  };

  const listClass = isSearch ? 'video-list' : 'video-grid';
  const isFiltered = isSearch || category !== null;

  let body;
  if (list.status === 'loading') {
    body = <div className={listClass}>{Array.from({ length: isSearch ? 4 : 8 }, (_, i) => <SkeletonCard key={i} row={isSearch} />)}</div>;
  } else if (list.status === 'error' && list.items.length === 0) {
    body = (
      <div className="empty-state">
        <MdErrorOutline className="empty-state-icon" aria-hidden="true" />
        <p className="empty-state-title">{t('home.loadErrorTitle')}</p>
        <button type="button" className="btn btn-secondary" onClick={list.retry}>{t('home.retry')}</button>
      </div>
    );
  } else if (list.items.length === 0) {
    body = (
      <div className="empty-state">
        {isFiltered ? <MdOutlineSearchOff className="empty-state-icon" aria-hidden="true" /> : <MdOutlineVideoLibrary className="empty-state-icon" aria-hidden="true" />}
        <p className="empty-state-title">{isFiltered ? t('home.emptyFilteredTitle') : t('home.emptyTitle')}</p>
        <p className="empty-state-desc">{isFiltered ? t('home.emptyFilteredDesc') : t('home.emptyDesc')}</p>
        {!isFiltered && <Link to="/upload" className="btn btn-primary">{t('home.emptyAction')}</Link>}
      </div>
    );
  } else {
    body = (
      <>
        <div className={listClass}>
          {list.items.map((v) => <VideoCard key={v.id} video={v} variant={isSearch ? 'row' : 'grid'} />)}
          {list.status === 'loadingMore' && Array.from({ length: isSearch ? 2 : 4 }, (_, i) => <SkeletonCard key={`more-${i}`} row={isSearch} />)}
        </div>
        <LoadMoreFooter list={list} />
      </>
    );
  }

  return (
    <div className={`home-page ${isSearch ? 'home-page-search' : ''}`}>
      {isSearch ? (
        <>
          <h1 className="home-results-heading">{t('home.resultsFor', { query })}</h1>
          <SearchChannels channels={channels} />
        </>
      ) : (
        <div className="chip-bar">
          <div className="chip-bar-scroll" role="tablist" aria-label={t('home.filterByCategory')}>
            <button type="button" role="tab" aria-selected={category === null} className="chip" onClick={() => selectCategory(null)}>{t('categories.all')}</button>
            {CATEGORIES.map((c) => (
              <button key={c} type="button" role="tab" aria-selected={category === c} className="chip" onClick={() => selectCategory(c)}>{t(`categories.${c}`)}</button>
            ))}
          </div>
        </div>
      )}
      {body}
    </div>
  );
}

/** Channels matching the query, shown above the video results. */
function SearchChannels({ channels }: { channels: Channel[] }) {
  const { t } = useTranslation();
  if (channels.length === 0) return null;
  return (
    <div className="video-list">
      {channels.map((c) => (
        <Link key={c.id} to={`/@${c.handle}`} className="video-card video-card-row search-channel">
          <div className="video-card-thumbnail search-channel-avatar">
            <Avatar src={c.avatar} className="channel-avatar-lg" fallbackClassName="avatar-placeholder channel-avatar-lg">{c.displayName.charAt(0).toUpperCase()}</Avatar>
          </div>
          <div className="video-card-details">
            <h3 className="video-card-title">{c.displayName}</h3>
            <p className="video-card-meta">@{c.handle} · {t('channel.subscribers', { count: c.subscribers, value: formatViews(c.subscribers) })}</p>
            {c.description && <p className="video-card-description">{c.description}</p>}
          </div>
        </Link>
      ))}
    </div>
  );
}
