import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FiUser,
  FiTrash2,
  FiGlobe,
  FiLock,
  FiLink,
  FiEdit3,
  FiMoreVertical,
  FiX,
  FiCheck,
} from 'react-icons/fi';
import { useAuth } from '../context/useAuth';
import videoApi from '../api/videoApi';
import userApi from '../api/userApi';
import VideoCard from '../components/Video/VideoCard';
import { UPLOAD_CATEGORIES } from '../i18n/categories';
import useRefreshWhilePending from '../hooks/useRefreshWhilePending';
import './ChannelPage.css';

/**
 * Ba chế độ hiển thị, đi vòng theo đúng thứ tự này mỗi lần nhấn nút.
 *
 * Trước đây nút chỉ bật tắt giữa hai trạng thái: `visibility === 'public'` thì
 * chuyển sang riêng tư, còn lại thì chuyển sang công khai. Nghĩa là một video
 * đặt "không liệt kê" lúc tải lên mà bấm nút này sẽ thành công khai và không
 * còn đường quay lại, dù biểu mẫu tải lên vẫn cho chọn cả ba. Chọn được đúng
 * một lần rồi mất.
 */
const VISIBILITY_CYCLE = ['public', 'unlisted', 'private'];
const VISIBILITY_ICON = { public: FiGlobe, unlisted: FiLink, private: FiLock };

// indexOf trả về -1 với giá trị lạ, nên nhánh đó rơi về 'public'.
const nextVisibility = (current) =>
  VISIBILITY_CYCLE[(VISIBILITY_CYCLE.indexOf(current) + 1) % VISIBILITY_CYCLE.length];

