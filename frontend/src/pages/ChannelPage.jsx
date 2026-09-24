import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  MdMoreVert,
  MdOutlineEdit,
  MdOutlineDelete,
  MdOutlineVideoLibrary,
  MdErrorOutline,
} from 'react-icons/md';
import Avatar from '../components/Common/Avatar';
import useToast from '../components/Common/Toast';
import { useAuth } from '../context/useAuth';
import videoApi from '../api/videoApi';
import userApi from '../api/userApi';
import VideoCard from '../components/Video/VideoCard';
import { SkeletonCard, LoadMoreFooter } from '../components/Video/VideoListParts';
import EditVideoDialog from '../components/Video/EditVideoDialog';
import { VISIBILITY_ICON } from '../components/Video/visibilityIcons';
import useInfiniteList from '../hooks/useInfiniteList';
import useRefreshWhilePending from '../hooks/useRefreshWhilePending';
import { formatDate } from '../utils/format';
import './ChannelPage.css';

const PAGE_SIZE = 12;
const VISIBILITY_MODES = ['public', 'unlisted', 'private'];
/** Khớp với USER_VIDEO_SORTS ở backend (services/videoService.js). */
const SORTS = ['latest', 'popular', 'oldest'];

const ChannelPage = () => {
  const { t, i18n } = useTranslation();
  const { userId } = useParams();
  const { user: currentUser } = useAuth();
  const [channelUser, setChannelUser] = useState(null);
  const [tab, setTab] = useState('videos');
  const [sort, setSort] = useState('latest');
  const [descExpanded, setDescExpanded] = useState(false);
  const [editingVideo, setEditingVideo] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [toast, showToast] = useToast();

  const isOwner = Boolean(currentUser && currentUser._id === userId);

  const fetchPage = useCallback(
    async (page) => {
      const res = await videoApi.getUserVideos(userId, page, PAGE_SIZE, sort);
      const { videos, pagination } = res.data.data;
      return { items: videos, pages: pagination?.pages, total: pagination?.total };
    },
    [userId, sort],
  );

  const list = useInfiniteList(fetchPage);
  const { items: videos, setItems: setVideos } = list;

  useEffect(() => {
    setTab('videos');
    setSort('latest');
    setDescExpanded(false);
    // Endpoint hồ sơ công khai chạy được cả khi kênh chưa có video nào; nếu nó
    // lỗi mà đây là kênh của chính mình thì dùng tạm dữ liệu phiên đăng nhập.
    userApi
      .getPublicProfile(userId)
      .then((res) => setChannelUser(res.data.data.user))
      .catch(() => setChannelUser(isOwner ? currentUser : null));
  }, [userId, isOwner, currentUser]);

  // Đóng menu ba chấm khi bấm ra ngoài hoặc nhấn Esc.
  useEffect(() => {
    if (!activeMenuId) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'mousedown' && e.target.closest('.owner-menu')) return;
      setActiveMenuId(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [activeMenuId]);

  /**
   * Chuyển mã chạy trên AWS Batch nên trạng thái đổi ở máy chủ mà trang này
   * không biết. Chỉ nạp lại khi còn video chưa xong — kênh toàn video READY
   * thì không có gì để chờ và vòng lặp không chạy lần nào.
   */
  const hasPendingVideos = videos.some(
    (v) => v.status === 'PROCESSING' || v.status === 'UPLOADING'
  );

  /**
   * Chỉ hoà lại bốn trường do đường ống chuyển mã ghi (xem updateVideoReady
   * trong transcoder/src/dbHandler.js), thay vì thay nguyên danh sách.
   *
   * Thay nguyên danh sách sẽ giẫm lên các cập nhật lạc quan: đổi chế độ hiển
   * thị cập nhật giao diện ngay rồi mới gửi PUT, nên một lượt nạp lại rơi
   * đúng vào giữa sẽ kéo giá trị cũ của máy chủ về và người dùng thấy nút
   * nhảy ngược lại. Hoà theo trường khiến việc đó không thể xảy ra.
   *
   * Với cuộn vô hạn, danh sách đang hiển thị trải trên nhiều trang, nên lượt
   * nạp lại lấy một lần đủ số video đã hiện (trang 1, limit = số trang × 12).
   */
  const loadedPages = list.page;
  const refreshPipelineFields = useCallback(async () => {
    try {
      const res = await videoApi.getUserVideos(userId, 1, Math.max(loadedPages, 1) * PAGE_SIZE, sort);
      const fresh = new Map(res.data.data.videos.map((v) => [v._id, v]));

      setVideos((prev) =>
        prev.map((v) => {
          const next = fresh.get(v._id);
          if (!next || next.status === v.status) return v;
          return {
            ...v,
            status: next.status,
            hlsUrl: next.hlsUrl,
            thumbnailUrl: next.thumbnailUrl,
            duration: next.duration,
          };
        })
      );
    } catch (err) {
      // Im lặng: đây là lượt nạp nền, người dùng không yêu cầu gì cả. Lần
      // sau sẽ thử lại, và F5 vẫn là lối thoát cuối.
      console.error('Failed to refresh video statuses:', err);
    }
  }, [userId, loadedPages, sort, setVideos]);

  useRefreshWhilePending(hasPendingVideos, refreshPipelineFields);

  const handleDelete = async (videoId) => {
    setActiveMenuId(null);
    if (!window.confirm(t('channel.confirmDelete'))) return;
    try {
      await videoApi.deleteVideo(videoId);
      setVideos((prev) => prev.filter((v) => v._id !== videoId));
      showToast(t('channel.deleted'));
    } catch (err) {
      showToast(t('channel.deleteFailed', { message: err.response?.data?.message || err.message }));
    }
  };

  /**
   * Đặt trực tiếp chế độ hiển thị mong muốn (public, unlisted, private).
   * Cập nhật lạc quan để phản hồi tức thì, khôi phục nếu máy chủ trả lỗi.
   */
  const handleSetVisibility = async (video, target) => {
    setActiveMenuId(null);
    if (video.visibility === target) return;

    const previous = video.visibility;
    setVideos((prev) => prev.map((v) => (v._id === video._id ? { ...v, visibility: target } : v)));

    try {
      await videoApi.updateVideo(video._id, { visibility: target });
      showToast(t('channel.visibilityChanged', { mode: t(`visibility.${target}`) }));
    } catch (err) {
      setVideos((prev) => prev.map((v) => (v._id === video._id ? { ...v, visibility: previous } : v)));
      showToast(t('channel.visibilityFailed', { message: err.response?.data?.message || err.message }));
    }
  };

  const handleSaved = (updated) => {
    setVideos((prev) => prev.map((v) => (v._id === updated._id ? { ...v, ...updated } : v)));
    setEditingVideo(null);
    showToast(t('channel.editSuccess'));
  };

  const displayUser = channelUser || (isOwner ? currentUser : null);
  const channelName = displayUser?.displayName || displayUser?.username || '';
  const description = displayUser?.channelDescription || '';

  const renderOwnerControls = (video) => {
    const isMenuOpen = activeMenuId === video._id;
    return (
      <div className="owner-menu">
        <button
          type="button"
          className="btn-icon owner-menu-trigger"
          onClick={() => setActiveMenuId(isMenuOpen ? null : video._id)}
          aria-label={t('channel.videoOptions')}
          aria-expanded={isMenuOpen}
          aria-haspopup="menu"
        >
          <MdMoreVert />
        </button>
        {isMenuOpen && (
          <div className="menu-panel owner-menu-panel" role="menu">
            <button
              type="button"
              className="dropdown-item"
              onClick={() => {
                setActiveMenuId(null);
                setEditingVideo(video);
              }}
            >
              <MdOutlineEdit />
              <span>{t('channel.editVideo')}</span>
            </button>
            <div className="dropdown-divider" />
            {VISIBILITY_MODES.filter((mode) => mode !== video.visibility).map((mode) => {
              const Icon = VISIBILITY_ICON[mode];
              return (
                <button
                  key={mode}
                  type="button"
                  className="dropdown-item"
                  onClick={() => handleSetVisibility(video, mode)}
                >
                  <Icon />
                  <span>{t('channel.setVisibilityTo', { mode: t(`visibility.${mode}`) })}</span>
                </button>
              );
            })}
            <div className="dropdown-divider" />
            <button type="button" className="dropdown-item" onClick={() => handleDelete(video._id)}>
              <MdOutlineDelete />
              <span>{t('channel.deleteVideo')}</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  const visibilityBadge = (video) => {
    const Icon = VISIBILITY_ICON[video.visibility] || VISIBILITY_ICON.public;
    return (
      <span className="video-visibility-badge">
        <Icon aria-hidden="true" />
        {t(`visibility.${video.visibility || 'public'}`)}
      </span>
    );
  };

  let videosBody;
  if (list.status === 'loading') {
    videosBody = (
      <div className="video-grid">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} avatar={false} />
        ))}
      </div>
    );
  } else if (list.status === 'error' && videos.length === 0) {
    videosBody = (
      <div className="empty-state">
        <MdErrorOutline className="empty-state-icon" aria-hidden="true" />
        <p className="empty-state-title">{t('home.loadErrorTitle')}</p>
        <button type="button" className="btn btn-secondary" onClick={list.retry}>
          {t('home.retry')}
        </button>
      </div>
    );
  } else if (videos.length === 0) {
    videosBody = (
      <div className="empty-state">
        <MdOutlineVideoLibrary className="empty-state-icon" aria-hidden="true" />
        <p className="empty-state-title">{isOwner ? t('channel.emptyOwner') : t('channel.empty')}</p>
        {isOwner && (
          <Link to="/upload" className="btn btn-primary">
            {t('home.emptyAction')}
          </Link>
        )}
      </div>
    );
  } else {
    videosBody = (
      <>
        <div className="video-grid">
          {videos.map((video) => (
            <div key={video._id} className="channel-card">
              <VideoCard
                video={video}
                showAvatar={false}
                thumbnailOverlay={isOwner ? visibilityBadge(video) : null}
              />
              {isOwner && renderOwnerControls(video)}
            </div>
          ))}
          {list.status === 'loadingMore' &&
            Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={`more-${i}`} avatar={false} />)}
        </div>
        <LoadMoreFooter list={list} />
      </>
    );
  }

  return (
    <div className="channel-page">
      <header className="channel-header">
        <Avatar
          src={displayUser?.avatar}
          className="channel-header-avatar"
          fallbackClassName="avatar-placeholder channel-header-avatar"
        >
          {displayUser?.username?.charAt(0).toUpperCase() || '?'}
        </Avatar>
        <div className="channel-header-text">
          <h1 className="channel-header-name">{channelName}</h1>
          <p className="channel-header-meta">
            {displayUser?.username && <span className="channel-header-handle">@{displayUser.username}</span>}
            {list.status !== 'loading' && (
              <span>{t('channel.videoCount', { count: list.total })}</span>
            )}
          </p>
          {description && (
            <button
              type="button"
              className={`channel-header-desc ${descExpanded ? 'is-expanded' : ''}`}
              onClick={() => setDescExpanded((v) => !v)}
              aria-expanded={descExpanded}
            >
              {description}
            </button>
          )}
          {isOwner && (
            <div className="channel-header-actions">
              <Link to="/settings" className="btn btn-secondary">
                {t('channel.customize')}
              </Link>
              <Link to="/upload" className="btn btn-secondary">
                {t('nav.uploadVideo')}
              </Link>
            </div>
          )}
        </div>
      </header>

      <div className="channel-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className="channel-tab"
          aria-selected={tab === 'videos'}
          onClick={() => setTab('videos')}
        >
          {t('channel.videos')}
        </button>
        <button
          type="button"
          role="tab"
          className="channel-tab"
          aria-selected={tab === 'about'}
          onClick={() => setTab('about')}
        >
          {t('channel.about')}
        </button>
      </div>

      {tab === 'videos' ? (
        <section className="channel-videos" role="tabpanel">
          <div className="channel-sort" role="radiogroup" aria-label={t('channel.sortLabel')}>
            {SORTS.map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                className="chip"
                aria-checked={sort === key}
                onClick={() => setSort(key)}
              >
                {t(`channel.sort.${key}`)}
              </button>
            ))}
          </div>
          {videosBody}
        </section>
      ) : (
        <section className="channel-about" role="tabpanel">
          <h2 className="channel-about-heading">{t('channel.description')}</h2>
          <p className="channel-about-desc">{description || t('channel.noDescription')}</p>
          <h2 className="channel-about-heading">{t('channel.stats')}</h2>
          <ul className="channel-about-stats">
            {displayUser?.createdAt && (
              <li>{t('channel.joined', { date: formatDate(i18n.resolvedLanguage, displayUser.createdAt) })}</li>
            )}
            <li>{t('channel.videoCount', { count: list.total })}</li>
          </ul>
        </section>
      )}

      {editingVideo && (
        <EditVideoDialog
          video={editingVideo}
          onClose={() => setEditingVideo(null)}
          onSaved={handleSaved}
        />
      )}

      {toast}
    </div>
  );
};

export default ChannelPage;
