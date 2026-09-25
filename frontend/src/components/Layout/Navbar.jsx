import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  MdMenu,
  MdSearch,
  MdArrowBack,
  MdMoreVert,
  MdOutlineVideoCall,
  MdOutlineFileUpload,
  MdOutlineSettings,
  MdOutlineLogout,
  MdOutlineDarkMode,
  MdOutlineLightMode,
  MdOutlineTranslate,
  MdOutlineInfo,
  MdOutlineAccountCircle,
  MdOutlineVideoLibrary,
  MdOutlineAdminPanelSettings,
} from 'react-icons/md';
import { useAuth } from '../../context/useAuth';
import { useTheme } from '../../context/useTheme';
import Avatar from '../Common/Avatar';
import Logo from './Logo';
import './Navbar.css';

/**
 * Thanh trên cùng kiểu YouTube: nút menu và logo bên trái, ô tìm kiếm ở giữa,
 * nút tạo video và ảnh đại diện bên phải. Dưới 656 px ô tìm kiếm thu thành
 * một nút; bấm vào thì cả thanh chuyển thành ô tìm kiếm có nút quay lại.
 */
const Navbar = ({ onMenuClick }) => {
  const { t, i18n } = useTranslation();
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [mobileSearch, setMobileSearch] = useState(false);
  const menuRef = useRef(null);

  // Ô tìm kiếm phản ánh truy vấn trên URL, kể cả khi người dùng bấm quay lại.
  useEffect(() => {
    setSearchQuery(searchParams.get('q') || '');
  }, [searchParams]);

  useEffect(() => {
    setMenuOpen(false);
    setMobileSearch(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointer = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
    navigate('/');
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const q = searchQuery.trim();
    navigate(q ? `/?q=${encodeURIComponent(q)}` : '/');
    setMobileSearch(false);
  };

  const nextLang = i18n.resolvedLanguage === 'en' ? 'vi' : 'en';
  const themeLabel = t('nav.theme', {
    mode: theme === 'dark' ? t('nav.themeDark') : t('nav.themeLight'),
  });
  const languageLabel = t('nav.languageRow', { lang: t(`language.${i18n.resolvedLanguage}`) });

  const searchForm = (
    <form className="topbar-search" role="search" onSubmit={handleSearch}>
      <input
        type="search"
        className="topbar-search-input"
        placeholder={t('nav.searchPlaceholder')}
        aria-label={t('nav.search')}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        autoFocus={mobileSearch}
      />
      <button type="submit" className="topbar-search-btn" aria-label={t('nav.search')}>
        <MdSearch />
      </button>
    </form>
  );

  /* Các dòng chung cho cả menu ảnh đại diện (đã đăng nhập) và menu "Thêm"
     (khách): đổi giao diện, đổi ngôn ngữ, trang giới thiệu. */
  const preferenceRows = (
    <>
      <button type="button" className="dropdown-item" onClick={toggleTheme}>
        {theme === 'dark' ? <MdOutlineLightMode /> : <MdOutlineDarkMode />}
        <span>{themeLabel}</span>
      </button>
      <button
        type="button"
        className="dropdown-item"
        onClick={() => i18n.changeLanguage(nextLang)}
        title={t('language.switchTo', { lang: t(`language.${nextLang}`) })}
      >
        <MdOutlineTranslate />
        <span>{languageLabel}</span>
      </button>
      <Link to="/landing" className="dropdown-item" onClick={() => setMenuOpen(false)}>
        <MdOutlineInfo />
        <span>{t('nav.aboutVidShare')}</span>
      </Link>
    </>
  );

  if (mobileSearch) {
    return (
      <header className="topbar topbar-searching">
        <button
          type="button"
          className="btn-icon"
          onClick={() => setMobileSearch(false)}
          aria-label={t('nav.back')}
        >
          <MdArrowBack />
        </button>
        {searchForm}
      </header>
    );
  }

  return (
    <header className="topbar">
      <div className="topbar-start">
        <button
          type="button"
          className="btn-icon"
          onClick={onMenuClick}
          aria-label={t('nav.toggleMenu')}
        >
          <MdMenu />
        </button>
        <Logo />
      </div>

      <div className="topbar-center">{searchForm}</div>

      <div className="topbar-end">
        <button
          type="button"
          className="btn-icon topbar-search-toggle"
          onClick={() => setMobileSearch(true)}
          aria-label={t('nav.search')}
        >
          <MdSearch />
        </button>

        {isAuthenticated ? (
          <>
            <Link
              to="/upload"
              className="btn-icon"
              aria-label={t('nav.create')}
              title={t('nav.create')}
            >
              <MdOutlineVideoCall />
            </Link>

            <div className="topbar-menu" ref={menuRef}>
              <button
                type="button"
                className="topbar-avatar-btn"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label={t('nav.accountMenu')}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <Avatar src={user?.avatar} className="topbar-avatar" fallbackClassName="avatar-placeholder topbar-avatar">
                  {user?.username?.charAt(0).toUpperCase()}
                </Avatar>
              </button>

              {menuOpen && (
                <div className="topbar-dropdown menu-panel" role="menu">
                  <div className="account-header">
                    <Avatar src={user?.avatar} className="account-avatar" fallbackClassName="avatar-placeholder account-avatar">
                      {user?.username?.charAt(0).toUpperCase()}
                    </Avatar>
                    <div className="account-text">
                      <p className="account-name">{user?.displayName || user?.username}</p>
                      <p className="account-handle">@{user?.username}</p>
                      <Link
                        to={`/channel/${user?._id}`}
                        className="account-channel-link"
                        onClick={() => setMenuOpen(false)}
                      >
                        {t('nav.viewChannel')}
                      </Link>
                    </div>
                  </div>
                  <div className="dropdown-divider" />
                  <Link to={`/channel/${user?._id}`} className="dropdown-item" onClick={() => setMenuOpen(false)}>
                    <MdOutlineVideoLibrary />
                    <span>{t('nav.yourChannel')}</span>
                  </Link>
                  <Link to="/upload" className="dropdown-item" onClick={() => setMenuOpen(false)}>
                    <MdOutlineFileUpload />
                    <span>{t('nav.uploadVideo')}</span>
                  </Link>
                  <Link to="/settings" className="dropdown-item" onClick={() => setMenuOpen(false)}>
                    <MdOutlineSettings />
                    <span>{t('nav.settings')}</span>
                  </Link>
                  {user?.role === 'admin' && (
                    <Link to="/admin" className="dropdown-item" onClick={() => setMenuOpen(false)}>
                      <MdOutlineAdminPanelSettings />
                      <span>{t('nav.admin')}</span>
                    </Link>
                  )}
                  <div className="dropdown-divider" />
                  {preferenceRows}
                  <div className="dropdown-divider" />
                  <button type="button" className="dropdown-item" onClick={handleLogout}>
                    <MdOutlineLogout />
                    <span>{t('nav.logout')}</span>
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="topbar-menu" ref={menuRef}>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label={t('nav.more')}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <MdMoreVert />
              </button>
              {menuOpen && (
                <div className="topbar-dropdown menu-panel" role="menu">
                  {preferenceRows}
                </div>
              )}
            </div>
            <Link to="/login" state={{ from: `${location.pathname}${location.search}` }} className="btn btn-outline topbar-signin">
              <MdOutlineAccountCircle />
              <span>{t('nav.login')}</span>
            </Link>
          </>
        )}
      </div>
    </header>
  );
};

export default Navbar;
