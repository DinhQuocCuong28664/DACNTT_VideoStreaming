import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/useAuth';
import { useTheme } from '../../context/useTheme';
import { FiUpload, FiSearch, FiLogOut, FiVideo, FiMoon, FiSun, FiInfo, FiMenu, FiX, FiSettings } from 'react-icons/fi';
import LogoIcon from './LogoIcon';
import LanguageToggle from './LanguageToggle';
import './Navbar.css';

const Navbar = () => {
  const { t } = useTranslation();
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showMobileDrawer, setShowMobileDrawer] = useState(false);

  const dropdownRef = useRef(null);

  // Close dropdown & mobile drawer on route change
  useEffect(() => {
    setShowDropdown(false);
    setShowMobileDrawer(false);
    setShowMobileSearch(false);
  }, [location.pathname]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    setShowDropdown(false);
    setShowMobileDrawer(false);
    navigate('/');
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/?q=${encodeURIComponent(searchQuery.trim())}`);
      setShowMobileSearch(false);
    } else {
      navigate('/');
    }
  };

  return (
    <>
      <nav className="navbar">
        <div className="navbar-inner">
          {/* Mobile Menu Button */}
          <button
            className="mobile-hamburger-btn"
            onClick={() => setShowMobileDrawer(!showMobileDrawer)}
            aria-label={t('nav.toggleMenu')}
          >
            {showMobileDrawer ? <FiX /> : <FiMenu />}
          </button>

          {/* Logo */}
          <Link to="/" className="navbar-logo">
            <div className="logo-icon"><LogoIcon /></div>
            <span className="logo-text">VidShare</span>
          </Link>

          {/* Desktop Search Bar */}
          <form className="navbar-search" onSubmit={handleSearch}>
            <input
              type="text"
              className="search-input"
              placeholder={t('nav.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button type="submit" className="search-btn">
              <FiSearch />
            </button>
          </form>

          {/* Mobile Search Toggle Icon */}
          <button
            className="mobile-search-toggle-btn"
            onClick={() => setShowMobileSearch(!showMobileSearch)}
            aria-label={t('nav.search')}
          >
            {showMobileSearch ? <FiX /> : <FiSearch />}
          </button>

          {/* Desktop Actions */}
          <div className="navbar-actions">
            <Link to="/landing" className="nav-landing-link" title={t('nav.aboutTitle')}>
              <FiInfo />
              <span className="landing-text">{t('nav.about')}</span>
            </Link>

            <LanguageToggle className="btn btn-secondary lang-toggle-btn" />

            {isAuthenticated ? (
              <>
                <button
                  className="btn btn-primary upload-btn"
                  onClick={() => navigate('/upload')}
                >
                  <FiUpload />
                  <span className="upload-text">{t('nav.upload')}</span>
                </button>

                <div className="user-menu" ref={dropdownRef}>
                  <button
                    className="avatar-btn"
                    onClick={() => setShowDropdown(!showDropdown)}
                  >
                    {user?.avatar ? (
                      <img src={user.avatar} alt="" className="avatar-img" />
                    ) : (
                      <div className="avatar-placeholder">
                        {user?.username?.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </button>

                  {showDropdown && (
                    <div className="dropdown-menu">
                      <div className="dropdown-header">
                        <div className="avatar-placeholder avatar-lg">
                          {user?.username?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="dropdown-name">{user?.displayName || user?.username}</p>
                          <p className="dropdown-email">{user?.email}</p>
                        </div>
                      </div>
                      <div className="dropdown-divider" />
                      <Link
                        to={`/channel/${user?._id}`}
                        className="dropdown-item"
                        onClick={() => setShowDropdown(false)}
                      >
                        <FiVideo /> {t('nav.myChannel')}
                      </Link>
                      <Link
                        to="/upload"
                        className="dropdown-item"
                        onClick={() => setShowDropdown(false)}
                      >
                        <FiUpload /> {t('nav.uploadVideo')}
                      </Link>
                      <Link
                        to="/settings"
                        className="dropdown-item"
                        onClick={() => setShowDropdown(false)}
                      >
                        <FiSettings /> {t('nav.settings')}
                      </Link>
                      <div className="dropdown-divider" />
                      <button className="dropdown-item" onClick={toggleTheme}>
                        {theme === 'dark' ? <FiSun /> : <FiMoon />}
                        <span>{t('nav.theme', { mode: theme === 'dark' ? t('nav.themeDark') : t('nav.themeLight') })}</span>
                      </button>
                      <div className="dropdown-divider" />
                      <button className="dropdown-item dropdown-logout" onClick={handleLogout}>
                        <FiLogOut /> {t('nav.logout')}
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="auth-buttons" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  className="btn btn-secondary theme-toggle-btn"
                  onClick={toggleTheme}
                  title={theme === 'dark' ? t('nav.switchToLight') : t('nav.switchToDark')}
                  style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {theme === 'dark' ? <FiSun /> : <FiMoon />}
                </button>
                <Link to="/login" className="btn btn-secondary nav-login-btn">
                  {t('nav.login')}
                </Link>
                <Link to="/register" className="btn btn-primary nav-register-btn">
                  {t('nav.register')}
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Search Overlay Form */}
        {showMobileSearch && (
          <div className="mobile-search-bar">
            <form onSubmit={handleSearch} style={{ display: 'flex', width: '100%', gap: '8px' }}>
              <input
                type="text"
                className="search-input"
                placeholder={t('nav.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              <button type="submit" className="btn btn-primary">
                <FiSearch />
              </button>
            </form>
          </div>
        )}
      </nav>

      {/* Mobile Navigation Drawer */}
      {showMobileDrawer && (
        <div className="mobile-drawer-overlay" onClick={() => setShowMobileDrawer(false)}>
          <div className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-drawer-header">
              <Link to="/" className="navbar-logo" onClick={() => setShowMobileDrawer(false)}>
                <div className="logo-icon"><LogoIcon /></div>
                <span className="logo-text">VidShare</span>
              </Link>
              <button className="mobile-drawer-close" onClick={() => setShowMobileDrawer(false)}>
                <FiX />
              </button>
            </div>

            <div className="mobile-drawer-body">
              {isAuthenticated && (
                <div className="mobile-user-card">
                  <div className="avatar-placeholder avatar-lg">
                    {user?.username?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="mobile-user-name">{user?.displayName || user?.username}</p>
                    <p className="mobile-user-email">{user?.email}</p>
                  </div>
                </div>
              )}

              <nav className="mobile-nav-links">
                <Link to="/" className="mobile-nav-item" onClick={() => setShowMobileDrawer(false)}>
                  <FiVideo /> {t('nav.home')}
                </Link>
                <Link to="/landing" className="mobile-nav-item" onClick={() => setShowMobileDrawer(false)}>
                  <FiInfo /> {t('nav.aboutTitle')}
                </Link>

                {isAuthenticated ? (
                  <>
                    <Link to={`/channel/${user?._id}`} className="mobile-nav-item" onClick={() => setShowMobileDrawer(false)}>
                      <FiVideo /> {t('nav.myChannel')}
                    </Link>
                    <Link to="/upload" className="mobile-nav-item" onClick={() => setShowMobileDrawer(false)}>
                      <FiUpload /> {t('nav.uploadVideo')}
                    </Link>
                    <Link to="/settings" className="mobile-nav-item" onClick={() => setShowMobileDrawer(false)}>
                      <FiSettings /> {t('nav.settings')}
                    </Link>
                  </>
                ) : (
                  <>
                    <Link to="/login" className="mobile-nav-item" onClick={() => setShowMobileDrawer(false)}>
                      {t('nav.login')}
                    </Link>
                    <Link to="/register" className="mobile-nav-item" onClick={() => setShowMobileDrawer(false)}>
                      {t('nav.registerAccount')}
                    </Link>
                  </>
                )}

                <LanguageToggle className="mobile-nav-item theme-switch-item" />

                <button className="mobile-nav-item theme-switch-item" onClick={toggleTheme}>
                  {theme === 'dark' ? <FiSun /> : <FiMoon />}
                  <span>{t('nav.themeMode', { mode: theme === 'dark' ? t('nav.themeDark') : t('nav.themeLight') })}</span>
                </button>
              </nav>
            </div>

            {isAuthenticated && (
              <div className="mobile-drawer-footer">
                <button className="btn btn-secondary mobile-logout-btn" onClick={handleLogout}>
                  <FiLogOut /> {t('nav.logout')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;
