import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FiPlay } from 'react-icons/fi';
import Avatar from '../Common/Avatar';
import { formatViews, formatDuration, timeAgo } from '../../utils/format';
import './VideoCard.css';

/**
 * Thẻ video kiểu YouTube, ba biến thể dùng chung một nguồn dữ liệu:
 * - `grid`: lưới trang chủ và trang kênh (thumbnail trên, thông tin dưới).
 * - `compact`: danh sách "Tiếp theo" ở cột phải trang xem (thumbnail 168 px bên trái).
 * - `row`: kết quả tìm kiếm (thumbnail lớn bên trái, có mô tả ngắn).
 *
 * Trang kênh tắt `showAvatar` (mọi video cùng một kênh) và dùng
 * `thumbnailOverlay` để gắn nhãn chế độ hiển thị lên ảnh bìa.
 */
const VideoCard = ({ video, variant = 'grid', showAvatar = true, thumbnailOverlay = null }) => {
  const { t } = useTranslation();
  /**
   * Ảnh đại diện có thể tồn tại trong cơ sở dữ liệu nhưng không tải được:
   * tệp bị xoá khỏi kho lưu trữ, đường dẫn trỏ tới bucket cũ, hoặc quyền truy
   * cập đã đổi. Theo dõi sự kiện lỗi để quay về khối dự phòng thay vì để trình
   * duyệt vẽ biểu tượng ảnh vỡ kèm nguyên tên tệp.
   */
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const showThumbnail = Boolean(video.thumbnailUrl) && !thumbnailFailed;

  const user = video.user || {};
  const channelName = user.displayName || user.username || t('videoCard.unknownChannel');
  const meta = `${t('videoCard.views', { value: formatViews(video.views) })} · ${timeAgo(t, video.createdAt)}`;

  const avatar = (
    <div className="video-card-avatar">
      <Avatar src={user.avatar} fallbackClassName="mini-avatar">
        {user.username?.charAt(0).toUpperCase() || '?'}
      </Avatar>
    </div>
  );

  return (
    <Link to={`/watch/${video._id}`} className={`video-card video-card-${variant}`}>
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
            <FiPlay />
          </div>
        )}
        {video.duration > 0 && (
          <span className="video-duration">{formatDuration(video.duration)}</span>
        )}
        {video.status === 'PROCESSING' && (
          <span className="video-status-badge">{t('videoCard.processing')}</span>
        )}
        {/* Chỉ chủ kênh nhìn thấy video hỏng, vì danh mục công khai chỉ liệt kê
            video đã READY. Không có nhãn này thì video chuyển mã thất bại trông
            y hệt video bình thường trên kênh, và chủ kênh chỉ biết khi bấm vào
            xem. NFR-03 yêu cầu job hỏng không được biến mất lặng lẽ. */}
        {video.status === 'ERROR' && (
          <span className="video-status-badge video-status-badge-error">
            {t('videoCard.failed')}
          </span>
        )}
        {thumbnailOverlay}
      </div>

      <div className="video-card-info">
        {variant === 'grid' && showAvatar && avatar}

        <div className="video-card-details">
          <h3 className="video-card-title">{video.title}</h3>
          {variant === 'row' ? (
            <>
              <p className="video-card-meta">{meta}</p>
              <div className="video-card-channel-row">
                {avatar}
                <span className="video-card-channel">{channelName}</span>
              </div>
              {video.description && (
                <p className="video-card-description">{video.description}</p>
              )}
            </>
          ) : (
            <>
              <p className="video-card-channel">{channelName}</p>
              <p className="video-card-meta">{meta}</p>
            </>
          )}
        </div>
      </div>
    </Link>
  );
};

export default VideoCard;
