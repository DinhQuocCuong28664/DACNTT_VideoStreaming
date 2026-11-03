import { Suspense, useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdMenu } from 'react-icons/md';
import Navbar from './Navbar';
import Guide from './Guide';
import Logo from './Logo';
import { EmailVerificationBanner } from '../Auth/EmailVerification';
import { Spinner } from '../Common/StatusScreen';

/** From this width the left menu opens at its full 240 px. */
const WIDE_QUERY = '(min-width: 1312px)';

/** The watch page needs the whole width for the player, so its menu is a drawer. */
const isOverlayRoute = (pathname: string) => pathname.startsWith('/watch/') || pathname === '/landing';

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export default function MainLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const isWide = useMediaQuery(WIDE_QUERY);
  const overlayOnly = isOverlayRoute(location.pathname);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => { setDrawerOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const onMenuClick = useCallback(() => {
    if (!overlayOnly && isWide) setCollapsed((v) => !v);
    else setDrawerOpen((v) => !v);
  }, [overlayOnly, isWide]);

  const shellMode = overlayOnly ? 'guide-none' : isWide && !collapsed ? 'guide-full' : 'guide-mini';
  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className={`app-shell ${shellMode}`}>
      <a href="#main-content" className="skip-link">{t('nav.skipToContent')}</a>
      <Navbar onMenuClick={onMenuClick} />
      {shellMode === 'guide-full' && <aside className="guide-rail guide-rail-full"><Guide variant="full" /></aside>}
      {shellMode === 'guide-mini' && <aside className="guide-rail guide-rail-mini"><Guide variant="mini" /></aside>}
      {drawerOpen && (
        <div className="guide-drawer-scrim" onClick={closeDrawer}>
          <div className="guide-drawer" role="dialog" aria-modal="true" aria-label={t('nav.mainNav')} onClick={(e) => e.stopPropagation()}>
            <div className="guide-drawer-header">
              <button type="button" className="btn-icon" onClick={closeDrawer} aria-label={t('nav.toggleMenu')} autoFocus><MdMenu /></button>
              <Logo onClick={closeDrawer} />
            </div>
            <Guide variant="full" onNavigate={closeDrawer} />
          </div>
        </div>
      )}
      <main id="main-content" className="app-main">
        <EmailVerificationBanner />
        <Suspense fallback={<Spinner />}><Outlet /></Suspense>
      </main>
    </div>
  );
}
