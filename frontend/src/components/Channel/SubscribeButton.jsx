import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdKeyboardArrowDown, MdCheck, MdPersonRemoveAlt1 } from 'react-icons/md';
import { useAuth } from '../../context/useAuth';
import subscriptionApi from '../../api/subscriptionApi';
import useToast from '../Common/Toast';
import ConfirmDialog from '../Common/ConfirmDialog';
import './SubscribeButton.css';

/**
 * YouTube-style Channel Subscribe Button.
 * - Unsubscribed: High-contrast pill ("Đăng ký" / "Subscribe") without icons
 * - Subscribed: Subtle secondary pill with a check + "Đã đăng ký" + Chevron Down,
 *   opening a menu with Unsubscribe
 * - Unsubscribe: Native YouTube confirmation modal
 *
 * There is no notification choice (All / Personalized / None): the platform
 * sends no notifications for new uploads, so the menu offered a setting that
 * did nothing but write to localStorage.
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
  const [toastNode, showToast] = useToast();

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribersCount, setSubscribersCount] = useState(initialSubscribersCount || 0);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState(false);

  // Unsubscribe menu & confirmation dialog state
  const [menuOpen, setMenuOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const wrapperRef = useRef(null);
  const isOwnChannel = Boolean(currentUser && channelId && currentUser._id === channelId);

  // Sync initial count if parent passes updated value
  useEffect(() => {
    if (typeof initialSubscribersCount === 'number') {
      setSubscribersCount(initialSubscribersCount);
    }
  }, [initialSubscribersCount]);

  // The parent usually passes an inline function, a new one on every render.
  // With it in the status effect's dependencies the effect reported the
  // count, the parent re-rendered with a new function and the effect fetched
  // again: about 25 requests a second for as long as the channel page stayed
  // open. The effect reads the latest callback from this ref instead.
  const onCountChangeRef = useRef(onCountChange);
  useEffect(() => {
    onCountChangeRef.current = onCountChange;
  });

  // Fetch subscription status from backend
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
            if (onCountChangeRef.current) onCountChangeRef.current(data.subscribersCount);
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
  }, [channelId, isOwnChannel]);

  // Close dropdown on click outside or Escape key
  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  // Do not render subscribe button on creator's own channel
  if (isOwnChannel) {
    return null;
  }

  // Handle subscribe action
  const handleSubscribe = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      navigate('/login', { state: { from: location.pathname } });
      return;
    }

    if (actionInProgress) return;
    setActionInProgress(true);

    const prevCount = subscribersCount;
    const nextCount = prevCount + 1;

    // Optimistic UI update
    setIsSubscribed(true);
    setSubscribersCount(nextCount);
    if (onCountChange) onCountChange(nextCount);

    try {
      const res = await subscriptionApi.subscribe(channelId);
      const count = res.data?.data?.subscribersCount;
      if (typeof count === 'number') {
        setSubscribersCount(count);
        if (onCountChange) onCountChange(count);
      }
      showToast(
        t('subscription.subscribeSuccess', { name: channelName || t('nav.channel') })
      );
    } catch (err) {
      // Rollback on error
      setIsSubscribed(false);
      setSubscribersCount(prevCount);
      if (onCountChange) onCountChange(prevCount);
      showToast(err.response?.data?.message || t('subscription.subscribeFailed'));
    } finally {
      setActionInProgress(false);
    }
  };

  // Click on "Subscribed" button toggles the unsubscribe dropdown
  const handleSubscribedButtonClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen((prev) => !prev);
  };

  // Open confirmation modal for unsubscribe
  const handlePromptUnsubscribe = () => {
    setMenuOpen(false);
    setShowConfirm(true);
  };

  // Execute unsubscribe after user confirmation
  const handleConfirmUnsubscribe = async () => {
    setShowConfirm(false);

    if (actionInProgress) return;
    setActionInProgress(true);

    const prevCount = subscribersCount;
    const nextCount = Math.max(0, prevCount - 1);

    // Optimistic UI update
    setIsSubscribed(false);
    setSubscribersCount(nextCount);
    if (onCountChange) onCountChange(nextCount);

    try {
      const res = await subscriptionApi.unsubscribe(channelId);
      const count = res.data?.data?.subscribersCount;
      if (typeof count === 'number') {
        setSubscribersCount(count);
        if (onCountChange) onCountChange(count);
      }
      showToast(
        t('subscription.unsubscribeSuccess', { name: channelName || t('nav.channel') })
      );
    } catch (err) {
      // Rollback on error
      setIsSubscribed(true);
      setSubscribersCount(prevCount);
      if (onCountChange) onCountChange(prevCount);
      showToast(err.response?.data?.message || t('subscription.unsubscribeFailed'));
    } finally {
      setActionInProgress(false);
    }
  };

  return (
    <div
      ref={wrapperRef}
      className={`yt-subscribe-wrapper ${menuOpen ? 'menu-open' : ''} ${className}`}
    >
      {isSubscribed ? (
        <button
          type="button"
          onClick={handleSubscribedButtonClick}
          disabled={loading || actionInProgress}
          className={`yt-subscribe-btn subscribed ${actionInProgress ? 'loading' : ''}`}
          title={t('subscription.subscribed')}
          aria-label={t('subscription.subscribed')}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <MdCheck className="yt-bell-icon" aria-hidden="true" />
          <span className="yt-btn-text">{t('subscription.subscribed')}</span>
          <MdKeyboardArrowDown className="yt-arrow-icon" />
        </button>
      ) : (
        <button
          type="button"
          onClick={handleSubscribe}
          disabled={loading || actionInProgress}
          className={`yt-subscribe-btn unsubscribed ${actionInProgress ? 'loading' : ''}`}
          title={t('subscription.subscribe')}
          aria-label={t('subscription.subscribe')}
        >
          <span>{t('subscription.subscribe')}</span>
        </button>
      )}

      {/* Unsubscribe dropdown */}
      {isSubscribed && menuOpen && (
        <div className="yt-sub-menu" role="menu" aria-orientation="vertical">
          <button
            type="button"
            className="yt-sub-menu-item"
            role="menuitem"
            onClick={handlePromptUnsubscribe}
          >
            <MdPersonRemoveAlt1 className="yt-item-icon" />
            <span className="yt-item-label">{t('subscription.unsubscribe')}</span>
          </button>
        </div>
      )}

      {/* Native YouTube Confirmation Modal when user chooses to Unsubscribe */}
      {showConfirm && (
        <ConfirmDialog
          title={t('subscription.unsubscribeConfirmTitle', {
            name: channelName || t('nav.channel'),
          })}
          message={t('subscription.unsubscribeConfirmMessage')}
          confirmLabel={t('subscription.unsubscribeConfirmButton')}
          onConfirm={handleConfirmUnsubscribe}
          onClose={() => setShowConfirm(false)}
        />
      )}

      {toastNode}
    </div>
  );
};

export default SubscribeButton;
