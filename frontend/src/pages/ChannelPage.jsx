import { useState, useEffect, useRef } from 'react';
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
    <div className="container" style={{ paddingTop: 'var(--space-xl)', paddingBottom: 'var(--space-2xl)' }}>
      {/* Channel Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-xl)',
        padding: 'var(--space-xl)',
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--border-color)',
        marginBottom: 'var(--space-2xl)',
      }}>
        {displayUser?.avatar ? (
          <img src={displayUser.avatar} alt="" style={{ width: 80, height: 80, borderRadius: '50%' }} />
        ) : (
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'var(--accent-gradient)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 'var(--font-size-3xl)',
            flexShrink: 0,
          }}>
            {displayUser?.username?.charAt(0).toUpperCase() || <FiUser />}
          </div>
        )}
        <div>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700 }}>
            {displayUser?.displayName || displayUser?.username || 'Channel'}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', marginTop: 4 }}>
            @{displayUser?.username}
          </p>
          {displayUser?.channelDescription && (
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 8 }}>
              {displayUser.channelDescription}
            </p>
          )}
        </div>
      </div>

      {/* Videos */}
      <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 600, marginBottom: 'var(--space-lg)' }}>
        {isOwner ? t('channel.yourVideos') : t('channel.videos')}
      </h2>

      {loading ? (
        <div className="video-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <div className="skeleton" style={{ aspectRatio: '16/9', borderRadius: 'var(--radius-lg)' }} />
              <div style={{ padding: '8px 0' }}>
                <div className="skeleton" style={{ height: 14, marginBottom: 6, borderRadius: 4 }} />
                <div className="skeleton" style={{ height: 12, width: '60%', borderRadius: 4 }} />
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
                          className="video-card-dropdown"
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
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: 'var(--space-2xl)' }}>
              {Array.from({ length: pagination.pages }).map((_, i) => (
                <button
                  key={i}
                  className={`btn ${page === i + 1 ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setPage(i + 1)}
                  style={{ minWidth: 40, padding: '8px 12px' }}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: 'var(--space-2xl)', color: 'var(--text-muted)' }}>
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
                <FiEdit3 className="channel-modal-icon" size={20} />
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
                  {t('channel.editTitleLabel')} <span style={{ color: 'var(--danger)' }}>*</span>
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
                  style={{ resize: 'vertical' }}
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
                      <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
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

      <style>{`
        .video-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: var(--space-lg);
        }
        @media (max-width: 1200px) {
          .video-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 768px) {
          .video-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 480px) {
          .video-grid { grid-template-columns: 1fr; }
        }

        /* Video Card Wrapper */
        .channel-video-card-wrapper {
          position: relative;
        }

        /* 3-Dot Menu Dropdown */
        .video-card-menu-container {
          position: absolute;
          top: 8px;
          right: 8px;
          z-index: 10;
        }

        .video-card-menu-trigger {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: var(--radius-full);
          background: rgba(15, 23, 42, 0.75);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.15);
          cursor: pointer;
          transition: all var(--transition-fast);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
          opacity: 0.85;
        }

        .channel-video-card-wrapper:hover .video-card-menu-trigger,
        .video-card-menu-trigger.active {
          opacity: 1;
          transform: scale(1.05);
          background: rgba(15, 23, 42, 0.95);
          border-color: rgba(255, 255, 255, 0.3);
        }

        .video-card-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          min-width: 180px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 6px;
          box-shadow: var(--shadow-lg);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          z-index: 30;
          animation: dropdownFadeIn 0.15s ease-out;
        }

        @keyframes dropdownFadeIn {
          from {
            opacity: 0;
            transform: translateY(-6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .dropdown-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 8px 12px;
          border-radius: var(--radius-md);
          background: transparent;
          border: none;
          color: var(--text-primary);
          font-size: var(--font-size-sm);
          font-weight: 500;
          cursor: pointer;
          transition: background var(--transition-fast), color var(--transition-fast);
          text-align: left;
        }

        .dropdown-item:hover {
          background: var(--bg-card-hover);
          color: var(--accent-primary);
        }

        .dropdown-item-danger:hover {
          background: rgba(255, 107, 107, 0.12);
          color: var(--danger);
        }

        .dropdown-divider {
          height: 1px;
          background: var(--border-color);
          margin: 4px 6px;
        }

        .video-visibility-badge {
          position: absolute;
          top: 8px;
          left: 8px;
          z-index: 5;
          background: rgba(15, 23, 42, 0.75);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.12);
          font-size: 11px;
          font-weight: 500;
          padding: 3px 8px;
          border-radius: var(--radius-sm);
          display: inline-flex;
          align-items: center;
          gap: 4px;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
        }

        /* Modal Overlay & Card */
        .channel-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: var(--space-md);
          animation: modalOverlayFade 0.2s ease-out;
        }

        @keyframes modalOverlayFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .channel-modal-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-xl);
          width: 100%;
          max-width: 520px;
          padding: var(--space-xl);
          box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.45);
          animation: modalCardScale 0.2s ease-out;
        }

        @keyframes modalCardScale {
          from {
            opacity: 0;
            transform: scale(0.96) translateY(8px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        .channel-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-lg);
          padding-bottom: var(--space-md);
          border-bottom: 1px solid var(--border-color);
        }

        .channel-modal-title-group {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .channel-modal-icon {
          color: var(--accent-primary);
        }

        .channel-modal-title {
          font-size: var(--font-size-xl);
          font-weight: 700;
          color: var(--text-primary);
        }

        .channel-modal-close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: var(--radius-md);
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .channel-modal-close:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .channel-modal-form {
          display: flex;
          flex-direction: column;
          gap: var(--space-md);
        }

        .channel-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: var(--space-md);
          margin-top: var(--space-lg);
          padding-top: var(--space-md);
          border-top: 1px solid var(--border-color);
        }
      `}</style>
    </div>
  );
};

export default ChannelPage;
