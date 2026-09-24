import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  MdHome,
  MdOutlineHome,
  MdOutlineFileUpload,
  MdOutlineVideoLibrary,
  MdVideoLibrary,
  MdOutlineSettings,
  MdSettings,
  MdOutlineComputer,
  MdOutlineSchool,
  MdOutlineTheaterComedy,
  MdOutlineMusicNote,
  MdOutlineSportsEsports,
  MdOutlineInfo,
  MdOutlineAccountCircle,
  MdChevronRight,
} from 'react-icons/md';
import { useAuth } from '../../context/useAuth';
import { CATEGORIES, ALL_CATEGORY } from '../../i18n/categories';

const CATEGORY_ICONS = {
  technology: MdOutlineComputer,
  education: MdOutlineSchool,
  entertainment: MdOutlineTheaterComedy,
  music: MdOutlineMusicNote,
  game: MdOutlineSportsEsports,
};

const EXPLORE = CATEGORIES.filter((c) => CATEGORY_ICONS[c.key]);

/**
 * Menu điều hướng bên trái kiểu YouTube.
 * - `variant="full"`: 240 px, có nhóm "Bạn" và "Khám phá" (dùng cả trong ngăn kéo).
 * - `variant="mini"`: 72 px, chỉ biểu tượng và nhãn nhỏ cho các mục chính.
 * Mục đang ở được đánh dấu bằng `aria-current="page"`; CSS bám vào chính
 * thuộc tính đó để tô nền, nên trình đọc màn hình và giao diện không lệch nhau.
 */
const Guide = ({ variant = 'full', onNavigate }) => {
  const { t } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const category = searchParams.get('category');
  const onHome = location.pathname === '/';
  const isCurrent = (active) => (active ? 'page' : undefined);

  const channelPath = user?._id ? `/channel/${user._id}` : null;

  const main = [
    {
      to: '/',
      label: t('nav.home'),
      icon: MdOutlineHome,
      activeIcon: MdHome,
      active: onHome && !category && !searchParams.get('q'),
    },
    isAuthenticated && {
      to: '/upload',
      label: t('nav.upload'),
      icon: MdOutlineFileUpload,
      active: location.pathname === '/upload',
    },
  ].filter(Boolean);

  const you = isAuthenticated
    ? [
        {
          to: channelPath,
          label: t('nav.yourChannel'),
          icon: MdOutlineVideoLibrary,
          activeIcon: MdVideoLibrary,
          active: location.pathname === channelPath,
        },
        {
          to: '/settings',
          label: t('nav.settings'),
          icon: MdOutlineSettings,
          activeIcon: MdSettings,
          active: location.pathname === '/settings',
        },
      ]
    : [];

  const renderItem = (item) => {
    const Icon = item.active && item.activeIcon ? item.activeIcon : item.icon;
    return (
      <Link
        key={item.to}
        to={item.to}
        className="guide-item"
        aria-current={isCurrent(item.active)}
        onClick={onNavigate}
      >
        <Icon className="guide-icon" aria-hidden="true" />
        <span className="guide-label">{item.label}</span>
      </Link>
    );
  };

  if (variant === 'mini') {
    return (
      <nav className="guide guide-mini" aria-label={t('nav.mainNav')}>
        {[...main, ...you].map(renderItem)}
        {!isAuthenticated &&
          renderItem({ to: '/landing', label: t('nav.about'), icon: MdOutlineInfo, active: location.pathname === '/landing' })}
      </nav>
    );
  }

  return (
    <nav className="guide guide-full" aria-label={t('nav.mainNav')}>
      <div className="guide-section">{main.map(renderItem)}</div>

      <div className="guide-section">
        {isAuthenticated ? (
          <>
            <Link to={channelPath} className="guide-heading guide-heading-link" onClick={onNavigate}>
              {t('nav.guideYou')}
              <MdChevronRight aria-hidden="true" />
            </Link>
            {you.map(renderItem)}
          </>
        ) : (
          <div className="guide-signin">
            <p>{t('nav.signInPrompt')}</p>
            <Link
              to="/login"
              state={{ from: `${location.pathname}${location.search}` }}
              className="btn btn-outline"
              onClick={onNavigate}
            >
              <MdOutlineAccountCircle />
              <span>{t('nav.login')}</span>
            </Link>
          </div>
        )}
      </div>

      <div className="guide-section">
        <h2 className="guide-heading">{t('nav.explore')}</h2>
        {EXPLORE.map((c) =>
          renderItem({
            to: `/?category=${encodeURIComponent(c.value)}`,
            label: t(`categories.${c.key}`),
            icon: CATEGORY_ICONS[c.key],
            active: onHome && category === c.value && c.value !== ALL_CATEGORY,
          }),
        )}
      </div>

      <div className="guide-section">
        {renderItem({
          to: '/landing',
          label: t('nav.aboutVidShare'),
          icon: MdOutlineInfo,
          active: location.pathname === '/landing',
        })}
      </div>
    </nav>
  );
};

export default Guide;
