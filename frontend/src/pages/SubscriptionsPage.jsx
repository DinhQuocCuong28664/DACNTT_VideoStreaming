import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdOutlineSubscriptions, MdErrorOutline } from 'react-icons/md';
import subscriptionApi from '../api/subscriptionApi';
import VideoCard from '../components/Video/VideoCard';
import { SkeletonCard, LoadMoreFooter } from '../components/Video/VideoListParts';
import useInfiniteList from '../hooks/useInfiniteList';

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
      <div className="empty-state py-16 text-center">
        <MdOutlineSubscriptions className="empty-state-icon mx-auto text-5xl text-neutral-400 mb-4" aria-hidden="true" />
        <h3 className="empty-state-title text-lg font-semibold text-neutral-800 dark:text-neutral-100 mb-2">
          {t('subscription.feedEmpty')}
        </h3>
        <p className="empty-state-desc text-sm text-neutral-500 dark:text-neutral-400 mb-6 max-w-md mx-auto">
          {t('subscription.feedSubtitle')}
        </p>
        <Link to="/" className="btn btn-primary inline-flex items-center gap-2">
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
    <div className="subscriptions-page p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
          <MdOutlineSubscriptions className="w-7 h-7 text-red-600" />
          {t('subscription.feedTitle')}
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          {t('subscription.feedSubtitle')}
        </p>
      </div>

      {body}
    </div>
  );
};

export default SubscriptionsPage;
