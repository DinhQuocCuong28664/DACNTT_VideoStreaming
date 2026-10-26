import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdNotificationsActive, MdOutlineCheck } from 'react-icons/md';
import { useAuth } from '../../context/useAuth';
import subscriptionApi from '../../api/subscriptionApi';
import useToast from '../Common/Toast';

/**
 * YouTube-style Channel Subscribe Button.
 * Handles authentication redirect, optimistic UI updates, and atomic subscriber counts.
 */
const SubscribeButton = ({
  channelId,
  channelName = '',
  initialSubscribersCount,
  onCountChange,
  className = '',
}) => {
  const { t } = useTranslation();
  const { user: currentUser, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribersCount, setSubscribersCount] = useState(initialSubscribersCount || 0);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState(false);

  const isOwnChannel = Boolean(currentUser && channelId && currentUser._id === channelId);

  // Sync initial count if parent passes updated value
  useEffect(() => {
    if (typeof initialSubscribersCount === 'number') {
      setSubscribersCount(initialSubscribersCount);
    }
  }, [initialSubscribersCount]);

  // Fetch subscription status
  useEffect(() => {
    if (!channelId || isOwnChannel) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    subscriptionApi
      .getStatus(channelId)
      .then((res) => {
        if (!isMounted) return;
        const data = res.data?.data;
        if (data) {
          setIsSubscribed(Boolean(data.isSubscribed));
          if (typeof data.subscribersCount === 'number') {
            setSubscribersCount(data.subscribersCount);
            if (onCountChange) onCountChange(data.subscribersCount);
          }
        }
      })
      .catch((err) => {
        console.error('Failed to fetch subscription status:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [channelId, isOwnChannel, onCountChange]);

  // Do not render subscribe button on creator's own channel
  if (isOwnChannel) {
    return null;
  }

  const handleToggleSubscribe = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      navigate('/login', { state: { from: location.pathname } });
      return;
    }

    if (actionInProgress) return;
    setActionInProgress(true);

    const prevSubscribed = isSubscribed;
    const prevCount = subscribersCount;

    // Optimistic UI update
    const nextSubscribed = !prevSubscribed;
    const nextCount = nextSubscribed ? prevCount + 1 : Math.max(0, prevCount - 1);
    setIsSubscribed(nextSubscribed);
    setSubscribersCount(nextCount);
    if (onCountChange) onCountChange(nextCount);

    try {
      if (nextSubscribed) {
        const res = await subscriptionApi.subscribe(channelId);
        const count = res.data?.data?.subscribersCount;
        if (typeof count === 'number') {
          setSubscribersCount(count);
          if (onCountChange) onCountChange(count);
        }
        toast.success(
          t('subscription.subscribeSuccess', { name: channelName || t('nav.channel') })
        );
      } else {
        const res = await subscriptionApi.unsubscribe(channelId);
        const count = res.data?.data?.subscribersCount;
        if (typeof count === 'number') {
          setSubscribersCount(count);
          if (onCountChange) onCountChange(count);
        }
        toast.info(
          t('subscription.unsubscribeSuccess', { name: channelName || t('nav.channel') })
        );
      }
    } catch (err) {
      // Rollback on error
      setIsSubscribed(prevSubscribed);
      setSubscribersCount(prevCount);
      if (onCountChange) onCountChange(prevCount);
      toast.error(err.response?.data?.message || 'Failed to update subscription');
    } finally {
      setActionInProgress(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggleSubscribe}
      disabled={loading || actionInProgress}
      className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full font-medium text-sm transition-all duration-200 cursor-pointer ${
        isSubscribed
          ? 'bg-neutral-200 hover:bg-neutral-300 text-neutral-800 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200'
          : 'bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:hover:bg-neutral-100 dark:text-neutral-900 shadow-sm'
      } ${actionInProgress ? 'opacity-70 cursor-wait' : ''} ${className}`}
      title={isSubscribed ? t('subscription.subscribed') : t('subscription.subscribe')}
      aria-label={isSubscribed ? t('subscription.subscribed') : t('subscription.subscribe')}
    >
      {isSubscribed ? (
        <>
          <MdOutlineCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>{t('subscription.subscribed')}</span>
        </>
      ) : (
        <>
          <MdNotificationsActive className="w-4 h-4" />
          <span>{t('subscription.subscribe')}</span>
        </>
      )}
    </button>
  );
};

export default SubscribeButton;
