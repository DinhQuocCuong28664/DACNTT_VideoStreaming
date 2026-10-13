/**
 * Khoảng tin cậy Wilson cho một tỉ lệ.
 *
 * Tỉ lệ FP/FN tính trên mẫu nhỏ rất dễ gây hiểu nhầm (2 trên 3 là 67% nhưng gần như không nói gì),
 * nên số liệu luôn đi kèm khoảng tin cậy và mẫu số. Chọn Wilson thay vì khoảng chuẩn (Wald) vì
 * Wald cho khoảng sai ở mẫu nhỏ hoặc tỉ lệ sát 0 và 1, đúng vùng mà tỉ lệ vi phạm lọt thường nằm
 * (Brown, Cai & DasGupta, "Interval Estimation for a Binomial Proportion", Statistical Science 2001).
 *
 * @param {number} successes
 * @param {number} n tổng số mẫu
 * @param {number} [z] 1,96 ứng với tin cậy 95%
 * @returns {{ value: number, low: number, high: number, n: number } | null} null khi chưa có mẫu
 */
const wilsonInterval = (successes, n, z = 1.96) => {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (successes < 0 || successes > n) {
    throw new RangeError('successes must be between 0 and n');
  }

  const p = successes / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;

  const round = (x) => Math.round(x * 10000) / 10000;
  return { value: round(p), low: round(Math.max(0, centre - margin)), high: round(Math.min(1, centre + margin)), n };
};

module.exports = { wilsonInterval };
