import { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdMenu } from 'react-icons/md';
import Navbar from './Navbar';
import Guide from './Guide';
import Logo from './Logo';

/** Từ bề rộng này trở lên, menu trái mở đầy đủ 240 px (như YouTube). */
const WIDE_QUERY = '(min-width: 1312px)';

/**
 * Trang xem video và trang giới thiệu không có menu trái cố định: trang xem cần
 * trọn khung 1320 px cho cột trình phát 880 px (hls.js chọn chất lượng theo bề
 * rộng thật của thẻ video, và con số này đã nằm trong báo cáo). Ở hai trang
 * này nút menu mở ngăn kéo phủ lên nội dung.
 */
const isOverlayRoute = (pathname) =>
  pathname.startsWith('/watch/') || pathname === '/landing';

const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
};

const MainLayout = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const isWide = useMediaQuery(WIDE_QUERY);
  const overlayOnly = isOverlayRoute(location.pathname);

  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  /* Màn rộng: nút menu thu gọn / mở rộng menu trái. Màn hẹp hơn, hoặc trang
     không có menu cố định: nút menu mở ngăn kéo. */
  const handleMenuClick = useCallback(() => {
    if (!overlayOnly && isWide) setCollapsed((v) => !v);
    else setDrawerOpen((v) => !v);
  }, [overlayOnly, isWide]);

  const closeDrawer = () => setDrawerOpen(false);

  let shellMode = 'guide-none';
  if (!overlayOnly) shellMode = isWide && !collapsed ? 'guide-full' : 'guide-mini';

  return (
    <div className={`app-shell ${shellMode}`}>
      {/* Phần tử nhận focus đầu tiên trên mọi trang: cho người dùng bàn phím
          nhảy thẳng vào nội dung thay vì phải đi hết thanh điều hướng. */}
      <a href="#main-content" className="skip-link">
        {t('nav.skipToContent')}
      </a>
      <Navbar onMenuClick={handleMenuClick} />

      {shellMode === 'guide-full' && (
        <aside className="guide-rail guide-rail-full">
          <Guide variant="full" />
        </aside>
      )}
      {shellMode === 'guide-mini' && (
        <aside className="guide-rail guide-rail-mini">
          <Guide variant="mini" />
        </aside>
      )}

      {drawerOpen && (
        <div className="guide-drawer-scrim" onClick={closeDrawer}>
          <div
            className="guide-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={t('nav.mainNav')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="guide-drawer-header">
              <button
                type="button"
                className="btn-icon"
                onClick={closeDrawer}
                aria-label={t('nav.toggleMenu')}
                autoFocus
              >
                <MdMenu />
              </button>
              <Logo onClick={closeDrawer} />
            </div>
            <Guide variant="full" onNavigate={closeDrawer} />
          </div>
        </div>
      )}

      <main id="main-content" className="app-main">
        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;
