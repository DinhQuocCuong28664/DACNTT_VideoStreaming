const mongoose = require('mongoose');
const Video = require('../models/Video');
const Appeal = require('../models/Appeal');
const moderationService = require('./moderationService');
const httpError = require('../utils/httpError');
const { can } = require('../utils/roles');
const { MAX_APPEAL_MESSAGE, MAX_APPEAL_RESOLUTION, DECISION_REASONS } = require('../utils/moderation');

/**
 * Khiếu nại của chủ video với video bị gỡ, và việc người vận hành xét lại.
 *
 * Kết quả của khiếu nại đi qua chính `moderationService.decide`, không có đường ghi riêng: nhờ đó
 * khôi phục theo khiếu nại cũng chụp kết luận của máy, ghi nhật ký và được đếm là false positive
 * như mọi quyết định khác.
 */

const assertValidId = (id, what = 'ID') => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw httpError(400, `Invalid ${what}`);
  }
};

const cleanText = (value, max, field) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > max) {
    throw httpError(400, `${field} cannot exceed ${max} characters`);
  }
  return text;
};

/** Thời điểm của quyết định hiện tại trên video: người xét gần nhất, không thì lần kiểm tra tự động. */
const decisionTime = (video) => {
  const m = video.moderation || {};
  return m.reviewedAt || m.checkedAt || video.createdAt;
};

/**
 * Chủ video khiếu nại một video bị gỡ.
 *
 * Chỉ chủ video, chỉ khi video đang `blocked` (video chỉ `flagged` đang chờ người xét rồi), và
 * mỗi quyết định một lần. Trả 404 thay vì 403 khi không phải chủ để không lộ video tồn tại.
 */
const createAppeal = async (videoId, owner, { message } = {}) => {
  assertValidId(videoId, 'video ID');
  const text = cleanText(message, MAX_APPEAL_MESSAGE, 'Appeal message');
  if (!text) {
    throw httpError(400, 'Appeal message is required');
  }

  const video = await Video.findById(videoId).select('user moderation createdAt').lean();
  if (!video || String(video.user) !== String(owner._id)) {
    throw httpError(404, 'Video not found');
  }
  if (!video.moderation || video.moderation.status !== 'blocked') {
    throw httpError(400, 'Only a removed video can be appealed');
  }

  try {
    return await Appeal.create({
      video: videoId,
      owner: owner._id,
      message: text,
      decisionAt: decisionTime(video),
      decisionSource: video.moderation.source === 'admin' ? 'admin' : 'auto',
    });
  } catch (err) {
    if (err && err.code === 11000) {
      throw httpError(409, 'This decision has already been appealed', 'APPEAL_ALREADY_FILED');
    }
    throw err;
  }
};

/** Khiếu nại gần nhất của chính chủ video này, để giao diện hiện trạng thái. */
const getOwnAppeal = async (videoId, owner) => {
  assertValidId(videoId, 'video ID');
  const video = await Video.findById(videoId).select('user').lean();
  if (!video || String(video.user) !== String(owner._id)) {
    throw httpError(404, 'Video not found');
  }
  return Appeal.findOne({ video: videoId, owner: owner._id })
    .sort({ createdAt: -1 })
    .select('status message createdAt resolvedAt resolutionNote')
    .lean();
};

const APPEAL_FIELDS = 'video owner message decisionAt decisionSource status resolvedBy resolvedAt resolutionNote createdAt';

/** Hàng khiếu nại cho người vận hành, cũ nhất trước (khiếu nại chờ lâu nhất được xét trước). */
const listAppeals = async (actor, { status = 'open', page = 1, limit = 20 } = {}) => {
  if (!['open', 'upheld', 'rejected'].includes(status)) {
    throw httpError(400, 'Status must be one of: open, upheld, rejected');
  }
  const filter = { status };
  const ownerFields = can(actor, 'pii:email') ? 'username displayName avatar email' : 'username displayName avatar';

  const [appeals, total] = await Promise.all([
    Appeal.find(filter)
      .select(APPEAL_FIELDS)
      .populate('video', 'title thumbnailUrl duration moderation.status moderation.source moderation.note moderation.labels')
      .populate('owner', ownerFields)
      .sort(status === 'open' ? { createdAt: 1, _id: 1 } : { resolvedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Appeal.countDocuments(filter),
  ]);

  return { appeals, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
};

/**
 * Người vận hành xét một khiếu nại.
 *
 * - `uphold`: khiếu nại đúng, khôi phục video (decide approve, lý do `appeal_upheld`).
 * - `reject`: khiếu nại bị bác, giữ nguyên việc gỡ. Nếu video đang bị gỡ bởi MÁY thì việc bác được ghi
 *   là một quyết định của người (decide block): đó là lúc kết luận của máy được người xác nhận, tức
 *   một true positive. Quyết định gỡ vốn của người thì không ghi lại, vì không có gì thay đổi.
 *
 * Nhận khiếu nại bằng cập nhật có điều kiện (`status: 'open'`) TRƯỚC khi quyết định, để hai người
 * cùng bấm không xử lý hai lần; quyết định lỗi thì trả khiếu nại về `open`.
 */
const resolveAppeal = async (appealId, actor, { decision, note, reasonCode } = {}) => {
  assertValidId(appealId, 'appeal ID');
  if (!['uphold', 'reject'].includes(decision)) {
    throw httpError(400, 'Decision must be one of: uphold, reject');
  }
  const text = cleanText(note, MAX_APPEAL_RESOLUTION, 'Resolution note');

  const claimed = await Appeal.findOneAndUpdate(
    { _id: appealId, status: 'open' },
    {
      $set: {
        status: decision === 'uphold' ? 'upheld' : 'rejected',
        resolvedBy: actor._id,
        resolvedAt: new Date(),
        resolutionNote: text,
      },
    },
    { returnDocument: 'after' }
  ).lean();

  if (!claimed) {
    throw httpError(404, 'Appeal not found or already resolved');
  }

  try {
    if (decision === 'uphold') {
      await moderationService.decide(claimed.video, actor, { decision: 'approve', reasonCode: 'appeal_upheld', note: text });
    } else if (claimed.decisionSource === 'auto') {
      const reason = DECISION_REASONS.block.includes(reasonCode) ? reasonCode : 'policy_violation';
      await moderationService.decide(claimed.video, actor, { decision: 'block', reasonCode: reason, note: text });
    }
  } catch (err) {
    await Appeal.updateOne({ _id: appealId }, { $set: { status: 'open' }, $unset: { resolvedBy: '', resolvedAt: '' } });
    throw err;
  }

  return claimed;
};

module.exports = { createAppeal, getOwnAppeal, listAppeals, resolveAppeal };
