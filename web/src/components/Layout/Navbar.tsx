import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  MdAdminPanelSettings, MdArrowBack, MdMenu, MdMoreVert, MdOutlineAccountCircle, MdOutlineDarkMode, MdOutlineFileUpload,
  MdOutlineInfo, MdOutlineLightMode, MdOutlineLogout, MdOutlineNotifications, MdOutlineSettings, MdOutlineTranslate,
  MdOutlineVideoCall, MdOutlineVideoLibrary, MdSearch,
} from 'react-icons/md';
import { useAuth } from '../../context/auth';
import { useTheme } from '../../context/theme';
import { discovery } from '../../api/endpoints';
import Avatar from '../Common/Avatar';
import Logo from './Logo';
import './Navbar.css';

/**
 * YouTube-style top bar: menu and logo on the left, search in the middle with suggestions after
 * two characters, create and account on the right. Below 656 px the search folds into a button.
 */
export default function Navbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { t, i18n } = useTranslation();
  const { user, isAuthenticated, isStaff, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [mobileSearch, setMobileSearch] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(searchParams.get('q') ?? ''); }, [searchParams]);
  useEffect(() => { setMenuOpen(false); setMobileSearch(false); setSuggestions([]); }, [location.pathname]);

  // Suggestions start after two characters; a newer keystroke cancels the older request.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || q === searchParams.get('q')) { setSuggestions([]); return undefined; }
    const ctl = new AbortController();
    const timer = window.setTimeout(() => {
      discovery.suggest(q, ctl.signal).then((r) => setSuggestions(r.items)).catch(() => setSuggestions([]));
    }, 200);
    return () => { ctl.abort(); window.clearTimeout(timer); };
  }, [query, searchParams]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointer = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const go = (q: string) => {
    setSuggestions([]);
    setMobileSearch(false);
    navigate(q ? `/results?q=${encodeURIComponent(q)}` : '/');
  };
  const onSubmit = (e: FormEvent) => { e.preventDefault(); go(query.trim()); };
  const handleLogout = async () => { setMenuOpen(false); await logout(); navigate('/'); };

  const lang = i18n.resolvedLanguage === 'en' ? 'en' : 'vi';
  const nextLang = lang === 'en' ? 'vi' : 'en';
  const initial = user?.displayName.charAt(0).toUpperCase();
  const channelPath = user ? `/@${user.handle}` : '/';
  const close = () => setMenuOpen(false);

  const searchForm = (
    <form className="topbar-search" role="search" onSubmit={onSubmit}>
      <input
        type="search" className="topbar-search-input" placeholder={t('nav.searchPlaceholder')} aria-label={t('nav.search')}
        value={query} onChange={(e) => setQuery(e.target.value)} autoFocus={mobileSearch} list="search-suggestions" autoComplete="off"
      />
      <datalist id="search-suggestions">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
      <button type="submit" className="topbar-search-btn" aria-label={t('nav.search')}><MdSearch /></button>
    </form>
  );

  const preferenceRows = (
    <>
      <button type="button" className="dropdown-item" onClick={toggleTheme}>
        {theme === 'dark' ? <MdOutlineLightMode /> : <MdOutlineDarkMode />}
        <span>{t('nav.theme', { mode: theme === 'dark' ? t('nav.themeDark') : t('nav.themeLight') })}</span>
      </button>
      <button type="button" className="dropdown-item" onClick={() => void i18n.changeLanguage(nextLang)} title={t('language.switchTo', { lang: t(`language.${nextLang}`) })}>
        <MdOutlineTranslate /><span>{t('nav.languageRow', { lang: t(`language.${lang}`) })}</span>
      </button>
      <Link to="/landing" className="dropdown-item" onClick={close}><MdOutlineInfo /><span>{t('nav.aboutVidShare')}</span></Link>
    </>
  );

  if (mobileSearch) {
    return (
      <header className="topbar topbar-searching">
        <button type="button" className="btn-icon" onClick={() => setMobileSearch(false)} aria-label={t('nav.back')}><MdArrowBack /></button>
        {searchForm}
      </header>
    );
  }

  return (
    <header className="topbar">
      <div className="topbar-start">
        <button type="button" className="btn-icon" onClick={onMenuClick} aria-label={t('nav.toggleMenu')}><MdMenu /></button>
        <Logo />
      </div>
      <div className="topbar-center">{searchForm}</div>
      <div className="topbar-end">
        <button type="button" className="btn-icon topbar-search-toggle" onClick={() => setMobileSearch(true)} aria-label={t('nav.search')}><MdSearch /></button>
        {isAuthenticated && user ? (
          <>
            <Link to="/upload" className="btn-icon" aria-label={t('nav.create')} title={t('nav.create')}><MdOutlineVideoCall /></Link>
            <Link to="/notifications" className="btn-icon" aria-label={t('nav.notifications')} title={t('nav.notifications')}><MdOutlineNotifications /></Link>
            <div className="topbar-menu" ref={menuRef}>
              <button type="button" className="topbar-avatar-btn" onClick={() => setMenuOpen((v) => !v)} aria-label={t('nav.accountMenu')} aria-expanded={menuOpen} aria-haspopup="menu">
                <Avatar src={user.avatar} className="topbar-avatar" fallbackClassName="avatar-placeholder topbar-avatar">{initial}</Avatar>
              </button>
              {menuOpen && (
                <div className="topbar-dropdown menu-panel" role="menu">
                  <div className="account-header">
                    <Avatar src={user.avatar} className="account-avatar" fallbackClassName="avatar-placeholder account-avatar">{initial}</Avatar>
                    <div className="account-text">
                      <p className="account-name">{user.displayName}</p>
                      <p className="account-handle">@{user.handle}</p>
                      <Link to={channelPath} className="account-channel-link" onClick={close}>{t('nav.viewChannel')}</Link>
                    </div>
                  </div>
                  <div className="dropdown-divider" />
                  <Link to={channelPath} className="dropdown-item" onClick={close}><MdOutlineVideoLibrary /><span>{t('nav.yourChannel')}</span></Link>
                  <Link to="/upload" className="dropdown-item" onClick={close}><MdOutlineFileUpload /><span>{t('nav.uploadVideo')}</span></Link>
                  <Link to="/settings" className="dropdown-item" onClick={close}><MdOutlineSettings /><span>{t('nav.settings')}</span></Link>
                  {isStaff && <Link to="/admin" className="dropdown-item" onClick={close}><MdAdminPanelSettings /><span>{t('nav.admin')}</span></Link>}
                  <div className="dropdown-divider" />
                  {preferenceRows}
                  <div className="dropdown-divider" />
                  <button type="button" className="dropdown-item" onClick={() => void handleLogout()}><MdOutlineLogout /><span>{t('nav.logout')}</span></button>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="topbar-menu" ref={menuRef}>
              <button type="button" className="btn-icon" onClick={() => setMenuOpen((v) => !v)} aria-label={t('nav.more')} aria-expanded={menuOpen} aria-haspopup="menu"><MdMoreVert /></button>
              {menuOpen && <div className="topbar-dropdown menu-panel" role="menu">{preferenceRows}</div>}
            </div>
            <Link to="/login" state={{ from: `${location.pathname}${location.search}` }} className="btn btn-outline topbar-signin">
              <MdOutlineAccountCircle /><span>{t('nav.login')}</span>
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
