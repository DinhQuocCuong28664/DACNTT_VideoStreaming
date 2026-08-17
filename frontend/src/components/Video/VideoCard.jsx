import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiEye, FiClock } from 'react-icons/fi';
import './VideoCard.css';

const VideoCard = ({ video }) => {
  /**
   * Ảnh đại diện có thể tồn tại trong cơ sở dữ liệu nhưng không tải được:
   * tệp bị xoá khỏi kho lưu trữ, đường dẫn trỏ tới bucket cũ, hoặc quyền truy
   * cập đã đổi. Trước đây chỉ có phương án dự phòng cho trường hợp *thiếu*
   * thumbnailUrl, nên khi liên kết có mà hỏng, trình duyệt hiển thị biểu tượng
   * ảnh vỡ kèm nguyên tên tệp — nhìn như trang bị lỗi. Theo dõi sự kiện lỗi để
   * quay về đúng khối dự phòng vốn đã có.
   */
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const showThumbnail = Boolean(video.thumbnailUrl) && !thumbnailFailed;
  const formatViews = (views) => {
    if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`;
    if (views >= 1000) return `${(views / 1000).toFixed(1)}K`;
    return views;
  };

  const formatTimeAgo = (dateStr) => {
    const seconds = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (seconds < 60) return 'Vừa xong';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} phút trước`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} ngày trước`;
    const months = Math.floor(days / 30);
    return `${months} tháng trước`;
  };

  const user = video.user || {};

  return (
    <Link to={`/watch/${video._id}`} className="video-card">
      <div className="video-card-thumbnail">
        {showThumbnail ? (
          <img
            src={video.thumbnailUrl}
            alt=""
            loading="lazy"
            onError={() => setThumbnailFailed(true)}
          />
        ) : (
          <div className="thumbnail-placeholder">
            <span>▶</span>
          </div>
        )}
        {video.duration > 0 && (
          <span className="video-duration">
            {Math.floor(video.duration / 60)}:{String(Math.floor(video.duration % 60)).padStart(2, '0')}
          </span>
        )}
        {video.status === 'PROCESSING' && (
          <span className="video-status-badge">Đang xử lý...</span>
        )}
      </div>

      <div className="video-card-info">
        <div className="video-card-avatar">
          {user.avatar ? (
            <img src={user.avatar} alt="" />
          ) : (
            <div className="mini-avatar">
              {user.username?.charAt(0).toUpperCase() || '?'}
            </div>
          )}
        </div>

        <div className="video-card-details">
          <h3 className="video-card-title">{video.title}</h3>
          <p className="video-card-channel">
            {user.displayName || user.username || 'Unknown'}
          </p>
          <div className="video-card-meta">
            <span><FiEye /> {formatViews(video.views)} lượt xem</span>
            <span><FiClock /> {formatTimeAgo(video.createdAt)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
};

export default VideoCard;
