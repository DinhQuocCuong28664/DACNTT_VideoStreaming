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

/**
 * Mã lý do bắt buộc cho mỗi quyết định của người vận hành.
 *
 * Danh sách ngắn và đóng, vì mã này là dữ liệu để đo: ghi chú tự do không đếm được, còn
 * "bao nhiêu lần gỡ nhầm là do hoạt hình" thì đếm được và chỉ ra nên chỉnh ngưỡng nào của
 * kiểm duyệt tự động. Cùng lý do Crawford & Gillespie (2016) ở REPORT_REASONS: càng nhiều mục
 * chồng lấn, người chọn càng tuỳ tiện.
 */
const DECISION_REASONS = {
  approve: [
    'model_error', // máy nhận nhầm: hình ảnh không vi phạm
    'fiction_or_game', // bạo lực trong game, phim hoạt hình
    'news_or_education', // bối cảnh tin tức, giáo dục, y khoa
    'acceptable_context', // có hình ảnh nhạy cảm nhưng bối cảnh chấp nhận được
    'appeal_upheld', // chủ video khiếu nại và đúng
    'report_unfounded', // báo cáo của người xem không có cơ sở
    'other',
  ],
  block: [
    'missed_by_model', // máy duyệt qua nhưng có vi phạm
    'report_upheld', // báo cáo của người xem đúng
    'audit_failed', // phát hiện qua kiểm tra mẫu
    'policy_violation', // vi phạm nhưng không thuộc nhãn nào của máy
    'other',
  ],
};

/**
 * Kết quả của một quyết định so với kết luận của máy (`autoStatus`).
 *
 * - `false_positive`: máy gỡ, người khôi phục.
 * - `flag_noise`: máy chỉ đánh dấu chờ rà soát, người duyệt (cờ vô ích, chưa tới mức gỡ nhầm).
 * - `false_negative`: máy duyệt, người gỡ.
 * - `true_positive`: máy gỡ hoặc đánh dấu, người giữ nguyên quyết định gỡ.
 * - `true_negative`: máy duyệt, người cũng duyệt (báo cáo bị bác, kiểm tra mẫu đạt).
 * - `unclassified`: không biết máy đã kết luận gì (video trước khi có kiểm duyệt, hoặc quyết
 *   định của admin từ trước khi hệ thống ghi lại kết luận của máy): không tính vào tỉ lệ nào.
 */
const OUTCOMES = ['false_positive', 'flag_noise', 'false_negative', 'true_positive', 'true_negative', 'unclassified'];

const classifyOutcome = (autoStatus, decision) => {
  if (!autoStatus) return 'unclassified';
  if (decision === 'approve') {
    if (autoStatus === 'blocked') return 'false_positive';
    if (autoStatus === 'flagged') return 'flag_noise';
    return 'true_negative';
  }
  if (autoStatus === 'approved') return 'false_negative';
  return 'true_positive';
};

const MAX_REPORT_DETAILS = 500;
const MAX_MODERATION_NOTE = 500;
const MAX_APPEAL_MESSAGE = 500;
const MAX_APPEAL_RESOLUTION = 500;

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
  DECISION_REASONS,
  OUTCOMES,
  classifyOutcome,
  MAX_REPORT_DETAILS,
  MAX_MODERATION_NOTE,
  MAX_APPEAL_MESSAGE,
  MAX_APPEAL_RESOLUTION,
  publicListingFilter,
};
