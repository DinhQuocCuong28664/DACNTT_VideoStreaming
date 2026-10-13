const mongoose = require('mongoose');
const crypto = require('crypto');
const Video = require('../models/Video');
const AuditSample = require('../models/AuditSample');
const moderationService = require('./moderationService');
const httpError = require('../utils/httpError');
const { can } = require('../utils/roles');
const { MAX_MODERATION_NOTE } = require('../utils/moderation');

/**
 * Kiểm tra mẫu ngẫu nhiên các video mà kiểm duyệt tự động đã duyệt, để ước lượng tỉ lệ false negative.
 *
 * Tập để lấy mẫu là video công khai, đã sẵn sàng, do MÁY duyệt (người chưa xét), chưa có báo cáo mở
 * và chưa từng vào mẫu. Loại video có báo cáo mở vì chúng đã đang ở hàng rà soát; đưa vào mẫu là đếm
 * một vi phạm đã biết thành "ước lượng" và làm tỉ lệ cao giả.
 */

const MAX_SAMPLE_SIZE = 100;

const SAMPLE_VIDEO_FIELDS = 'title description thumbnailUrl duration user createdAt views';

/**
 * Lấy một lượt mẫu mới.
 * @returns {{ batch: string, requested: number, drawn: number }}
 */
const createSample = async (admin, { size } = {}) => {
  const n = Number(size);
  if (!Number.isInteger(n) || n < 1 || n > MAX_SAMPLE_SIZE) {
    throw httpError(400, `Sample size must be an integer between 1 and ${MAX_SAMPLE_SIZE}`);
  }

  const already = await AuditSample.distinct('video');

  const candidates = await Video.aggregate([
    {
      $match: {
        status: 'READY',
        visibility: 'public',
        'moderation.status': 'approved',
        'moderation.source': { $ne: 'admin' },
        'moderation.openReports': { $not: { $gt: 0 } },
        _id: { $nin: already },
      },
    },
    { $sample: { size: n } },
    { $project: { _id: 1 } },
  ]);

  if (candidates.length === 0) {
    return { batch: null, requested: n, drawn: 0 };
  }

  const batch = `${new Date().toISOString().slice(0, 10)}-${crypto.randomBytes(3).toString('hex')}`;
  await AuditSample.insertMany(
    candidates.map((c) => ({ video: c._id, drawnBy: admin._id, batch })),
    { ordered: false }
  );

  return { batch, requested: n, drawn: candidates.length };
};

/** Hàng chờ gán nhãn, cũ nhất trước. Email chủ video chỉ cho người có quyền pii:email. */
const listSamples = async (actor, { status = 'pending', page = 1, limit = 20 } = {}) => {
  if (!['pending', 'pass', 'fail'].includes(status)) {
    throw httpError(400, 'Status must be one of: pending, pass, fail');
  }
  const ownerFields = can(actor, 'pii:email') ? 'username displayName avatar email' : 'username displayName avatar';
  const filter = { status };

  const [samples, total] = await Promise.all([
    AuditSample.find(filter)
      .populate({ path: 'video', select: SAMPLE_VIDEO_FIELDS, populate: { path: 'user', select: ownerFields } })
      .sort(status === 'pending' ? { createdAt: 1, _id: 1 } : { labeledAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditSample.countDocuments(filter),
  ]);

  return { samples, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
};

/**
 * Gán nhãn một video của mẫu.
 *
 * - `pass`: video đúng là không vi phạm (kết luận của máy đúng).
 * - `fail`: có vi phạm máy bỏ lọt. Video bị gỡ qua `decide` với lý do `audit_failed`, nên một false
 *   negative do kiểm tra mẫu cũng vào nhật ký như mọi quyết định khác.
 *
 * Nhận mẫu bằng cập nhật có điều kiện (`status: 'pending'`) trước khi quyết định; quyết định lỗi thì
 * trả mẫu về `pending`.
 */
const labelSample = async (sampleId, actor, { result, note } = {}) => {
  if (!mongoose.Types.ObjectId.isValid(sampleId)) {
    throw httpError(400, 'Invalid sample ID');
  }
  if (!['pass', 'fail'].includes(result)) {
    throw httpError(400, 'Result must be one of: pass, fail');
  }
  const text = typeof note === 'string' ? note.trim() : '';
  if (text.length > MAX_MODERATION_NOTE) {
    throw httpError(400, `Note cannot exceed ${MAX_MODERATION_NOTE} characters`);
  }

  const claimed = await AuditSample.findOneAndUpdate(
    { _id: sampleId, status: 'pending' },
    { $set: { status: result, labeledBy: actor._id, labeledAt: new Date(), note: text } },
    { returnDocument: 'after' }
  ).lean();

  if (!claimed) {
    throw httpError(404, 'Sample not found or already labelled');
  }

  if (result === 'fail') {
    try {
      await moderationService.decide(claimed.video, actor, { decision: 'block', reasonCode: 'audit_failed', note: text });
    } catch (err) {
      await AuditSample.updateOne(
        { _id: sampleId },
        { $set: { status: 'pending' }, $unset: { labeledBy: '', labeledAt: '' } }
      );
      throw err;
    }
  }

  return claimed;
};

module.exports = { createSample, listSamples, labelSample, MAX_SAMPLE_SIZE };
