const crypto = require('crypto');

/**
 * Kiểm mật khẩu với danh sách mật khẩu đã bị lộ (Pwned Passwords, Have I Been Pwned).
 *
 * Dùng giao thức k-anonymity: chỉ 5 ký tự hex đầu của SHA-1 rời khỏi máy chủ,
 * dịch vụ trả về mọi hậu tố cùng tiền tố, và việc so khớp diễn ra ở đây. Mật
 * khẩu và mã băm đầy đủ không bao giờ được gửi đi. `Add-Padding` thêm các dòng
 * giả (số lần 0) để độ dài phản hồi không tiết lộ số kết quả thật.
 *
 * Dịch vụ ngoài có thể chậm hoặc hỏng, mà đăng ký và đặt lại mật khẩu không
 * được hỏng theo, nên mọi lỗi (mạng, quá hạn, mã trạng thái khác 200) trả về
 * `null`, nghĩa là "không biết", và bên gọi cho qua. Khoảng thời gian chờ ngắn
 * (2 giây) để người dùng không phải chờ lâu khi dịch vụ chậm.
 */

const DEFAULT_ENDPOINT = 'https://api.pwnedpasswords.com/range/';
const DEFAULT_TIMEOUT_MS = 2000;

/** Chỉ chặn khi mật khẩu đã xuất hiện trong ít nhất chừng này vụ lộ. */
const MIN_BREACH_COUNT = 1;

/** Tắt bằng PASSWORD_BREACH_CHECK=false; test không bao giờ gọi mạng thật. */
const isEnabled = (env = process.env) =>
  env.PASSWORD_BREACH_CHECK !== 'false' && env.NODE_ENV !== 'test';

const sha1Hex = (password) => crypto.createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();

/**
 * Số vụ lộ chứa mật khẩu này, hoặc `null` nếu không kiểm được.
 *
 * @param {string} password
 * @param {{ fetchImpl?: Function, timeoutMs?: number, endpoint?: string }} [options]
 * @returns {Promise<number | null>}
 */
const countBreaches = async (password, options = {}) => {
  const {
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    endpoint = process.env.PWNED_PASSWORDS_URL || DEFAULT_ENDPOINT,
  } = options;

  const hash = sha1Hex(String(password));
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${endpoint}${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'dacntt-videostreaming' },
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const body = await response.text();
    for (const line of body.split('\n')) {
      const [candidate, count] = line.trim().split(':');
      if (candidate === suffix) return Number(count) || 0;
    }
    return 0;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

module.exports = { countBreaches, isEnabled, MIN_BREACH_COUNT, DEFAULT_TIMEOUT_MS };
