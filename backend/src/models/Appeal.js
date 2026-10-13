const mongoose = require('mongoose');
const { MAX_APPEAL_MESSAGE, MAX_APPEAL_RESOLUTION } = require('../utils/moderation');

/**
 * Khiếu nại của chủ video với một video bị gỡ.
 *
 * Santa Clara Principles yêu cầu người bị gỡ nội dung được thông báo và có cơ hội khiếu nại để
 * một người thật xét lại. Khiếu nại cũng là nguồn false positive đáng tin nhất của hệ thống: chỉ
 * chủ video mới có động lực báo "máy gỡ nhầm", và người vận hành xét từng cái.
 *
 * Giới hạn: một khiếu nại cho mỗi QUYẾT ĐỊNH (chỉ mục duy nhất theo `decisionAt`). Bị bác thì không
 * gửi lại được cùng quyết định, tránh biến hàng khiếu nại thành nơi spam; có quyết định mới (ví dụ
 * video được khôi phục rồi bị gỡ lại) thì khiếu nại lại được.
 */
const appealSchema = new mongoose.Schema(
  {
    video: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', required: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: {
      type: String,
      trim: true,
      required: [true, 'Appeal message is required'],
      maxlength: [MAX_APPEAL_MESSAGE, `Appeal message cannot exceed ${MAX_APPEAL_MESSAGE} characters`],
    },
    // Thời điểm của quyết định bị khiếu nại (người xét gần nhất, hoặc lần kiểm tra tự động).
    decisionAt: { type: Date, required: true },
    // Máy hay người đã gỡ, tại lúc khiếu nại: người vận hành thấy ngay mình đang xét lại ai.
    decisionSource: { type: String, enum: ['auto', 'admin'], required: true },
    status: { type: String, enum: ['open', 'upheld', 'rejected'], default: 'open' },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: Date,
    resolutionNote: { type: String, trim: true, default: '', maxlength: MAX_APPEAL_RESOLUTION },
  },
  { timestamps: true }
);

appealSchema.index({ video: 1, decisionAt: 1 }, { unique: true });
appealSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('Appeal', appealSchema);
