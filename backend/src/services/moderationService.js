const mongoose = require('mongoose');
const Video = require('../models/Video');
const Report = require('../models/Report');
const videoService = require('./videoService');
const httpError = require('../utils/httpError');
const {
  REPORT_REASONS,
  MODERATION_DECISIONS,
  MAX_REPORT_DETAILS,
  MAX_MODERATION_NOTE,
} = require('../utils/moderation');

/**
 * Kiểm duyệt nội dung phía backend: người xem gửi báo cáo, quản trị viên rà
 * soát và ra quyết định.
 *
 * Kiểm duyệt tự động nằm ở transcoder (transcoder/src/moderation.js). Ở đây là
 * hai lớp còn lại của mô hình nhiều lớp: báo cáo của cộng đồng bắt những gì
 * bộ lọc máy lọt, và con người có tiếng nói cuối cùng — Gorwa, Binns &
 * Katzenbach (2020) chỉ ra phân loại tự động thiếu minh bạch và sai theo
 * những cách khó lường, nên không được là nơi quyết định duy nhất.
 */

const assertValidId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw httpError(400, 'Invalid video ID');
  }
};

const cleanText = (value, max, field) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > max) {
    throw httpError(400, `${field} cannot exceed ${max} characters`);
  }
  return text;
};

/**
 * Người xem báo cáo một video.
 *
 * Quyền xem được kiểm tra bằng chính getVideoById: không báo cáo được video
 * mà mình không xem được, nên báo cáo không trở thành cách dò ID video riêng
 * tư. Báo cáo trùng (đã có báo cáo mở của cùng người) được coi là thành công
 * nhưng không cộng thêm vào bộ đếm.
 *
 * @returns {Promise<{ alreadyReported: boolean }>}
 */
const createReport = async (videoId, reporter, { reason, details } = {}) => {
  if (!REPORT_REASONS.includes(reason)) {
    throw httpError(400, `Report reason must be one of: ${REPORT_REASONS.join(', ')}`);
  }
  const text = cleanText(details, MAX_REPORT_DETAILS, 'Report details');

  const video = await videoService.getVideoById(videoId, reporter);

  if (video.user._id.toString() === reporter._id.toString()) {
    throw httpError(400, 'You cannot report your own video');
  }

  try {
    await Report.create({ video: video._id, reporter: reporter._id, reason, details: text });
  } catch (err) {
    if (err && err.code === 11000) {
      return { alreadyReported: true };
    }
    throw err;
  }

  await Video.updateOne({ _id: video._id }, { $inc: { 'moderation.openReports': 1 } });
  return { alreadyReported: false };
};

/**
 * Hai tab của trang rà soát.
 *
 * - `review`: video tự động bị đánh dấu chờ rà soát, hoặc có báo cáo chưa xử
 *   lý. Video nhiều báo cáo nhất lên đầu.
 * - `blocked`: video đã bị gỡ, để quản trị viên khôi phục khi có khiếu nại.
 */
const QUEUE_TABS = {
  review: {
    filter: {
      'moderation.status': { $ne: 'blocked' },
      $or: [{ 'moderation.status': 'flagged' }, { 'moderation.openReports': { $gt: 0 } }],
    },
    sort: { 'moderation.openReports': -1, createdAt: -1, _id: -1 },
  },
  blocked: {
    filter: { 'moderation.status': 'blocked' },
    sort: { updatedAt: -1, _id: -1 },
  },
};

const QUEUE_FIELDS = 'title description thumbnailUrl duration status visibility views category user createdAt moderation';

/** Đếm báo cáo mở theo lý do cho các video trên một trang của hàng rà soát. */
const countOpenReportsByReason = async (videoIds) => {
  if (videoIds.length === 0) return new Map();

  const rows = await Report.aggregate([
    { $match: { video: { $in: videoIds }, status: 'open' } },
    { $group: { _id: { video: '$video', reason: '$reason' }, count: { $sum: 1 } } },
  ]);

  const byVideo = new Map();
  for (const row of rows) {
    const key = row._id.video.toString();
    if (!byVideo.has(key)) byVideo.set(key, {});
    byVideo.get(key)[row._id.reason] = row.count;
  }
  return byVideo;
};

