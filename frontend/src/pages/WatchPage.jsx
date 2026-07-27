import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FiEye, FiClock, FiShare2, FiUser } from 'react-icons/fi';
import videoApi from '../api/videoApi';
import VideoPlayer from '../components/Video/VideoPlayer';

const WatchPage = () => {
  const { id } = useParams();
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchVideo = async () => {
      setLoading(true);
      try {
        const res = await videoApi.getVideoById(id);
        setVideo(res.data.data.video);
      } catch (err) {
        console.error('Failed to load video:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchVideo();
  }, [id]);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatViews = (views) => {
    if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`;
    if (views >= 1000) return `${(views / 1000).toFixed(1)}K`;
    return views;
  };

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: 'var(--space-xl)', maxWidth: 960 }}>
        <div className="skeleton" style={{ aspectRatio: '16/9', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-lg)' }} />
        <div className="skeleton" style={{ height: 28, width: '70%', borderRadius: 4, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 16, width: '40%', borderRadius: 4 }} />
      </div>
    );
  }

  if (!video) {
    return (
      <div className="container flex-center" style={{ minHeight: '50vh', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <p style={{ fontSize: 'var(--font-size-xl)', color: 'var(--text-muted)' }}>Video không tồn tại hoặc đã bị xóa</p>
        <Link to="/" className="btn btn-primary">← Về trang chủ</Link>
      </div>
    );
  }

  const user = video.user || {};

  // Determine video source
  let videoSrc = video.hlsUrl || null;

  // If no HLS URL yet (video still processing), show status
  const isReady = video.status === 'READY' && videoSrc;

  return (
    <div className="container" style={{ paddingTop: 'var(--space-xl)', paddingBottom: 'var(--space-2xl)', maxWidth: 960 }}>
      {/* Video Player */}
      {isReady ? (
        <VideoPlayer src={videoSrc} poster={video.thumbnailUrl} />
      ) : (
        <div style={{
          aspectRatio: '16/9',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 'var(--space-md)',
        }}>
          {video.status === 'PROCESSING' ? (
            <>
              <div className="spinner" style={{ width: 48, height: 48 }} />
              <p style={{ color: 'var(--text-muted)' }}>Video đang được xử lý (Transcoding)...</p>
              <span className="badge badge-processing">PROCESSING</span>
            </>
          ) : video.status === 'ERROR' ? (
            <>
              <p style={{ color: 'var(--danger)', fontSize: 'var(--font-size-lg)' }}>❌ Xử lý video thất bại</p>
              <span className="badge badge-error">ERROR</span>
            </>
          ) : (
            <>
              <p style={{ color: 'var(--text-muted)' }}>⏳ Video đang chờ xử lý...</p>
              <span className="badge badge-processing">UPLOADING</span>
            </>
          )}
        </div>
      )}

      {/* Video Info */}
      <div style={{ marginTop: 'var(--space-lg)' }}>
        <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, marginBottom: 'var(--space-sm)' }}>
          {video.title}
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><FiEye /> {formatViews(video.views)} lượt xem</span>
            <span>•</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><FiClock /> {formatDate(video.createdAt)}</span>
          </div>

          <button className="btn btn-secondary" onClick={handleShare}>
            <FiShare2 /> {copied ? 'Đã sao chép!' : 'Chia sẻ'}
          </button>
        </div>

        {/* Channel Info */}
        <Link
          to={`/channel/${user._id}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-md)',
            padding: 'var(--space-md)',
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            marginBottom: 'var(--space-lg)',
            transition: 'all var(--transition-fast)',
          }}
        >
          {user.avatar ? (
            <img src={user.avatar} alt="" style={{ width: 44, height: 44, borderRadius: '50%' }} />
          ) : (
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: 'var(--accent-gradient)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: 'var(--font-size-lg)',
            }}>
              {user.username?.charAt(0).toUpperCase() || <FiUser />}
            </div>
          )}
          <div>
            <p style={{ fontWeight: 600 }}>{user.displayName || user.username}</p>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
              {user.subscribers || 0} người đăng ký
            </p>
          </div>
        </Link>

        {/* Description */}
        {video.description && (
          <div style={{
            padding: 'var(--space-md)',
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-color)',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--text-secondary)',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.7,
          }}>
            {video.description}
          </div>
        )}

        {/* Tags */}
        {video.tags && video.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', marginTop: 'var(--space-md)' }}>
            {video.tags.map((tag, i) => (
              <span key={i} style={{
                padding: '4px 12px',
                background: 'rgba(108, 92, 231, 0.1)',
                borderRadius: 'var(--radius-xl)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--accent-primary)',
                fontWeight: 500,
              }}>
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WatchPage;
