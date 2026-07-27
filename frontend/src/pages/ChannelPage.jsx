import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { FiUser, FiTrash2, FiEdit3 } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import videoApi from '../api/videoApi';
import VideoCard from '../components/Video/VideoCard';

const ChannelPage = () => {
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
        const res = await videoApi.getUserVideos(userId, page, 12);
        setVideos(res.data.data.videos);
        setPagination(res.data.data.pagination);

        // Extract channel user from first video, or use current user if owner
        if (res.data.data.videos.length > 0 && res.data.data.videos[0].user) {
          setChannelUser(res.data.data.videos[0].user);
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
    if (!window.confirm('Bạn có chắc muốn xóa video này?')) return;
    try {
      await videoApi.deleteVideo(videoId);
      setVideos(videos.filter((v) => v._id !== videoId));
    } catch (err) {
      alert('Xóa video thất bại: ' + (err.response?.data?.message || err.message));
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
            @{displayUser?.username} • {displayUser?.subscribers || 0} người đăng ký
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
        Video {isOwner ? 'của bạn' : ''}
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
                      onClick={(e) => { e.preventDefault(); handleDelete(video._id); }}
                      title="Xóa video"
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </div>
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
          <p>Chưa có video nào.</p>
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
