/**
 * Mật khẩu quá dễ đoán, kiểm ngay trên máy chủ, không cần mạng.
 *
 * Độ dài tối thiểu (8 ký tự) nằm ở model User. Độ dài một mình không ngăn được
 * `12345678` hay `password1`, là những mật khẩu mà kẻ thử mật khẩu hàng loạt
 * (credential stuffing) thử đầu tiên. NIST SP 800-63B yêu cầu bộ xác minh mật
 * khẩu so mật khẩu mới với danh sách mật khẩu hay dùng, đã bị lộ và đặc thù cho
 * ngữ cảnh (tên người dùng, tên dịch vụ). Ở đây có hai lớp:
 *
 * - Lớp cục bộ (tệp này): danh sách mật khẩu phổ biến, các mẫu hiển nhiên (một
 *   ký tự lặp, dãy liên tiếp, chuỗi ngắn lặp lại), từ phổ biến kèm vài chữ số
 *   hoặc ký hiệu ở cuối, và từ đặc thù (tên người dùng, đầu email, tên dịch vụ).
 * - Lớp danh sách bị lộ (services/pwnedPasswordService.js): hỏi dịch vụ Pwned
 *   Passwords, có thể không khả dụng nên chạy sau lớp này và không bắt buộc.
 *
 * Danh sách ngắn có chủ ý: nó chỉ chặn những mật khẩu mà ai cũng thử đầu tiên,
 * phần còn lại để lớp thứ hai lo. Chỉ có tác dụng với mật khẩu từ 8 ký tự trở
 * lên; mật khẩu ngắn hơn đã bị model từ chối bằng thông điệp riêng.
 */

const MIN_LENGTH = 8;

/** Mật khẩu phổ biến dài từ 8 ký tự, viết thường. */
const COMMON_PASSWORDS = new Set([
  // Dãy số và lặp
  '12345678', '123456789', '1234567890', '12345678910', '0123456789', '987654321', '9876543210',
  '11111111', '111111111', '1111111111', '00000000', '000000000', '0000000000', '22222222',
  '66666666', '88888888', '99999999', '12121212', '12341234', '123123123', '123321123',
  '1234abcd', 'abcd1234', 'abc12345', 'abcd12345', 'abc123456', 'a1234567', 'a12345678',
  'a123456789', 'aa123456', 'aa12345678', '12345678a', '123456789a', '1234567890a', '123456abc',
  '123456aa', '12345678q', '1234qwer', 'qwer1234', '123qweasd', 'qweasdzxc',
  // Dãy phím
  '1qaz2wsx', '1q2w3e4r', '1q2w3e4r5t', '1q2w3e4r5t6y', 'zaq12wsx', 'qazwsxedc', 'qazwsx123',
  'qwertyui', 'qwertyuiop', 'qwerty123', 'qwerty1234', 'qwerty12345', 'qwertyuiop123', 'asdfghjk',
  'asdfghjkl', 'asdf1234', 'zxcvbnm1', 'zxcvbnm123', 'q1w2e3r4', 'q1w2e3r4t5',
  // Tiếng Anh phổ biến
  'password', 'password1', 'password12', 'password123', 'password1234', 'passw0rd', 'p@ssw0rd',
  'p@ssword', 'pa55word', 'pa$$word', 'iloveyou', 'iloveyou1', 'iloveyou123', 'letmein1',
  'letmein123', 'welcome1', 'welcome123', 'admin123', 'admin1234', 'administrator', 'adminadmin',
  'root1234', 'changeme', 'changeme123', 'default123', 'test1234', 'testtest', 'test12345',
  'guest123', 'football', 'baseball', 'basketball', 'superman', 'trustno1', 'sunshine',
  'princess', 'starwars', 'whatever', 'computer', 'internet', 'mustang1', 'hello123', 'hello1234',
  'liverpool', 'manchester', 'barcelona', 'freedom1', 'secret123', 'secret12', 'master123',
  // Tiếng Việt phổ biến
  'matkhau', 'matkhau1', 'matkhau12', 'matkhau123', 'matkhau1234', 'matkhau123456', 'matkhaumoi',
  'anhyeuem', 'anhyeuem1', 'emyeuanh', 'yeuem123', 'iuem1234', 'vietnam123', 'vietnam12',
  'vietnamvodich', 'nguyenvan', 'nguyenvana', 'hanoi123', 'saigon123', 'hochiminh',
]);

