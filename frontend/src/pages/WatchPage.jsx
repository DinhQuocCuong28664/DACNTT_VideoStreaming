import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { FiEye, FiClock, FiShare2, FiUser, FiThumbsUp, FiThumbsDown, FiMessageSquare, FiTrash2 } from 'react-icons/fi';
import { useAuth } from '../context/useAuth';
import videoApi from '../api/videoApi';
import VideoPlayer from '../components/Video/VideoPlayer';
import './WatchPage.css';

const WatchPage = () => {
  const { id } = useParams();
  const { user: currentUser, isAuthenticated } = useAuth();
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  // Chỉ dựng trình phát sau khi đã xin xong quyền phát (Signed Cookie)
  const [playbackReady, setPlaybackReady] = useState(false);
  const [playbackDenied, setPlaybackDenied] = useState(false);

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

        // Xin CloudFront Signed Cookie TRƯỚC khi dựng trình phát. Nếu khởi tạo
        // HLS.js trước, các yêu cầu tải manifest đầu tiên sẽ bị CloudFront từ
        // chối với mã 403 vì trình duyệt chưa có cookie hợp lệ.
        if (v.status === 'READY') {
          try {
            await videoApi.getPlaybackAuth(id);
          } catch (authErr) {
            console.error('Failed to obtain playback authorization:', authErr);
            setPlaybackDenied(true);
          }
        }

        setPlaybackReady(true);
      } catch (err) {
        console.error('Failed to load video or comments:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchVideoAndComments();
  }, [id, currentUser]);

  // Video còn đang xử lý — tự động kiểm tra lại định kỳ để chuyển sang phát
  // ngay khi chuyển mã xong, thay vì bắt người xem tự bấm F5.
  useEffect(() => {
    if (!video || (video.status !== 'PROCESSING' && video.status !== 'UPLOADING')) return;

    const interval = setInterval(async () => {
      try {
        const res = await videoApi.getVideoById(id);
        const v = res.data.data.video;

        if (v.status === 'READY') {
          try {
            await videoApi.getPlaybackAuth(id);
          } catch (authErr) {
            console.error('Failed to obtain playback authorization:', authErr);
            setPlaybackDenied(true);
          }
        }

        setVideo(v);
      } catch (err) {
        console.error('Failed to poll video status:', err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [id, video?.status]);

  /**
   * Được trình phát gọi một lần sau khi video đã phát đủ ngưỡng thời gian.
   * Lỗi ở đây không cần hiển thị cho người dùng vì việc đếm lượt xem
   * không ảnh hưởng tới trải nghiệm xem video.
   */
  const handleViewThreshold = useCallback(async () => {
    try {
      const res = await videoApi.registerView(id);
      if (res.data?.data?.counted) {
        setVideo((prev) => (prev ? { ...prev, views: res.data.data.views } : prev));
      }
    } catch (err) {
      console.error('Failed to register view:', err);
    }
  }, [id]);

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
      <div className="container watch-page">
        <div
          className="skeleton"
          style={{ aspectRatio: '16 / 9', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-lg)' }}
        />
        <div className="skeleton watch-skeleton-title" />
        <div className="skeleton watch-skeleton-meta" />
      </div>
    );
  }

  if (!video) {
    return <Navigate to="/404" replace />;
  }

  const user = video.user || {};
  const videoSrc = video.hlsUrl || null;
  const isReady = video.status === 'READY' && videoSrc && playbackReady;

  return (
    <div className="container watch-page">
      {/* Trình phát */}
      {playbackDenied ? (
        <Navigate to="/403" replace />
      ) : isReady ? (
        <VideoPlayer
          src={videoSrc}
          poster={video.thumbnailUrl}
          onViewThreshold={handleViewThreshold}
        />
      ) : (
        <div className="player-placeholder">
          {video.status === 'PROCESSING' ? (
            <>
              <div className="spinner" />
              <p>Video đang được chuyển mã…</p>
              <span className="badge badge-processing">PROCESSING</span>
            </>
          ) : video.status === 'ERROR' ? (
            <>
              <p className="player-placeholder-error">Xử lý video thất bại</p>
              <span className="badge badge-error">ERROR</span>
            </>
          ) : (
            <>
              <p>Video đang chờ xử lý…</p>
              <span className="badge badge-processing">UPLOADING</span>
            </>
          )}
        </div>
      )}

      {/* Thông tin video */}
      <div className="watch-info">
        <h1 className="watch-title">{video.title}</h1>

        <div className="watch-meta-row">
          <div className="watch-stats">
            <span>
              <FiEye /> {formatViews(video.views)} lượt xem
            </span>
            <span aria-hidden="true">•</span>
            <span>
              <FiClock /> {formatDate(video.createdAt)}
            </span>
          </div>

          <div className="watch-actions">
            <button
              className={`btn ${hasLiked ? 'btn-primary' : 'btn-secondary'}`}
              onClick={handleLike}
              aria-pressed={hasLiked}
            >
              <FiThumbsUp /> {likesCount}
            </button>
            <button
              className={`btn ${hasDisliked ? 'btn-primary' : 'btn-secondary'}`}
              onClick={handleDislike}
              aria-pressed={hasDisliked}
            >
              <FiThumbsDown /> {dislikesCount}
            </button>
            <button className="btn btn-secondary" onClick={handleShare}>
              <FiShare2 /> {copied ? 'Đã sao chép' : 'Chia sẻ'}
            </button>
          </div>
        </div>

        {/* Kênh */}
        <Link to={`/channel/${user._id}`} className="channel-card">
          {user.avatar ? (
            <img src={user.avatar} alt="" className="channel-avatar" />
          ) : (
            <div className="channel-avatar channel-avatar-fallback">
              {user.username?.charAt(0).toUpperCase() || <FiUser />}
            </div>
          )}
          <div>
            <p className="channel-name">{user.displayName || user.username}</p>
            <p className="channel-handle">@{user.username}</p>
          </div>
        </Link>

        {/* Mô tả */}
        {video.description && (
          <div className="watch-description">{video.description}</div>
        )}

        {/* Bình luận */}
        <section className="comments-section">
          <h3 className="comments-heading">
            <FiMessageSquare /> Bình luận ({comments.length})
          </h3>

          {isAuthenticated ? (
            <form onSubmit={handleAddComment} className="comment-form">
              <input
                type="text"
                className="form-control"
                placeholder="Viết bình luận của bạn…"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                aria-label="Nội dung bình luận"
              />
              <button type="submit" className="btn btn-primary" disabled={postingComment}>
                {postingComment ? 'Đang gửi…' : 'Gửi'}
              </button>
            </form>
          ) : (
            <p className="comment-login-hint">
              <Link to="/login">Đăng nhập</Link> để viết bình luận.
            </p>
          )}

          <div className="comment-list">
            {comments.map((c) => (
              <article key={c._id} className="comment-item">
                <div className="comment-avatar">
                  {c.user?.username?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="comment-body">
                  <div className="comment-head">
                    <span className="comment-author">
                      {c.user?.displayName || c.user?.username}
                    </span>
                    {currentUser &&
                      (currentUser._id === c.user?._id || currentUser._id === user._id) && (
                        <button
                          type="button"
                          className="comment-delete"
                          onClick={() => handleDeleteComment(c._id)}
                          title="Xoá bình luận"
                          aria-label="Xoá bình luận"
                        >
                          <FiTrash2 size={14} />
                        </button>
                      )}
                  </div>
                  <p className="comment-text">{c.content}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default WatchPage;
