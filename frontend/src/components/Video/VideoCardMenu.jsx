import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdMoreVert, MdOutlineShare, MdOutlinedFlag } from 'react-icons/md';
import { useAuth } from '../../context/useAuth';
import useToast from '../Common/Toast';
import ReportDialog from './ReportDialog';

/** Space kept between the menu and the window edge when choosing a side. */
const EDGE_GAP = 8;

/**
 * The three-dot ("kebab") menu on a video card, like YouTube's.
 *
 * It only offers what the app already supports: copy the link to the video,
 * and report the video (same rules as the Report button on the watch page).
 * Watch later, playlists and "not interested" need new backend work and are
 * left out on purpose.
 *
 * Keyboard: the first item gets focus when the menu opens, arrow keys move
 * between items, Esc closes and returns focus to the button.
 */
const VideoCardMenu = ({ video }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user: currentUser, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  // The toast's live region is only mounted once this card's menu has been
  // used, instead of one empty region per card on every page.
  const [usedOnce, setUsedOnce] = useState(false);
  const [toast, showToast] = useToast();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const isOwnVideo = Boolean(currentUser && currentUser._id === video.user?._id);
  const moderationStatus = video.moderation?.status;
  const canReport =
    video.status === 'READY' && !isOwnVideo && moderationStatus !== 'flagged' && moderationStatus !== 'blocked';

  const menuItems = () => Array.from(panelRef.current?.querySelectorAll('[role="menuitem"]') || []);

  const closeMenu = ({ restoreFocus = false } = {}) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  // Open downwards unless that would run off the bottom of the window, then
  // move focus into the menu. Runs before paint, so the menu never jumps.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const fitsBelow = trigger.bottom + panel.offsetHeight + EDGE_GAP <= window.innerHeight;
    const fitsAbove = trigger.top - panel.offsetHeight - EDGE_GAP >= 0;
    panel.dataset.placement = !fitsBelow && fitsAbove ? 'top' : 'bottom';
    menuItems()[0]?.focus();
  }, [open]);

  // Close on a click outside the menu or when focus leaves it.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onFocusIn = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [open]);

  const handleMenuKeyDown = (e) => {
    const items = menuItems();
    const index = items.indexOf(document.activeElement);
    const focusAt = (i) => items[(i + items.length) % items.length]?.focus();
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        closeMenu({ restoreFocus: true });
        break;
      case 'ArrowDown':
        e.preventDefault();
        focusAt(index + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusAt(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusAt(0);
        break;
      case 'End':
        e.preventDefault();
        focusAt(items.length - 1);
        break;
      case 'Tab':
        closeMenu();
        break;
      default:
        break;
    }
  };

  const handleToggle = () => {
    setUsedOnce(true);
    setOpen((v) => !v);
  };

  const handleShare = async () => {
    closeMenu({ restoreFocus: true });
    const url = `${window.location.origin}/watch/${video._id}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast(t('videoCard.linkCopied'));
    } catch {
      showToast(t('videoCard.copyFailed'));
    }
  };

  const handleReport = () => {
    // Focus the button first so the report dialog hands focus back to it.
    closeMenu({ restoreFocus: true });
    if (!isAuthenticated) {
      navigate('/login', { state: { from: location.pathname } });
      return;
    }
    setReportOpen(true);
  };

  const handleReported = (alreadyReported) => {
    setReportOpen(false);
    showToast(alreadyReported ? t('report.already') : t('report.success'));
  };

  return (
    <div ref={rootRef} className={`video-card-menu${open ? ' is-open' : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className="btn-icon video-card-menu-trigger"
        onClick={handleToggle}
        aria-label={t('videoCard.actions')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MdMoreVert />
      </button>

      {open && (
        <div
          ref={panelRef}
          className="menu-panel video-card-menu-panel"
          role="menu"
          aria-label={t('videoCard.actions')}
          onKeyDown={handleMenuKeyDown}
        >
          <button type="button" role="menuitem" tabIndex={-1} className="dropdown-item" onClick={handleShare}>
            <MdOutlineShare aria-hidden="true" />
            <span>{t('videoCard.share')}</span>
          </button>
          {canReport && (
            <button type="button" role="menuitem" tabIndex={-1} className="dropdown-item" onClick={handleReport}>
              <MdOutlinedFlag aria-hidden="true" />
              <span>{t('videoCard.report')}</span>
            </button>
          )}
        </div>
      )}

      {reportOpen && (
        <ReportDialog videoId={video._id} onClose={() => setReportOpen(false)} onReported={handleReported} />
      )}
      {/* Portal: the card's ancestors (grid containers, the open menu's
          z-index) must not decide where a fixed-position toast lands. */}
      {usedOnce && createPortal(toast, document.body)}
    </div>
  );
};

export default VideoCardMenu;
