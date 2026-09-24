/**
 * Định dạng số liệu hiển thị dùng chung cho thẻ video, trang xem và trang kênh.
 */

/** 1234 → "1.2K", 2500000 → "2.5M" */
export const formatViews = (views = 0) => {
  if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`;
  if (views >= 1000) return `${(views / 1000).toFixed(1)}K`;
  return views;
};

/** 75 → "1:15", 3764 → "1:02:44" */
export const formatDuration = (total) => {
  const s = Math.floor(total % 60);
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

/** Thời gian tương đối theo ngôn ngữ đang chọn: "3 ngày trước", "2 h ago". */
export const timeAgo = (t, dateStr) => {
  const seconds = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (seconds < 60) return t('videoCard.justNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('videoCard.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('videoCard.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t('videoCard.daysAgo', { count: days });
  const months = Math.floor(days / 30);
  return t('videoCard.monthsAgo', { count: months });
};

/** Ngày đầy đủ theo ngôn ngữ giao diện: "24 thg 9, 2026" / "Sep 24, 2026". */
export const formatDate = (lang, dateStr) =>
  new Date(dateStr).toLocaleDateString(lang === 'en' ? 'en-US' : 'vi-VN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
