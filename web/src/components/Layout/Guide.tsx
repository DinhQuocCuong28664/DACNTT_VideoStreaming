import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import {
  MdAdminPanelSettings, MdChevronRight, MdHistory, MdHome, MdOutlineAccountCircle, MdOutlineAdminPanelSettings,
  MdOutlineComputer, MdOutlineFileUpload, MdOutlineHome, MdOutlineInfo, MdOutlineMusicNote, MdOutlinePlaylistPlay,
  MdOutlineSchool, MdOutlineSettings, MdOutlineSportsEsports, MdOutlineSubscriptions, MdOutlineTheaterComedy,
  MdOutlineVideoLibrary, MdOutlineWatchLater, MdSettings, MdSubscriptions, MdVideoLibrary,
} from 'react-icons/md';
import { useAuth } from '../../context/auth';
import type { Category } from '../../api/types';

const EXPLORE: { value: Category; icon: IconType }[] = [
  { value: 'technology', icon: MdOutlineComputer },
  { value: 'education', icon: MdOutlineSchool },
  { value: 'entertainment', icon: MdOutlineTheaterComedy },
  { value: 'music', icon: MdOutlineMusicNote },
  { value: 'gaming', icon: MdOutlineSportsEsports },
];

interface Item { to: string; label: string; icon: IconType; activeIcon?: IconType; active: boolean }

/**
 * Left navigation. `full` is 240 px with the "You" and "Explore" groups (also used in the
 * drawer); `mini` is 72 px with the main items. The current item carries aria-current="page",
 * which the CSS uses for its background, so assistive tech and the look never disagree.
 */
export default function Guide({ variant = 'full', onNavigate }: { variant?: 'full' | 'mini'; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { user, isAuthenticated, isStaff } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const category = params.get('category');
  const at = (p: string) => location.pathname === p;
  const channelPath = user ? `/@${user.handle}` : '/';

  const main: Item[] = [
    { to: '/', label: t('nav.home'), icon: MdOutlineHome, activeIcon: MdHome, active: at('/') && !category },
    ...(isAuthenticated ? [
      { to: '/subscriptions', label: t('nav.subscriptions'), icon: MdOutlineSubscriptions, activeIcon: MdSubscriptions, active: at('/subscriptions') },
      { to: '/upload', label: t('nav.upload'), icon: MdOutlineFileUpload, active: at('/upload') },
    ] : []),
  ];

  const you: Item[] = isAuthenticated ? [
    { to: channelPath, label: t('nav.yourChannel'), icon: MdOutlineVideoLibrary, activeIcon: MdVideoLibrary, active: at(channelPath) },
    { to: '/history', label: t('nav.history'), icon: MdHistory, active: at('/history') },
    { to: '/playlist/watch-later', label: t('nav.watchLater'), icon: MdOutlineWatchLater, active: at('/playlist/watch-later') },
    { to: '/playlists', label: t('nav.playlists'), icon: MdOutlinePlaylistPlay, active: at('/playlists') },
    { to: '/studio', label: t('nav.studio'), icon: MdOutlineVideoLibrary, active: location.pathname.startsWith('/studio') },
    { to: '/settings', label: t('nav.settings'), icon: MdOutlineSettings, activeIcon: MdSettings, active: at('/settings') },
    ...(isStaff ? [{ to: '/admin', label: t('nav.admin'), icon: MdOutlineAdminPanelSettings, activeIcon: MdAdminPanelSettings, active: at('/admin') }] : []),
  ] : [];

  const renderItem = (item: Item) => {
    const Icon = item.active && item.activeIcon ? item.activeIcon : item.icon;
    return (
      <Link key={item.to} to={item.to} className="guide-item" aria-current={item.active ? 'page' : undefined} onClick={onNavigate}>
        <Icon className="guide-icon" aria-hidden="true" />
        <span className="guide-label">{item.label}</span>
      </Link>
    );
  };

  if (variant === 'mini') {
    return (
      <nav className="guide guide-mini" aria-label={t('nav.mainNav')}>
        {[...main, ...you.slice(0, 1)].map(renderItem)}
        {!isAuthenticated && renderItem({ to: '/landing', label: t('nav.about'), icon: MdOutlineInfo, active: at('/landing') })}
      </nav>
    );
  }

  return (
    <nav className="guide guide-full" aria-label={t('nav.mainNav')}>
      <div className="guide-section">{main.map(renderItem)}</div>
      <div className="guide-section">
        {isAuthenticated ? (
          <>
            <Link to={channelPath} className="guide-heading guide-heading-link" onClick={onNavigate}>{t('nav.guideYou')}<MdChevronRight aria-hidden="true" /></Link>
            {you.map(renderItem)}
          </>
        ) : (
          <div className="guide-signin">
            <p>{t('nav.signInPrompt')}</p>
            <Link to="/login" state={{ from: `${location.pathname}${location.search}` }} className="btn btn-outline" onClick={onNavigate}>
              <MdOutlineAccountCircle /><span>{t('nav.login')}</span>
            </Link>
          </div>
        )}
      </div>
      <div className="guide-section">
        <h2 className="guide-heading">{t('nav.explore')}</h2>
        {EXPLORE.map((c) => renderItem({ to: `/?category=${c.value}`, label: t(`categories.${c.value}`), icon: c.icon, active: at('/') && category === c.value }))}
      </div>
      <div className="guide-section">
        {renderItem({ to: '/landing', label: t('nav.aboutVidShare'), icon: MdOutlineInfo, active: at('/landing') })}
      </div>
    </nav>
  );
}