const ChannelPage = () => {
  const { t } = useTranslation();
  const { userId } = useParams();
  const { user: currentUser } = useAuth();
  const [videos, setVideos] = useState([]);
  const [channelUser, setChannelUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  // Edit Video state
  const [editingVideo, setEditingVideo] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editVisibility, setEditVisibility] = useState('public');
  const [savingEdit, setSavingEdit] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState(null);

  const isOwner = currentUser && currentUser._id === userId;

  // Click outside to close active video menu
  useEffect(() => {
    const handleDocClick = (e) => {
      if (!e.target.closest('.video-card-menu-container')) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [videosRes, profileRes] = await Promise.all([
          videoApi.getUserVideos(userId, page, 12),
          userApi.getPublicProfile(userId).catch(() => null),
        ]);

        setVideos(videosRes.data.data.videos);
        setPagination(videosRes.data.data.pagination);

        // Public profile endpoint works even when the user has zero videos.
        // Falls back to the current user's own data (owner) if the request fails.
        if (profileRes) {
          setChannelUser(profileRes.data.data.user);
        } else if (isOwner) {
          setChannelUser(currentUser);
        }
      } catch (err) {
        console.error('Failed to load channel:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId, page, isOwner, currentUser]);

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
   * nhảy ngược lại. Hoà theo trường khiến việc đó không thể xảy ra: tiêu đề,
   * mô tả, danh mục và chế độ hiển thị đều do người dùng làm chủ, lượt nạp
   * lại này không đụng tới.
   */
  const refreshPipelineFields = useCallback(async () => {
    try {
      const res = await videoApi.getUserVideos(userId, page, 12);
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
  }, [userId, page]);

  useRefreshWhilePending(hasPendingVideos, refreshPipelineFields);

  const handleDelete = async (videoId) => {
    if (!window.confirm(t('channel.confirmDelete'))) return;
    try {
      await videoApi.deleteVideo(videoId);
      setVideos(videos.filter((v) => v._id !== videoId));
    } catch (err) {
      alert(t('channel.deleteFailed', { message: err.response?.data?.message || err.message }));
    }
  };

  /**
   * Đặt trực tiếp chế độ hiển thị mong muốn (public, unlisted, private)
   * Cập nhật lạc quan (optimistic update) để phản hồi tức thì.
   */
  const handleSetVisibility = async (video, targetVisibility) => {
    if (video.visibility === targetVisibility) return;

    const oldVisibility = video.visibility;
    setVideos((prev) =>
      prev.map((v) => (v._id === video._id ? { ...v, visibility: targetVisibility } : v))
    );

    try {
      await videoApi.updateVideo(video._id, { visibility: targetVisibility });
    } catch (err) {
      setVideos((prev) =>
        prev.map((v) => (v._id === video._id ? { ...v, visibility: oldVisibility } : v))
      );
      alert(t('channel.visibilityFailed', { message: err.response?.data?.message || err.message }));
    }
  };

  /**
   * Chuyển chế độ hiển thị sang trạng thái kế tiếp trong vòng ba chế độ.
   * Cập nhật lạc quan (optimistic update) để giao diện phản hồi tức thì,
   * và khôi phục trạng thái cũ nếu máy chủ trả về lỗi.
   */
  const handleCycleVisibility = async (video) => {
    const next = nextVisibility(video.visibility);
    handleSetVisibility(video, next);
  };

  const handleOpenEdit = (video) => {
    setEditingVideo(video);
    setEditTitle(video.title || '');
    setEditDescription(video.description || '');
    setEditCategory(video.category || UPLOAD_CATEGORIES[0].value);
    setEditVisibility(video.visibility || 'public');
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingVideo) return;
    setSavingEdit(true);
    try {
      const res = await videoApi.updateVideo(editingVideo._id, {
        title: editTitle,
        description: editDescription,
        category: editCategory,
        visibility: editVisibility,
      });
      const updated = res.data.data.video;
      setVideos((prev) =>
        prev.map((v) => (v._id === editingVideo._id ? { ...v, ...updated } : v))
      );
      setEditingVideo(null);
    } catch (err) {
      alert(err.response?.data?.message || err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const displayUser = channelUser || currentUser;

  return (
    <div className="container channel-page">
      {/* Channel Header */}
      <header className="channel-hero">
        <div className="channel-hero-texture" aria-hidden="true" />
        {displayUser?.avatar ? (
          <img src={displayUser.avatar} alt="" className="channel-hero-avatar" />
        ) : (
          <div className="channel-hero-avatar channel-hero-avatar-fallback">
            {displayUser?.username?.charAt(0).toUpperCase() || <FiUser />}
          </div>
        )}
        <div className="channel-hero-text">
          <span className="section-label">{t('channel.pageLabel')}</span>
          <h1 className="channel-hero-name display-heading">
            {displayUser?.displayName || displayUser?.username || 'Channel'}
          </h1>
          <p className="channel-hero-handle">
            @{displayUser?.username}
          </p>
          {displayUser?.channelDescription && (
            <p className="channel-hero-desc">
              {displayUser.channelDescription}
            </p>
          )}
        </div>
      </header>

      {/* Videos */}
      <h2 className="channel-section-title">
        {isOwner ? t('channel.yourVideos') : t('channel.videos')}
      </h2>

      {loading ? (
        <div className="video-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <div className="skeleton skeleton-thumb" />
              <div className="channel-skeleton-lines">
                <div className="skeleton channel-skeleton-line" />
                <div className="skeleton channel-skeleton-line short" />
              </div>
            </div>
          ))}
        </div>
      ) : videos.length > 0 ? (
        <>
          <div className="video-grid">
            {videos.map((video) => (
              <div key={video._id} className="channel-video-card-wrapper">
                <VideoCard video={video} />
                {isOwner && (() => {
                  const VisibilityIcon = VISIBILITY_ICON[video.visibility] ?? FiGlobe;
                  const isMenuOpen = activeMenuId === video._id;

                  return (
                    <div className="video-card-menu-container">
                      <button
                        className={`video-card-menu-trigger ${isMenuOpen ? 'active' : ''}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setActiveMenuId(isMenuOpen ? null : video._id);
                        }}
                        title="Tùy chọn video"
                        aria-label="Video options"
                      >
                        <FiMoreVertical size={16} />
                      </button>

                      {isMenuOpen && (
                        <div
                          className="video-card-dropdown menu-panel"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="dropdown-item"
                            onClick={(e) => {
                              e.preventDefault();
                              setActiveMenuId(null);
                              handleOpenEdit(video);
                            }}
                          >
                            <FiEdit3 size={15} />
                            <span>{t('channel.editVideo')}</span>
                          </button>

                          {/* Danh sách các chế độ hiển thị khác mà người dùng có thể chọn trực tiếp */}
                          {VISIBILITY_CYCLE.filter((mode) => mode !== video.visibility).map((mode) => {
                            const ModeIcon = VISIBILITY_ICON[mode] ?? FiGlobe;
                            return (
                              <button
                                key={mode}
                                className="dropdown-item"
                                onClick={(e) => {
                                  e.preventDefault();
                                  setActiveMenuId(null);
                                  handleSetVisibility(video, mode);
                                }}
                              >
                                <ModeIcon size={15} />
                                <span>{t('channel.setVisibilityTo', { mode: t(`visibility.${mode}`) })}</span>
                              </button>
                            );
                          })}

                          <div className="dropdown-divider" />

                          <button
                            className="dropdown-item dropdown-item-danger"
                            onClick={(e) => {
                              e.preventDefault();
                              setActiveMenuId(null);
                              handleDelete(video._id);
                            }}
                          >
                            <FiTrash2 size={15} />
                            <span>{t('channel.deleteVideo')}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {/* Nhãn góc trái nói đúng chế độ đang đặt */}
                {isOwner && video.visibility !== 'public' && (
                  <span className="video-visibility-badge">
                    {video.visibility === 'unlisted' ? <FiLink size={11} /> : <FiLock size={11} />}
                    {t(`visibility.${video.visibility}`)}
                  </span>
                )}
              </div>
            ))}
          </div>

          {pagination && pagination.pages > 1 && (
            <div className="channel-pagination">
              {Array.from({ length: pagination.pages }).map((_, i) => (
                <button
                  key={i}
                  className={`btn ${page === i + 1 ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setPage(i + 1)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="channel-empty">
          <p>{t('channel.empty')}</p>
        </div>
      )}

      {/* Edit Video Modal */}
      {editingVideo && (
        <div
          className="channel-modal-overlay"
          onClick={() => !savingEdit && setEditingVideo(null)}
        >
          <div
            className="channel-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="channel-modal-header">
              <div className="channel-modal-title-group">
                <span className="channel-modal-icon"><FiEdit3 size={18} /></span>
                <h3 className="channel-modal-title">{t('channel.editModalTitle')}</h3>
              </div>
              <button
                type="button"
                className="channel-modal-close"
                onClick={() => setEditingVideo(null)}
                disabled={savingEdit}
                aria-label="Close"
              >
                <FiX size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="channel-modal-form">
              <div className="form-group">
                <label className="form-label" htmlFor="edit-title">
                  {t('channel.editTitleLabel')} <span className="required-mark">*</span>
                </label>
                <input
                  id="edit-title"
                  type="text"
                  className="form-control"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={100}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="edit-desc">
                  {t('channel.editDescLabel')}
                </label>
                <textarea
                  id="edit-desc"
                  className="form-control"
                  rows={4}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  maxLength={5000}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="edit-category">
                  {t('channel.editCategoryLabel')}
                </label>
                <select
                  id="edit-category"
                  className="form-control"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                >
                  {UPLOAD_CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {t(`categories.${cat.key}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="edit-visibility">
                  {t('channel.editVisibilityLabel', 'Chế độ hiển thị')}
                </label>
                <select
                  id="edit-visibility"
                  className="form-control"
                  value={editVisibility}
                  onChange={(e) => setEditVisibility(e.target.value)}
                >
                  <option value="public">{t('visibility.public')}</option>
                  <option value="unlisted">{t('visibility.unlisted')}</option>
                  <option value="private">{t('visibility.private')}</option>
                </select>
              </div>

              <div className="channel-modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingVideo(null)}
                  disabled={savingEdit}
                >
                  {t('channel.editCancel')}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingEdit}
                >
                  {savingEdit ? (
                    <>
                      <div className="spinner spinner-sm" />
                      <span>{t('channel.editSaving')}</span>
                    </>
                  ) : (
                    <>
                      <FiCheck size={16} />
                      <span>{t('channel.editSave')}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default ChannelPage;
