import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdOutlineSubscriptions, MdErrorOutline } from 'react-icons/md';
import subscriptionApi from '../api/subscriptionApi';
import VideoCard from '../components/Video/VideoCard';
import { SkeletonCard, LoadMoreFooter } from '../components/Video/VideoListParts';
import useInfiniteList from '../hooks/useInfiniteList';
import './SubscriptionsPage.css';

const PAGE_SIZE = 12;

/**
 * Subscriptions Feed Page (YouTube-style):
 * Displays recent video uploads from creator channels followed by the current user.
 */
const SubscriptionsPage = () => {
  const { t } = useTranslation();

  const fetchPage = useCallback(async (page) => {
    const res = await subscriptionApi.getSubscriptionFeed({
      page,
      limit: PAGE_SIZE,
    });
    const { videos, pagination } = res.data.data;
    return {
      items: videos,
      pages: pagination?.pages,
      total: pagination?.total,
    };
  }, []);

  const list = useInfiniteList(fetchPage);

  let body;
  if (list.status === 'loading') {
    body = (
      <div className="video-grid">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  } else if (list.status === 'error' && list.items.length === 0) {
    body = (
      <div className="empty-state">
        <MdErrorOutline className="empty-state-icon" aria-hidden="true" />
        <p className="empty-state-title">{t('home.loadErrorTitle')}</p>
        <button type="button" className="btn btn-secondary" onClick={list.retry}>
          {t('home.retry')}
        </button>
      </div>
    );
  } else if (list.items.length === 0) {
    body = (
      <div className="empty-state">
        <MdOutlineSubscriptions className="empty-state-icon" aria-hidden="true" />
        <h2 className="empty-state-title">{t('subscription.feedEmpty')}</h2>
        <p className="empty-state-desc">{t('subscription.feedSubtitle')}</p>
        <Link to="/" className="btn btn-primary">
          {t('subscription.feedExplore')}
        </Link>
      </div>
    );
  } else {
    body = (
      <>
        <div className="video-grid">
          {list.items.map((video) => (
            <VideoCard key={video._id} video={video} />
          ))}
          {list.status === 'loadingMore' &&
            Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={`more-${i}`} />)}
        </div>
        <LoadMoreFooter list={list} />
      </>
    );
  }

  return (
    <div className="subscriptions-page">
      <header className="subscriptions-header">
        <h1 className="subscriptions-title">
          <MdOutlineSubscriptions className="subscriptions-title-icon" aria-hidden="true" />
          {t('subscription.feedTitle')}
        </h1>
        <p className="subscriptions-subtitle">{t('subscription.feedSubtitle')}</p>
      </header>

      {body}
    </div>
  );
};

export default SubscriptionsPage;
