const mongoose = require('mongoose');
const { MODERATION_STATUSES, MODERATION_DECISIONS, OUTCOMES, MAX_MODERATION_NOTE } = require('../utils/moderation');

/**
 * Nhật ký quyết định kiểm duyệt: chỉ thêm, không sửa, không xoá.
 *
 * Mỗi lần người vận hành duyệt hoặc gỡ một video ghi một bản ghi. Nhật ký trả lời ba câu
 * mà trường `moderation` trên Video không trả lời được: ai quyết định gì và khi nào theo thứ
 * tự, máy đã nói gì lúc đó, và quyết định đó tính là false positive hay false negative.
 *
 * Không có route nào sửa hay xoá bản ghi: tính toàn vẹn của nhật ký là thứ auditor dựa vào.
 */
const moderationEventSchema = new mongoose.Schema(
  {
    video: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', required: true, index: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actorRole: { type: String, required: true },
    decision: { type: String, enum: MODERATION_DECISIONS, required: true },
    // `restore` khi duyệt một video đang bị gỡ, để nhật ký đọc được mà không phải suy ra.
    action: { type: String, enum: ['approve', 'block', 'restore'], required: true },
    fromStatus: { type: String, enum: [...MODERATION_STATUSES, 'none'], default: 'none' },
    toStatus: { type: String, enum: MODERATION_STATUSES, required: true },
    autoStatus: { type: String, enum: MODERATION_STATUSES },
    outcome: { type: String, enum: OUTCOMES, required: true },
    reasonCode: { type: String, required: true },
    note: { type: String, trim: true, default: '', maxlength: MAX_MODERATION_NOTE },
    // Nhãn của máy tại lúc quyết định, để thống kê theo nhãn không cần dựng lại từ video.
    labels: [{ _id: false, name: String, confidence: Number, action: String }],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

moderationEventSchema.index({ createdAt: -1 });
moderationEventSchema.index({ outcome: 1, createdAt: -1 });
moderationEventSchema.index({ actor: 1, createdAt: -1 });

module.exports = mongoose.model('ModerationEvent', moderationEventSchema);