const listQueue = async (tab = 'review', page = 1, limit = 20) => {
  const spec = Object.prototype.hasOwnProperty.call(QUEUE_TABS, tab) ? QUEUE_TABS[tab] : QUEUE_TABS.review;
  const skip = (page - 1) * limit;

  const [videos, total] = await Promise.all([
    Video.find(spec.filter)
      .select(QUEUE_FIELDS)
      .populate('user', 'username displayName avatar email')
      .populate('moderation.reviewedBy', 'username displayName')
      .sort(spec.sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Video.countDocuments(spec.filter),
  ]);

  const reasons = await countOpenReportsByReason(videos.map((v) => v._id));

  return {
    videos: videos.map((v) => ({ ...v, reportReasons: reasons.get(v._id.toString()) || {} })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
};

const getStats = async () => {
  const [review, blocked, openReports, autoBlocked] = await Promise.all([
    Video.countDocuments(QUEUE_TABS.review.filter),
    Video.countDocuments(QUEUE_TABS.blocked.filter),
    Report.countDocuments({ status: 'open' }),
    Video.countDocuments({ 'moderation.status': 'blocked', 'moderation.source': 'auto' }),
  ]);

  return { review, blocked, openReports, autoBlocked };
};

/** Toàn bộ báo cáo của một video (tối đa 100 gần nhất), mở lẫn đã xử lý. */
const listReports = async (videoId) => {
  assertValidId(videoId);

  return Report.find({ video: videoId })
    .populate('reporter', 'username displayName avatar')
    .populate('resolvedBy', 'username displayName')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
};

/**
 * Quản trị viên ra quyết định cho một video.
 *
 * - `approve`: giữ lại / khôi phục video; báo cáo mở chuyển sang `dismissed`.
 * - `block`: gỡ video; báo cáo mở chuyển sang `actioned`.
 *
 * Quyết định của con người ghi đè kết quả tự động, và `source` chuyển sang
 * `admin` để biết ai là người quyết định cuối cùng.
 */
const decide = async (videoId, admin, { decision, note } = {}) => {
  assertValidId(videoId);
  if (!MODERATION_DECISIONS.includes(decision)) {
    throw httpError(400, `Decision must be one of: ${MODERATION_DECISIONS.join(', ')}`);
  }
  const text = cleanText(note, MAX_MODERATION_NOTE, 'Moderation note');

  const exists = await Video.exists({ _id: videoId });
  if (!exists) {
    throw httpError(404, 'Video not found');
  }

  const now = new Date();
  await Report.updateMany(
    { video: videoId, status: 'open' },
    {
      $set: {
        status: decision === 'approve' ? 'dismissed' : 'actioned',
        resolvedBy: admin._id,
        resolvedAt: now,
      },
    }
  );

  // Đếm lại thay vì gán cứng 0: báo cáo đến giữa hai lệnh ghi vẫn còn mở và
  // phải được tính, không thì video đó rơi khỏi hàng rà soát.
  const openReports = await Report.countDocuments({ video: videoId, status: 'open' });

  return Video.findByIdAndUpdate(
    videoId,
    {
      $set: {
        'moderation.status': decision === 'approve' ? 'approved' : 'blocked',
        'moderation.source': 'admin',
        'moderation.reviewedBy': admin._id,
        'moderation.reviewedAt': now,
        'moderation.note': text,
        'moderation.openReports': openReports,
      },
    },
    { new: true, runValidators: true }
  )
    .select(QUEUE_FIELDS)
    .populate('user', 'username displayName avatar email')
    .populate('moderation.reviewedBy', 'username displayName')
    .lean();
};

module.exports = {
  createReport,
  listQueue,
  getStats,
  listReports,
  decide,
  QUEUE_TABS,
};
