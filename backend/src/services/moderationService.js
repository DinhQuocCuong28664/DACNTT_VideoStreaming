const mongoose = require('mongoose');
const Video = require('../models/Video');
const Report = require('../models/Report');
const ModerationEvent = require('../models/ModerationEvent');
const videoService = require('./videoService');
const httpError = require('../utils/httpError');
const { can } = require('../utils/roles');
const {
  REPORT_REASONS,
  MODERATION_DECISIONS,
  DECISION_REASONS,
  OUTCOMES,
  classifyOutcome,
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

/**
 * Trường của chủ video trả về cho người vận hành. Email chỉ cho người có quyền `pii:email`
 * (admin): operator rà soát được mà không cần biết địa chỉ liên hệ của chủ video, nên một tài
 * khoản operator bị lộ không kéo theo danh sách email.
 */
const ownerFields = (includeEmail) => (includeEmail ? 'username displayName avatar email' : 'username displayName avatar');

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

const listQueue = async (tab = 'review', page = 1, limit = 20, { includeEmail = false } = {}) => {
  const spec = Object.prototype.hasOwnProperty.call(QUEUE_TABS, tab) ? QUEUE_TABS[tab] : QUEUE_TABS.review;
  const skip = (page - 1) * limit;

  const [videos, total] = await Promise.all([
    Video.find(spec.filter)
      .select(QUEUE_FIELDS)
      .populate('user', ownerFields(includeEmail))
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
 * Người vận hành ra quyết định cho một video.
 *
 * - `approve`: giữ lại / khôi phục video; báo cáo mở chuyển sang `dismissed`.
 * - `block`: gỡ video; báo cáo mở chuyển sang `actioned`.
 *
 * Quyết định của con người ghi đè kết quả tự động, và `source` chuyển sang `admin` để biết ai là
 * người quyết định cuối cùng. Vì ghi đè làm mất kết luận của máy, lần đầu tiên một video được
 * người xét thì kết luận của máy được chụp vào `moderation.autoStatus` TRƯỚC khi ghi đè; không
 * có nó thì không bao giờ đếm được false positive hay false negative.
 *
 * Mã lý do là bắt buộc (DECISION_REASONS) và mỗi quyết định ghi một bản ghi vào nhật ký
 * ModerationEvent, kèm phân loại so với kết luận của máy.
 *
 * Quyết định do admin đưa ra chỉ admin đổi được: operator không lật được người có thẩm quyền cao hơn.
 */
const decide = async (videoId, actor, { decision, note, reasonCode } = {}) => {
  assertValidId(videoId);
  if (!MODERATION_DECISIONS.includes(decision)) {
    throw httpError(400, `Decision must be one of: ${MODERATION_DECISIONS.join(', ')}`);
  }
  if (!DECISION_REASONS[decision].includes(reasonCode)) {
    throw httpError(400, `Reason code must be one of: ${DECISION_REASONS[decision].join(', ')}`);
  }
  const text = cleanText(note, MAX_MODERATION_NOTE, 'Moderation note');

  const video = await Video.findById(videoId).select('moderation').lean();
  if (!video) {
    throw httpError(404, 'Video not found');
  }

  const current = video.moderation || {};
  if (current.source === 'admin' && current.reviewedByRole === 'admin' && actor.role !== 'admin') {
    throw httpError(403, 'Only an admin can change a decision made by an admin');
  }

  // Máy đã nói gì? Đã chụp rồi thì giữ nguyên. Chưa chụp: nếu trạng thái hiện tại vẫn là của máy
  // thì chính nó; nếu là của người (quyết định từ trước khi có tính năng này) thì không biết.
  const autoStatus = current.autoStatus || (current.source === 'admin' ? null : current.status || null);

  const now = new Date();
  await Report.updateMany(
    { video: videoId, status: 'open' },
    {
      $set: {
        status: decision === 'approve' ? 'dismissed' : 'actioned',
        resolvedBy: actor._id,
        resolvedAt: now,
      },
    }
  );

  // Đếm lại thay vì gán cứng 0: báo cáo đến giữa hai lệnh ghi vẫn còn mở và
  // phải được tính, không thì video đó rơi khỏi hàng rà soát.
  const openReports = await Report.countDocuments({ video: videoId, status: 'open' });

  const toStatus = decision === 'approve' ? 'approved' : 'blocked';
  const set = {
    'moderation.status': toStatus,
    'moderation.source': 'admin',
    'moderation.reviewedBy': actor._id,
    'moderation.reviewedByRole': actor.role,
    'moderation.reviewedAt': now,
    'moderation.note': text,
    'moderation.reasonCode': reasonCode,
    'moderation.openReports': openReports,
  };
  if (!current.autoStatus && autoStatus) {
    set['moderation.autoStatus'] = autoStatus;
  }

  const updated = await Video.findByIdAndUpdate(
    videoId,
    { $set: set },
    { returnDocument: 'after', runValidators: true }
  )
    .select(QUEUE_FIELDS)
    .populate('user', ownerFields(can(actor, 'pii:email')))
    .populate('moderation.reviewedBy', 'username displayName')
    .lean();

  // Nhật ký ghi SAU khi quyết định đã áp dụng. Nếu ghi nhật ký lỗi thì quyết định vẫn đứng (rút lại
  // một quyết định gỡ video vì nhật ký lỗi còn tệ hơn), lỗi được log để người vận hành biết có một
  // quyết định thiếu bản ghi; số liệu FP/FN suy từ chính Video nên không bị lệch theo.
  try {
    await ModerationEvent.create({
      video: videoId,
      actor: actor._id,
      actorRole: actor.role,
      decision,
      action: decision === 'block' ? 'block' : current.status === 'blocked' ? 'restore' : 'approve',
      fromStatus: current.status || 'none',
      toStatus,
      autoStatus: autoStatus || undefined,
      outcome: classifyOutcome(autoStatus, decision),
      reasonCode,
      note: text,
      labels: (current.labels || []).slice(0, 5).map(({ name, confidence, action }) => ({ name, confidence, action })),
    });
  } catch (err) {
    console.error(`ModerationEvent not recorded for video ${videoId}:`, err.message);
  }

  return updated;
};

/**
 * Nhật ký quyết định, mới nhất trước. Dành cho auditor và admin.
 * @param {{ outcome?: string }} filters
 */
const listEvents = async (page = 1, limit = 20, { outcome } = {}) => {
  const filter = {};
  if (outcome) {
    if (!OUTCOMES.includes(outcome)) {
      throw httpError(400, `Outcome must be one of: ${OUTCOMES.join(', ')}`);
    }
    filter.outcome = outcome;
  }

  const [events, total] = await Promise.all([
    ModerationEvent.find(filter)
      .populate('actor', 'username displayName')
      .populate('video', 'title thumbnailUrl')
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    ModerationEvent.countDocuments(filter),
  ]);

  return { events, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
};

module.exports = {
  createReport,
  listQueue,
  getStats,
  listReports,
  decide,
  listEvents,
  QUEUE_TABS,
};
