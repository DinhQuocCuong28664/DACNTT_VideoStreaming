import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  MdOutlineThumbUp,
  MdThumbUp,
  MdOutlineThumbDown,
  MdThumbDown,
  MdOutlineShare,
  MdCheck,
  MdMoreVert,
  MdErrorOutline,
  MdOutlineDelete,
} from 'react-icons/md';
import Avatar from '../components/Common/Avatar';
import { useAuth } from '../context/useAuth';
import videoApi from '../api/videoApi';
import VideoPlayer from '../components/Video/VideoPlayer';
import VideoCard from '../components/Video/VideoCard';
import { formatViews, formatDate, timeAgo } from '../utils/format';
import './WatchPage.css';

const WatchPage = () => {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
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
  const [composerFocused, setComposerFocused] = useState(false);
  const [openCommentMenu, setOpenCommentMenu] = useState(null);

  // Related videos state
  const [relatedVideos, setRelatedVideos] = useState([]);
  const [relatedFilter, setRelatedFilter] = useState('all');

  const [descExpanded, setDescExpanded] = useState(false);

  useEffect(() => {
    const fetchVideoAndComments = async () => {
      setLoading(true);
      setDescExpanded(false);
      setRelatedFilter('all');
      try {
        const [videoRes, commentsRes, relatedRes] = await Promise.all([
          videoApi.getVideoById(id),
          videoApi.getComments(id),
          videoApi.getRelatedVideos(id, 10).catch(() => ({ data: { data: { videos: [] } } })),
        ]);

        const v = videoRes.data.data.video;
        setVideo(v);
        setLikesCount(v.likes?.length || 0);
        setDislikesCount(v.dislikes?.length || 0);
        setRelatedVideos(relatedRes.data?.data?.videos || []);

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

  // Đóng menu ba chấm của bình luận khi bấm ra ngoài hoặc nhấn Esc.
  useEffect(() => {
    if (!openCommentMenu) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'mousedown' && e.target.closest('.comment-menu')) return;
      setOpenCommentMenu(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [openCommentMenu]);

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

  /**
   * Xin cấp lại CloudFront Signed Cookie khi cookie cũ hết hạn giữa buổi xem.
   *
   * Cookie chỉ sống hai giờ, còn trang này trước đây chỉ xin đúng một lần lúc
   * mở. Người xem một video dài, hoặc để tab mở qua mốc hai giờ, sẽ gặp 403 ở
   * segment kế tiếp mà không có đường nào lấy cookie mới ngoài tải lại trang.
   *
   * Cố ý để lỗi ném ra ngoài: trình phát phân biệt "gia hạn được" với "không
   * còn quyền xem" dựa vào promise này resolve hay reject.
   */
  const handleAuthExpired = useCallback(async () => {
    await videoApi.getPlaybackAuth(id);
  }, [id]);

  /* Khách bấm thích, không thích hay bình luận: đưa sang trang đăng nhập rồi
     quay lại đúng video này, thay vì hộp thoại alert của trình duyệt. */
  const goToLogin = () => navigate('/login', { state: { from: location.pathname } });

  const handleLike = async () => {
    if (!isAuthenticated) return goToLogin();
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
    if (!isAuthenticated) return goToLogin();
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
    if (!isAuthenticated) return goToLogin();

    setPostingComment(true);
    try {
      const res = await videoApi.addComment(id, newComment.trim());
      setComments([res.data.data.comment, ...comments]);
      setNewComment('');
      setComposerFocused(false);
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setPostingComment(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    setOpenCommentMenu(null);
    if (!window.confirm(t('watch.confirmDeleteComment'))) return;
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

  if (loading) {
    return (
      <div className="container watch-page">
        <div className="watch-layout">
          <div className="watch-main">
            <div className="skeleton skeleton-thumb watch-skeleton-player" />
            <div className="skeleton watch-skeleton-title" />
            <div className="skeleton watch-skeleton-meta" />
          </div>
        </div>
      </div>
    );
  }

  if (!video) {
    return <Navigate to="/404" replace />;
  }

  const user = video.user || {};
  const channelName = user.displayName || user.username;
  const videoSrc = video.hlsUrl || null;
  const isReady = video.status === 'READY' && videoSrc && playbackReady;
  const locale = i18n.resolvedLanguage === 'en' ? 'en-US' : 'vi-VN';

  const canDelete = (c) =>
    currentUser && (currentUser._id === c.user?._id || currentUser._id === user._id);

  const fromChannel = relatedVideos.filter((v) => v.user?._id === user._id);
  const shownRelated = relatedFilter === 'channel' ? fromChannel : relatedVideos;

  const description = video.description || '';
  const collapsible = description.length > 220 || description.split('\n').length > 3;

  return (
    <div className="container watch-page">
      <div className="watch-layout">
        <div className="watch-main">
          {/* Trình phát */}
          {playbackDenied ? (
            <Navigate to="/403" replace />
          ) : isReady ? (
            <VideoPlayer
              src={videoSrc}
              poster={video.thumbnailUrl}
              onViewThreshold={handleViewThreshold}
              onAuthExpired={handleAuthExpired}
            />
          ) : (
            <div className="player-placeholder">
              {video.status === 'ERROR' ? (
                <>
                  <MdErrorOutline className="player-placeholder-icon" aria-hidden="true" />
                  <p>{t('watch.processingFailed')}</p>
                </>
              ) : (
                <>
                  <div className="spinner" />
                  <p>{video.status === 'PROCESSING' ? t('watch.transcoding') : t('watch.queued')}</p>
                </>
              )}
            </div>
          )}

          <h1 className="watch-title">{video.title}</h1>

          {/* Hàng kênh và nút thao tác. Dự án không có tính năng đăng ký kênh,
              nên không có nút Subscribe như YouTube. */}
          <div className="watch-owner-row">
            <Link to={`/channel/${user._id}`} className="watch-owner">
              <Avatar
                src={user.avatar}
                className="watch-owner-avatar"
                fallbackClassName="avatar-placeholder watch-owner-avatar"
              >
                {user.username?.charAt(0).toUpperCase() || '?'}
              </Avatar>
              <div className="watch-owner-text">
                <p className="watch-owner-name">{channelName}</p>
                <p className="watch-owner-handle">@{user.username}</p>
              </div>
            </Link>

            <div className="watch-actions">
              <div className="segmented-pill">
                <button
                  type="button"
                  onClick={handleLike}
                  aria-pressed={hasLiked}
                  aria-label={t('watch.like')}
                  title={t('watch.like')}
                >
                  {hasLiked ? <MdThumbUp /> : <MdOutlineThumbUp />}
                  <span className="tabular-nums">{formatViews(likesCount)}</span>
                </button>
                <span className="segmented-divider" aria-hidden="true" />
                <button
                  type="button"
                  onClick={handleDislike}
                  aria-pressed={hasDisliked}
                  aria-label={t('watch.dislike')}
                  title={t('watch.dislike')}
                >
                  {hasDisliked ? <MdThumbDown /> : <MdOutlineThumbDown />}
                  {dislikesCount > 0 && (
                    <span className="tabular-nums">{formatViews(dislikesCount)}</span>
                  )}
                </button>
              </div>

              <button type="button" className="btn btn-secondary" onClick={handleShare}>
                {copied ? <MdCheck /> : <MdOutlineShare />}
                <span>{copied ? t('watch.copied') : t('watch.share')}</span>
              </button>
            </div>
          </div>

          {/* Hộp mô tả xám: dòng đầu là lượt xem và ngày đăng; mô tả dài thì
              thu gọn còn ba dòng, bấm vào hộp để mở rộng như YouTube. */}
          <div
            className={`watch-description${descExpanded ? ' is-expanded' : ''}${collapsible ? ' is-collapsible' : ''}`}
            onClick={() => collapsible && !descExpanded && setDescExpanded(true)}
          >
            <p className="watch-description-meta">
              <span>{t('watch.viewsFull', { value: Number(video.views || 0).toLocaleString(locale) })}</span>
              <span>{formatDate(i18n.resolvedLanguage, video.createdAt)}</span>
            </p>
            {description && <div className="watch-description-text">{description}</div>}
            {collapsible && (
              <button
                type="button"
                className="watch-description-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  setDescExpanded((v) => !v);
                }}
                aria-expanded={descExpanded}
              >
                {descExpanded ? t('watch.showLess') : t('watch.showMore')}
              </button>
            )}
          </div>

          {/* Bình luận */}
          <section className="comments-section" aria-labelledby="comments-heading">
            <h2 id="comments-heading" className="comments-heading">
              {t('watch.commentsHeading', { count: comments.length })}
            </h2>

            {isAuthenticated ? (
              <form onSubmit={handleAddComment} className="comment-form">
                <Avatar
                  src={currentUser?.avatar}
                  className="comment-avatar"
                  fallbackClassName="avatar-placeholder comment-avatar"
                >
                  {currentUser?.username?.charAt(0).toUpperCase()}
                </Avatar>
                <div className="comment-form-body">
                  <input
                    type="text"
                    className="comment-input"
                    placeholder={t('watch.commentPlaceholder')}
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onFocus={() => setComposerFocused(true)}
                    aria-label={t('watch.commentAriaLabel')}
                  />
                  {(composerFocused || newComment) && (
                    <div className="comment-form-actions">
                      <button
                        type="button"
                        className="btn btn-plain"
                        onClick={() => {
                          setNewComment('');
                          setComposerFocused(false);
                        }}
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={postingComment || !newComment.trim()}
                      >
                        {postingComment ? t('watch.commentSubmitting') : t('watch.commentSubmit')}
                      </button>
                    </div>
                  )}
                </div>
              </form>
            ) : (
              <p className="comment-login-hint">
                <Link to="/login" state={{ from: location.pathname }}>
                  {t('nav.login')}
                </Link>{' '}
                {t('watch.loginPrompt')}
              </p>
            )}

            <div className="comment-list">
              {comments.map((c) => (
                <article key={c._id} className="comment-item">
                  <Avatar
                    src={c.user?.avatar}
                    className="comment-avatar"
                    fallbackClassName="avatar-placeholder comment-avatar"
                  >
                    {c.user?.username?.charAt(0).toUpperCase() || '?'}
                  </Avatar>
                  <div className="comment-body">
                    <p className="comment-head">
                      <Link to={`/channel/${c.user?._id}`} className="comment-author">
                        @{c.user?.username}
                      </Link>
                      {c.createdAt && <span className="comment-time">{timeAgo(t, c.createdAt)}</span>}
                    </p>
                    <p className="comment-text">{c.content}</p>
                  </div>
                  {canDelete(c) && (
                    <div className="comment-menu">
                      <button
                        type="button"
                        className="btn-icon comment-menu-trigger"
                        onClick={() => setOpenCommentMenu(openCommentMenu === c._id ? null : c._id)}
                        aria-label={t('watch.commentActions')}
                        aria-expanded={openCommentMenu === c._id}
                        aria-haspopup="menu"
                      >
                        <MdMoreVert />
                      </button>
                      {openCommentMenu === c._id && (
                        <div className="menu-panel comment-menu-panel" role="menu">
                          <button
                            type="button"
                            className="dropdown-item"
                            onClick={() => handleDeleteComment(c._id)}
                          >
                            <MdOutlineDelete />
                            <span>{t('watch.deleteComment')}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>

        {/* Cột phải: video tiếp theo */}
        {relatedVideos.length > 0 && (
          <aside className="watch-sidebar" aria-label={t('watch.relatedVideos')}>
            {fromChannel.length > 0 && (
              <div className="watch-sidebar-chips" role="tablist">
                <button
                  type="button"
                  role="tab"
                  className="chip"
                  aria-selected={relatedFilter === 'all'}
                  onClick={() => setRelatedFilter('all')}
                >
                  {t('categories.all')}
                </button>
                <button
                  type="button"
                  role="tab"
                  className="chip"
                  aria-selected={relatedFilter === 'channel'}
                  onClick={() => setRelatedFilter('channel')}
                >
                  {t('watch.fromChannel', { name: channelName })}
                </button>
              </div>
            )}
            <div className="watch-sidebar-list">
              {shownRelated.map((item) => (
                <VideoCard key={item._id} video={item} variant="compact" />
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};

export default WatchPage;
