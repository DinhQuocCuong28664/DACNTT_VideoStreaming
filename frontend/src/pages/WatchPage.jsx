import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FiEye, FiClock, FiShare2, FiUser, FiThumbsUp, FiThumbsDown, FiMessageSquare, FiTrash2 } from 'react-icons/fi';
import { useAuth } from '../context/useAuth';
import videoApi from '../api/videoApi';
import VideoPlayer from '../components/Video/VideoPlayer';

const WatchPage = () => {
  const { id } = useParams();
  const { user: currentUser, isAuthenticated } = useAuth();
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Engagement state
  const [likesCount, setLikesCount] = useState(0);
  const [dislikesCount, setDislikesCount] = useState(0);
  const [hasLiked, setHasLiked] = useState(false);
  const [hasDisliked, setHasDisliked] = useState(false);

  // Comment state
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  useEffect(() => {
    const fetchVideoAndComments = async () => {
      setLoading(true);
      try {
        const [videoRes, commentsRes] = await Promise.all([
          videoApi.getVideoById(id),
          videoApi.getComments(id),
        ]);

        const v = videoRes.data.data.video;
        setVideo(v);
        setLikesCount(v.likes?.length || 0);
        setDislikesCount(v.dislikes?.length || 0);

        if (currentUser) {
          setHasLiked(v.likes?.includes(currentUser._id));
          setHasDisliked(v.dislikes?.includes(currentUser._id));
        }

        setComments(commentsRes.data.data.comments || []);
      } catch (err) {
        console.error('Failed to load video or comments:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchVideoAndComments();
  }, [id, currentUser]);

  const handleLike = async () => {
    if (!isAuthenticated) return alert('Vui lòng đăng nhập để thích video');
    try {
      const res = await videoApi.toggleLike(id);
      setLikesCount(res.data.data.likesCount);
      setDislikesCount(res.data.data.dislikesCount);
      setHasLiked(!hasLiked);
      if (hasDisliked) setHasDisliked(false);
    } catch (err) {
      console.error('Failed to toggle like:', err);
    }
  };

  const handleDislike = async () => {
    if (!isAuthenticated) return alert('Vui lòng đăng nhập để không thích video');
    try {
      const res = await videoApi.toggleDislike(id);
      setLikesCount(res.data.data.likesCount);
      setDislikesCount(res.data.data.dislikesCount);
      setHasDisliked(!hasDisliked);
      if (hasLiked) setHasLiked(false);
    } catch (err) {
      console.error('Failed to toggle dislike:', err);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    if (!isAuthenticated) return alert('Vui lòng đăng nhập để bình luận');

    setPostingComment(true);
    try {
      const res = await videoApi.addComment(id, newComment.trim());
      setComments([res.data.data.comment, ...comments]);
      setNewComment('');
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setPostingComment(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Bạn có chắc muốn xóa bình luận này?')) return;
    try {
      await videoApi.deleteComment(commentId);
      setComments(comments.filter((c) => c._id !== commentId));
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

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
  const videoSrc = video.hlsUrl || null;
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

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button className={`btn ${hasLiked ? 'btn-primary' : 'btn-secondary'}`} onClick={handleLike}>
              <FiThumbsUp /> {likesCount}
            </button>
            <button className={`btn ${hasDisliked ? 'btn-primary' : 'btn-secondary'}`} onClick={handleDislike}>
              <FiThumbsDown /> {dislikesCount}
            </button>
            <button className="btn btn-secondary" onClick={handleShare}>
              <FiShare2 /> {copied ? 'Đã sao chép link!' : 'Chia sẻ'}
            </button>
          </div>
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
            marginBottom: 'var(--space-lg)',
          }}>
            {video.description}
          </div>
        )}

        {/* Comments Section */}
        <div style={{ marginTop: 'var(--space-2xl)', paddingTop: 'var(--space-lg)', borderTop: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: 'var(--space-lg)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <FiMessageSquare /> Bình luận ({comments.length})
          </h3>

          {/* Add Comment Form */}
          {isAuthenticated ? (
            <form onSubmit={handleAddComment} style={{ marginBottom: 'var(--space-xl)', display: 'flex', gap: 12 }}>
              <input
                type="text"
                className="form-control"
                placeholder="Viết bình luận của bạn..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn btn-primary" disabled={postingComment}>
                {postingComment ? 'Đang gửi...' : 'Gửi'}
              </button>
            </form>
          ) : (
            <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-lg)' }}>
              <Link to="/login" style={{ color: 'var(--primary-color)' }}>Đăng nhập</Link> để viết bình luận.
            </p>
          )}

          {/* Comment List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {comments.map((c) => (
              <div key={c._id} style={{ display: 'flex', gap: 12, padding: 12, background: 'var(--bg-card)', borderRadius: 8 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-gradient)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 600,
                }}>
                  {c.user?.username?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{c.user?.displayName || c.user?.username}</span>
                    {currentUser && (currentUser._id === c.user?._id || currentUser._id === user._id) && (
                      <button onClick={() => handleDeleteComment(c._id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                        <FiTrash2 size={14} />
                      </button>
                    )}
                  </div>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>{c.content}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WatchPage;
