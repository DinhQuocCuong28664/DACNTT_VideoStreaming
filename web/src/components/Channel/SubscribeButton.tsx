import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdCheck, MdKeyboardArrowDown, MdPersonRemoveAlt1 } from 'react-icons/md';
import { channels } from '../../api/endpoints';
import { useAuth } from '../../context/auth';
import { errorText } from '../../lib/errors';
import { useToast } from '../Common/Toast';
import './SubscribeButton.css';

/**
 * YouTube-style subscribe pill: high-contrast "Subscribe", or "Subscribed" with a menu that
 * unsubscribes. The count comes back from the API after each change (recounted server-side).
 */
export default function SubscribeButton({ channelId, channelName = '', subscribed: initial, onChange, className = '' }: {
  channelId: string;
  channelName?: string;
  subscribed: boolean;
  onChange?: (state: { subscribed: boolean; subscribers: number }) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [toast, showToast] = useToast();
  const [subscribed, setSubscribed] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSubscribed(initial), [initial]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  if (user?.id === channelId) return null;

  const run = async (next: boolean) => {
    if (!isAuthenticated) return navigate('/login', { state: { from: `${location.pathname}${location.search}` } });
    setBusy(true);
    setMenuOpen(false);
    try {
      const r = next ? await channels.subscribe(channelId) : await channels.unsubscribe(channelId);
      setSubscribed(r.subscribed);
      onChange?.(r);
      showToast(r.subscribed ? t('subscription.subscribeSuccess', { name: channelName }) : t('subscription.unsubscribeSuccess', { name: channelName }));
    } catch (err) {
      showToast(errorText(t, err));
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <div ref={rootRef} className={`yt-subscribe-wrapper ${menuOpen ? 'menu-open' : ''} ${className}`}>
      {subscribed ? (
        <button type="button" className={`yt-subscribe-btn subscribed ${busy ? 'loading' : ''}`} onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen} disabled={busy}>
          <MdCheck className="yt-bell-icon" aria-hidden="true" />
          <span className="yt-btn-text">{t('subscription.subscribed')}</span>
          <MdKeyboardArrowDown className="yt-arrow-icon" />
        </button>
      ) : (
        <button type="button" className={`yt-subscribe-btn unsubscribed ${busy ? 'loading' : ''}`} onClick={() => void run(true)} disabled={busy}>
          <span className="yt-btn-text">{t('subscription.subscribe')}</span>
        </button>
      )}
      {menuOpen && (
        <div className="yt-sub-menu" role="menu" aria-orientation="vertical">
          <button type="button" role="menuitem" className="yt-sub-menu-item" onClick={() => void run(false)}>
            <MdPersonRemoveAlt1 className="yt-item-icon" /><span className="yt-item-label">{t('subscription.unsubscribe')}</span>
          </button>
        </div>
      )}
      {toast}
    </div>
  );
}
