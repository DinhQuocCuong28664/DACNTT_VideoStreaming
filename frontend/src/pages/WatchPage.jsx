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
  MdErrorOutline,
  MdOutlinedFlag,
  MdBlock,
  MdOutlineShield,
  MdWarningAmber,
} from 'react-icons/md';
import Avatar from '../components/Common/Avatar';
import useToast from '../components/Common/Toast';
import { useAuth } from '../context/useAuth';
import videoApi from '../api/videoApi';
import VideoPlayer from '../components/Video/VideoPlayer';
import CommentSection from '../components/Video/CommentSection';
import VideoCard from '../components/Video/VideoCard';
import ReportDialog from '../components/Video/ReportDialog';
import SubscribeButton from '../components/Channel/SubscribeButton';
import JoinButton from '../components/Channel/JoinButton';
import LockedVideoOverlay from '../components/Video/LockedVideoOverlay';
import AppealBox from '../components/Video/AppealBox';
import { can } from '../utils/roles';
import { formatViews, formatDate } from '../utils/format';
import { parseStartTime } from '../utils/startTime';
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
  // Mã lỗi kiểm duyệt từ máy chủ (VIDEO_REMOVED, VIDEO_UNDER_REVIEW): hiện màn
  // hình giải thích thay vì đưa người xem sang trang 404 chung chung.
  const [unavailable, setUnavailable] = useState(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const refetchVideo = () => setRefreshCount((c) => c + 1);
  const [reportOpen, setReportOpen] = useState(false);
  const [warningDismissed, setWarningDismissed] = useState(false);

  useEffect(() => {
    setWarningDismissed(false);
  }, [id]);
  const [toast, showToast] = useToast();
  // Xem và phát được video bị gỡ: admin và operator (không phải auditor). Tên biến giữ nguyên để
  // không phải sửa các chỗ dùng bên dưới.
  const isAdmin = can(currentUser, 'content:viewRemoved');

  // Engagement state
  const [likesCount, setLikesCount] = useState(0);
  const [dislikesCount, setDislikesCount] = useState(0);
  const [hasLiked, setHasLiked] = useState(false);
  const [hasDisliked, setHasDisliked] = useState(false);

  // Related videos state
  const [relatedVideos, setRelatedVideos] = useState([]);
  const [relatedFilter, setRelatedFilter] = useState('all');

  const [descExpanded, setDescExpanded] = useState(false);

  useEffect(() => {
    const fetchVideo = async () => {
      setLoading(true);
      setDescExpanded(false);
      setRelatedFilter('all');
      setUnavailable(null);
      try {
        const [videoRes, relatedRes] = await Promise.all([
          videoApi.getVideoById(id),
          videoApi.getRelatedVideos(id, 10).catch(() => ({ data: { data: { videos: [] } } })),
        ]);

        const v = videoRes.data.data.video;
        setVideo(v);
        setLikesCount(v.likesCount || 0);
        setDislikesCount(v.dislikesCount || 0);
        setRelatedVideos(relatedRes.data?.data?.videos || []);

        // API chỉ trả số lượng; lựa chọn của chính người xem nằm ở viewerReaction.
        setHasLiked(v.viewerReaction === 'like');
        setHasDisliked(v.viewerReaction === 'dislike');

        // Xin CloudFront Signed Cookie TRƯỚC khi dựng trình phát. Nếu khởi tạo
        // HLS.js trước, các yêu cầu tải manifest đầu tiên sẽ bị CloudFront từ
        // chối với mã 403 vì trình duyệt chưa có cookie hợp lệ.
        //
        // Video đã bị gỡ thì chủ video vẫn mở được trang nhưng không phát được
        // (máy chủ trả 403 VIDEO_REMOVED) — không xin cookie để khỏi bị chuyển sang trang 403.
        if (v.status === 'READY' && (v.moderation?.status !== 'blocked' || isAdmin) && !v.isLocked) {
          try {
            await videoApi.getPlaybackAuth(id);
          } catch (authErr) {
            console.error('Failed to obtain playback authorization:', authErr);
            setPlaybackDenied(true);
          }
        }

        setPlaybackReady(true);
      } catch (err) {
        const code = err.response?.data?.code;
        if (code === 'VIDEO_REMOVED' || code === 'VIDEO_UNDER_REVIEW') {
          setUnavailable(code);
        } else {
          console.error('Failed to load video:', err);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchVideo();
  }, [id, currentUser, isAdmin, refreshCount]);

  // Video còn đang xử lý — tự động kiểm tra lại định kỳ để chuyển sang phát
  // ngay khi chuyển mã xong, thay vì bắt người xem tự bấm F5.
  useEffect(() => {
    if (!video || (video.status !== 'PROCESSING' && video.status !== 'UPLOADING')) return;

    const interval = setInterval(async () => {
      try {
        const res = await videoApi.getVideoById(id);
        const v = res.data.data.video;

        // Chuyển mã xong cũng là lúc kiểm duyệt có kết quả: video vừa bị gỡ
        // thì không xin cookie, như ở lần tải trang đầu.
        if (v.status === 'READY' && (v.moderation?.status !== 'blocked' || isAdmin)) {
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
  }, [id, video?.status, isAdmin]);

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

  const handleOpenReport = () => {
    if (!isAuthenticated) return goToLogin();
    setReportOpen(true);
  };

  const handleReported = (alreadyReported) => {
    setReportOpen(false);
    showToast(alreadyReported ? t('report.already') : t('report.success'));
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

  if (unavailable) {
    const removed = unavailable === 'VIDEO_REMOVED';
    const Icon = removed ? MdBlock : MdOutlineShield;
    return (
      <div className="container watch-page">
        <div className="empty-state watch-unavailable" role="alert">
          <Icon className="empty-state-icon" aria-hidden="true" />
          <p className="empty-state-title">
            {removed ? t('watch.removedTitle') : t('watch.underReviewTitle')}
          </p>
          <p className="empty-state-desc">
            {removed ? t('watch.removedBody') : t('watch.underReviewBody')}
          </p>
          <Link to="/" className="btn btn-secondary">
            {t('forbidden.home')}
          </Link>
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
  const moderationStatus = video.moderation?.status;
  const isRemoved = moderationStatus === 'blocked';
  const isOwnVideo = Boolean(currentUser && currentUser._id === user._id);
  // Chủ video bị gỡ vẫn xem được trang, nhưng trình phát bị thay bằng thông báo.
  const isReady = video.status === 'READY' && videoSrc && playbackReady && (!isRemoved || isAdmin);
  const canReport =
    video.status === 'READY' && !isOwnVideo && moderationStatus !== 'flagged' && !isRemoved;
  const locale = i18n.resolvedLanguage === 'en' ? 'en-US' : 'vi-VN';
  // `?t=90` or `?t=1m30s` from a shared "at current time" link
  const startTime = parseStartTime(new URLSearchParams(location.search).get('t'));

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
          ) : isRemoved && !isAdmin ? (
            <div className="player-placeholder">
              <MdBlock className="player-placeholder-icon" aria-hidden="true" />
              <p>{t('watch.removedTitle')}</p>
            </div>
          ) : video.hasViolence && !warningDismissed ? (
            <div className="player-placeholder player-violence-warning">
              {video.thumbnailUrl && (
                <div
                  className="violence-warning-backdrop"
                  style={{ backgroundImage: `url(${video.thumbnailUrl})` }}
                  aria-hidden="true"
                />
              )}
              <div className="violence-warning-content">
                <MdWarningAmber className="violence-warning-icon" aria-hidden="true" />
                <h2 className="violence-warning-title">{t('watch.violenceWarningTitle')}</h2>
                <p className="violence-warning-desc">{t('watch.violenceWarningDesc')}</p>
                <div className="violence-warning-actions">
                  <button
                    type="button"
                    className="btn btn-primary violence-proceed-btn"
                    onClick={() => setWarningDismissed(true)}
                  >
                    {t('watch.proceedButton')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-plain violence-back-btn"
                    onClick={() => navigate(-1)}
                  >
                    {t('watch.goBackButton')}
                  </button>
                </div>
              </div>
            </div>
          ) : isReady ? (
            video.isLocked ? (
              <div className="player-locked-wrapper" style={{ position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <img
                  src={video.thumbnailUrl}
                  alt={video.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <LockedVideoOverlay
                  channelId={user._id}
                  channelName={channelName}
                  channelAvatar={user.avatar}
                  onUnlockSuccess={refetchVideo}
                />
              </div>
            ) : (
              <VideoPlayer
                src={videoSrc}
                poster={video.thumbnailUrl}
                onViewThreshold={handleViewThreshold}
                onAuthExpired={handleAuthExpired}
                startTime={startTime}
                shareUrl={`${window.location.origin}/watch/${video._id}`}
              />
            )
          ) : (
            <div className="player-placeholder">
              {video.status === 'ERROR' ? (
                <>
                  <MdErrorOutline className="player-placeholder-icon" aria-hidden="true" />
                  <p>{t('watch.processingFailed')}</p>
                </>
              ) : video.status === 'PROCESSING' ? (
                <div className="processing-progress-box">
                  <div className="spinner" />
                  <p className="processing-status-text">
                    {t('watch.transcoding')} {typeof video.processingProgress === 'number' && video.processingProgress > 0 ? `(${video.processingProgress}%)` : ''}
                  </p>
                  {typeof video.processingProgress === 'number' && video.processingProgress > 0 && (
                    <div className="processing-progress-bar-container">
                      <div
                        className="processing-progress-bar-fill"
                        style={{ width: `${Math.min(100, Math.max(5, video.processingProgress))}%` }}
                      />
                    </div>
                  )}
                  <p className="processing-status-subtext">
                    {(video.processingProgress || 0) < 25
                      ? t('watch.stagePreparing')
                      : (video.processingProgress || 0) < 90
                        ? t('watch.stageTranscoding')
                        : t('watch.stageFinalizing')}
                  </p>
                </div>
              ) : (
                <>
                  <div className="spinner" />
                  <p>{t('watch.queued')}</p>
                </>
              )}
            </div>
          )}

          {/* Chỉ chủ video và quản trị viên nhận được video đang bị ẩn — với
              mọi người khác máy chủ đã trả 403 từ trước. */}
          {(moderationStatus === 'flagged' || isRemoved) && (
            <div className={`watch-moderation-notice${isRemoved ? ' is-removed' : ''}`} role="status">
              {isRemoved ? <MdBlock aria-hidden="true" /> : <MdOutlineShield aria-hidden="true" />}
              <div>
                <p>
                  {isAdmin && !isOwnVideo
                    ? t('watch.adminNotice', { status: t(`moderationStatus.${moderationStatus}`) })
                    : isRemoved
                      ? t('watch.ownerRemovedNotice')
                      : t('watch.ownerUnderReviewNotice')}
                </p>
                {video.moderation?.note && (
                  <p className="watch-moderation-note">{t('watch.moderationNote', { note: video.moderation.note })}</p>
                )}
                {isRemoved && isOwnVideo && <AppealBox videoId={video._id} />}
              </div>
            </div>
          )}

          <h1 className="watch-title">
            {video.title}
            {video.hasViolence && (
              <span className="watch-violence-chip" title={t('watch.violenceWarningBadge')}>
                <MdWarningAmber aria-hidden="true" /> {t('watch.violenceWarningBadge')}
              </span>
            )}
          </h1>

          {/* Hàng kênh và nút thao tác: Nút Subscribe phong cách YouTube */}
          <div className="watch-owner-row">
            <div className="watch-owner-meta">
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

              <JoinButton
                channelId={user._id}
                channelName={channelName}
                channelAvatar={user.avatar}
                onMembershipChange={refetchVideo}
              />

              <SubscribeButton
                channelId={user._id}
                channelName={channelName}
                initialSubscribersCount={user.subscribers}
              />
            </div>

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

              {canReport && (
                <button type="button" className="btn btn-secondary" onClick={handleOpenReport}>
                  <MdOutlinedFlag />
                  <span>{t('watch.report')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Hộp mô tả xám: dòng đầu là lượt xem và ngày đăng; mô tả dài thì
              thu gọn còn ba dòng, bấm vào hộp để mở rộng như YouTube. */}
          <div
            className={`watch-description${descExpanded ? ' is-expanded' : ''}${collapsible ? ' is-collapsible' : ''}`}
            onClick={() => collapsible && !descExpanded && setDescExpanded(true)}
          >
            <p className="watch-description-meta">
              <span>{t('watch.viewsFull', { count: video.views || 0, value: Number(video.views || 0).toLocaleString(locale) })}</span>
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

          <CommentSection videoId={id} videoOwner={user} />
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

      {reportOpen && (
        <ReportDialog videoId={id} onClose={() => setReportOpen(false)} onReported={handleReported} />
      )}
      {toast}
    </div>
  );
};

export default WatchPage;
