/**
 * Cặp vCPU / bộ nhớ hợp lệ của một task Fargate (bảng của AWS).
 *
 * Batch chỉ nhận các cặp này; một cặp sai làm SubmitJob thất bại với ClientException, mà ở pipeline
 * chia đoạn lỗi đó xảy ra SAU khi video đã bị đánh PROCESSING nên sẽ biến thành ERROR cho mọi video dài.
 * Vì thế cấu hình được kiểm ở đây, ngay khi nạp, và cặp sai bị bỏ qua thay vì làm hỏng video.
 */

/** vCPU → [bộ nhớ nhỏ nhất, lớn nhất] (MiB). Bước nhảy bỏ qua: Batch tự từ chối nếu lệch. */
const FARGATE_SIZES = {
  0.25: [512, 2048],
  0.5: [1024, 4096],
  1: [2048, 8192],
  2: [4096, 16384],
  4: [8192, 30720],
  8: [16384, 61440],
  16: [32768, 122880],
};

const isValidFargateSize = (vcpu, memoryMiB) => {
  const range = FARGATE_SIZES[vcpu];
  return Boolean(range) && Number.isInteger(memoryMiB) && memoryMiB >= range[0] && memoryMiB <= range[1];
};

module.exports = { FARGATE_SIZES, isValidFargateSize };