/** Từ gốc phổ biến: bị chặn cả khi thêm tối đa 4 chữ số hoặc ký hiệu ở cuối hoặc đổi chữ bằng số. */
const COMMON_BASES = new Set([
  'password', 'matkhau', 'qwerty', 'iloveyou', 'welcome', 'letmein', 'admin', 'administrator',
  'football', 'baseball', 'superman', 'dragon', 'sunshine', 'princess', 'monkey', 'master',
  'shadow', 'michael', 'jennifer', 'starwars', 'whatever', 'computer', 'internet', 'mustang',
  'secret', 'changeme', 'default', 'liverpool', 'manchester', 'chelsea', 'barcelona', 'anhyeuem',
  'emyeuanh', 'vietnam', 'saigon', 'hanoi', 'freedom', 'trustno',
]);

/** Từ đặc thù của dịch vụ này: ai cũng thử chúng khi nhắm vào đây. */
const PRODUCT_WORDS = ['zelostech', 'vidshare', 'dacntt'];

const LEET = { '@': 'a', '4': 'a', '0': 'o', '1': 'i', '!': 'i', '3': 'e', $: 's', 5: 's', 7: 't' };

const isSingleCharacter = (s) => /^(.)\1+$/u.test(s);

/** Dãy tăng hoặc giảm đều từng ký tự, như 12345678 hay abcdefgh. */
const isRun = (s) => {
  const codes = Array.from(s, (c) => c.codePointAt(0));
  const step = codes[1] - codes[0];
  if (Math.abs(step) !== 1) return false;
  return codes.every((c, i) => i === 0 || c - codes[i - 1] === step);
};

/** Một khối ngắn (tối đa 4 ký tự) lặp lại, như 12341234 hay abababab. */
const isShortPeriod = (s) => {
  for (let period = 1; period <= 4; period += 1) {
    if (s.length < period * 2) break;
    const unit = s.slice(0, period);
    if (unit.repeat(Math.ceil(s.length / period)).slice(0, s.length) === s) return true;
  }
  return false;
};

const baseWord = (s) => {
  const stripped = s.replace(/[0-9!@#$%^&*._-]{1,4}$/u, '');
  return Array.from(stripped, (c) => LEET[c] || c).join('');
};

const localPart = (email) => String(email || '').split('@')[0];

/**
 * Tìm điểm yếu hiển nhiên của một mật khẩu.
 *
 * @param {string} password
 * @param {{ username?: string, email?: string }} [identity] thông tin của chính người đặt
 * @returns {'common' | 'personal' | null}
 */
const findWeakness = (password, identity = {}) => {
  const value = String(password || '');
  if (value.length < MIN_LENGTH) return null;
  const p = value.toLowerCase();

  if (COMMON_PASSWORDS.has(p)) return 'common';
  if (isSingleCharacter(p) || isRun(p) || isShortPeriod(p)) return 'common';
  if (COMMON_BASES.has(baseWord(p))) return 'common';

  // Đặc thù ngữ cảnh: tên người dùng, đầu email (từ 4 ký tự để khỏi chặn nhầm tên quá ngắn).
  const personal = [identity.username, localPart(identity.email)]
    .map((x) => String(x || '').toLowerCase())
    .filter((x) => x.length >= 4);
  if (personal.some((x) => p.includes(x))) return 'personal';
  if (PRODUCT_WORDS.some((w) => p.includes(w))) return 'personal';

  return null;
};

module.exports = { findWeakness, MIN_LENGTH, COMMON_PASSWORDS };
