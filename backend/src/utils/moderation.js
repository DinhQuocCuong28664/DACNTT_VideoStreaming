/**
 * Hằng số dùng chung cho kiểm duyệt nội dung.
 *
 * Tách khỏi các model để test có thể mock model (jest.mock tự động thay mọi
 * mảng xuất ra từ module bị mock bằng mảng rỗng) mà vẫn dùng đúng giá trị thật.
 */

const MODERATION_STATUSES = ['approved', 'flagged', 'blocked'];

/** Trạng thái kiểm duyệt khiến video biến mất khỏi mọi danh sách công khai. */
const HIDDEN_MODERATION_STATUSES = ['flagged', 'blocked'];

/**
 * Lý do báo cáo, theo nhóm của trang báo cáo YouTube. Giữ danh sách ngắn:
 * Crawford & Gillespie (2016) chỉ ra rằng cơ chế báo cáo là một "từ vựng
 * khiếu nại" do nền tảng định sẵn — càng nhiều mục chồng lấn nhau, người báo
 * cáo càng chọn tuỳ tiện và dữ liệu càng khó dùng để phân loại.
 */
const REPORT_REASONS = [
  'sexual',
  'violent',
  'hateful',
  'harassment',
  'dangerous',
  'child_abuse',
  'spam',
  'other',
];

const MODERATION_DECISIONS = ['approve', 'block'];

const MAX_REPORT_DETAILS = 500;
const MAX_MODERATION_NOTE = 500;

/**
 * Điều kiện để một video xuất hiện trong danh sách công khai (trang chủ, trang
 * kênh của người khác, video liên quan). `$nin` cũng khớp khi trường không
 * tồn tại, nên video tải lên trước khi có tính năng kiểm duyệt vẫn hiện.
 */
const publicListingFilter = () => ({
  visibility: 'public',
  status: 'READY',
  'moderation.status': { $nin: HIDDEN_MODERATION_STATUSES },
});

module.exports = {
  MODERATION_STATUSES,
  HIDDEN_MODERATION_STATUSES,
  REPORT_REASONS,
  MODERATION_DECISIONS,
  MAX_REPORT_DETAILS,
  MAX_MODERATION_NOTE,
  publicListingFilter,
};
