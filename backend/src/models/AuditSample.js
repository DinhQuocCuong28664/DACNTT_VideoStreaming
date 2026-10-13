const mongoose = require('mongoose');
const { MAX_MODERATION_NOTE } = require('../utils/moderation');

/**
 * Một video thuộc lượt kiểm tra mẫu ngẫu nhiên.
 *
 * Đây là cách DUY NHẤT để ước lượng tỉ lệ false negative: vi phạm lọt qua lớp kiểm duyệt tự động
 * nằm lẫn trong hàng nghìn video đã duyệt, và báo cáo của người xem chỉ thấy phần nổi tiếng nhất
 * (lệch). Người vận hành xem một mẫu NGẪU NHIÊN các video máy đã duyệt và ghi `pass` hoặc `fail`;
 * tỉ lệ `fail` trên mẫu, kèm khoảng tin cậy, là ước lượng của tỉ lệ lọt.
 *
 * Một video chỉ vào mẫu một lần (chỉ mục duy nhất), để nhãn của nó không bị đếm hai lần.
 */
const auditSampleSchema = new mongoose.Schema(
  {
    video: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', required: true, unique: true },
    drawnBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    batch: { type: String, required: true, index: true },
    status: { type: String, enum: ['pending', 'pass', 'fail'], default: 'pending' },
    labeledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    labeledAt: Date,
    note: { type: String, trim: true, default: '', maxlength: MAX_MODERATION_NOTE },
  },
  { timestamps: true }
);

auditSampleSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('AuditSample', auditSampleSchema);
