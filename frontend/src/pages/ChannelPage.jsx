import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FiUser, FiTrash2, FiGlobe, FiLock } from 'react-icons/fi';
import { useAuth } from '../context/useAuth';
import videoApi from '../api/videoApi';
import userApi from '../api/userApi';
import VideoCard from '../components/Video/VideoCard';

const ChannelPage = () => {
  const { t } = useTranslation();
  const { userId } = useParams();
  const { user: currentUser } = useAuth();
  const [videos, setVideos] = useState([]);
  const [channelUser, setChannelUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  const isOwner = currentUser && currentUser._id === userId;

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
   * Chuyển đổi chế độ hiển thị giữa công khai và riêng tư.
   * Cập nhật lạc quan (optimistic update) để giao diện phản hồi tức thì,
   * và khôi phục trạng thái cũ nếu máy chủ trả về lỗi.
   */
  const handleToggleVisibility = async (video) => {
    const next = video.visibility === 'public' ? 'private' : 'public';

    setVideos((prev) =>
      prev.map((v) => (v._id === video._id ? { ...v, visibility: next } : v))
    );

    try {
      await videoApi.updateVideo(video._id, { visibility: next });
    } catch (err) {
      setVideos((prev) =>
        prev.map((v) => (v._id === video._id ? { ...v, visibility: video.visibility } : v))
      );
      alert(t('channel.visibilityFailed', { message: err.response?.data?.message || err.message }));
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
              <div key={video._id} style={{ position: 'relative' }}>
                <VideoCard video={video} />
                {isOwner && (
                  <div style={{
                    position: 'absolute', top: 8, right: 8,
                    display: 'flex', gap: 4, zIndex: 5,
                  }}>
                    <button
                      className="btn-icon"
                      style={{ background: 'rgba(0,0,0,0.7)', color: '#fff', width: 32, height: 32 }}
                      onClick={(e) => { e.preventDefault(); handleToggleVisibility(video); }}
                      title={
                        video.visibility === 'public'
                          ? t('channel.makePrivate')
                          : t('channel.makePublic')
                      }
                    >
                      {video.visibility === 'public' ? <FiGlobe size={14} /> : <FiLock size={14} />}
                    </button>
                    <button
                      className="btn-icon"
                      style={{ background: 'rgba(0,0,0,0.7)', color: '#fff', width: 32, height: 32 }}
                      onClick={(e) => { e.preventDefault(); handleDelete(video._id); }}
                      title={t('channel.deleteVideo')}
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                )}
                {isOwner && video.visibility !== 'public' && (
                  <span style={{
                    position: 'absolute', top: 8, left: 8, zIndex: 5,
                    background: 'rgba(0,0,0,0.7)', color: '#fff',
                    fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-sm)',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    <FiLock size={11} /> {t('channel.privateBadge')}
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
      `}</style>
    </div>
  );
};

export default ChannelPage;
