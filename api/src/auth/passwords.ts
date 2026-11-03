/**
 * Password rules (NIST SP 800-63B, OWASP ASVS):
 *  - 8 to 72 bytes counted in UTF-8, because bcrypt silently drops everything after byte 72 and
 *    Vietnamese letters take two or three bytes;
 *  - a local blocklist of common passwords, obvious patterns and words tied to the user or the
 *    service;
 *  - the Pwned Passwords range API (k-anonymity: only five hex digits of the SHA-1 leave the
 *    server). That service may be down, so it fails open with a log line.
 */
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';

export const MIN_LENGTH = 8;
export const MAX_BYTES = 72;

const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', '12345678910', '0123456789', '987654321', '9876543210',
  '11111111', '111111111', '1111111111', '00000000', '000000000', '0000000000', '22222222',
  '66666666', '88888888', '99999999', '12121212', '12341234', '123123123', '123321123',
  '1234abcd', 'abcd1234', 'abc12345', 'abcd12345', 'abc123456', 'a1234567', 'a12345678',
  'a123456789', 'aa123456', 'aa12345678', '12345678a', '123456789a', '1234567890a', '123456abc',
  '123456aa', '12345678q', '1234qwer', 'qwer1234', '123qweasd', 'qweasdzxc',
  '1qaz2wsx', '1q2w3e4r', '1q2w3e4r5t', '1q2w3e4r5t6y', 'zaq12wsx', 'qazwsxedc', 'qazwsx123',
  'qwertyui', 'qwertyuiop', 'qwerty123', 'qwerty1234', 'qwerty12345', 'qwertyuiop123', 'asdfghjk',
  'asdfghjkl', 'asdf1234', 'zxcvbnm1', 'zxcvbnm123', 'q1w2e3r4', 'q1w2e3r4t5',
  'password', 'password1', 'password12', 'password123', 'password1234', 'passw0rd', 'p@ssw0rd',
  'p@ssword', 'pa55word', 'pa$$word', 'iloveyou', 'iloveyou1', 'iloveyou123', 'letmein1',
  'letmein123', 'welcome1', 'welcome123', 'admin123', 'admin1234', 'administrator', 'adminadmin',
  'root1234', 'changeme', 'changeme123', 'default123', 'test1234', 'testtest', 'test12345',
  'guest123', 'football', 'baseball', 'basketball', 'superman', 'trustno1', 'sunshine',
  'princess', 'starwars', 'whatever', 'computer', 'internet', 'mustang1', 'hello123', 'hello1234',
  'liverpool', 'manchester', 'barcelona', 'freedom1', 'secret123', 'secret12', 'master123',
  'matkhau', 'matkhau1', 'matkhau12', 'matkhau123', 'matkhau1234', 'matkhau123456', 'matkhaumoi',
  'anhyeuem', 'anhyeuem1', 'emyeuanh', 'yeuem123', 'iuem1234', 'vietnam123', 'vietnam12',
  'vietnamvodich', 'nguyenvan', 'nguyenvana', 'hanoi123', 'saigon123', 'hochiminh',
]);

/** Blocked even with up to four trailing digits or symbols, or with digits for letters. */
const COMMON_BASES = new Set([
  'password', 'matkhau', 'qwerty', 'iloveyou', 'welcome', 'letmein', 'admin', 'administrator',
  'football', 'baseball', 'superman', 'dragon', 'sunshine', 'princess', 'monkey', 'master',
  'shadow', 'michael', 'jennifer', 'starwars', 'whatever', 'computer', 'internet', 'mustang',
  'secret', 'changeme', 'default', 'liverpool', 'manchester', 'chelsea', 'barcelona', 'anhyeuem',
  'emyeuanh', 'vietnam', 'saigon', 'hanoi', 'freedom', 'trustno',
]);

const PRODUCT_WORDS = ['zelostech', 'zelos', 'vidshare', 'dacntt'];

const LEET: ReadonlyMap<string, string> = new Map([
  ['@', 'a'], ['4', 'a'], ['0', 'o'], ['1', 'i'], ['!', 'i'], ['3', 'e'], ['$', 's'], ['5', 's'], ['7', 't'],
]);

const isSingleCharacter = (s: string) => /^(.)\1+$/u.test(s);

/** Steady runs such as 12345678 or abcdefgh. */
function isRun(s: string): boolean {
  const codes = Array.from(s, (c) => c.codePointAt(0) ?? 0);
  const step = (codes[1] ?? 0) - (codes[0] ?? 0);
  if (Math.abs(step) !== 1) return false;
  return codes.every((c, i) => i === 0 || c - (codes[i - 1] ?? 0) === step);
}

/** A block of up to four characters repeated, such as 12341234 or abababab. */
function isShortPeriod(s: string): boolean {
  for (let period = 1; period <= 4 && s.length >= period * 2; period += 1) {
    if (s.slice(0, period).repeat(Math.ceil(s.length / period)).slice(0, s.length) === s) return true;
  }
  return false;
}

const baseWord = (s: string) =>
  Array.from(s.replace(/[0-9!@#$%^&*._-]{1,4}$/u, ''), (c) => LEET.get(c) ?? c).join('');

export type PasswordProblem = 'too_short' | 'too_long' | 'common' | 'personal';

/** Checks length and the local blocklist. `identity` holds the user's own handle and e-mail. */
export function passwordProblem(password: string, identity: { handle?: string; email?: string } = {}): PasswordProblem | null {
  if (Array.from(password).length < MIN_LENGTH) return 'too_short';
  if (Buffer.byteLength(password, 'utf8') > MAX_BYTES) return 'too_long';
  const p = password.toLowerCase();
  if (COMMON_PASSWORDS.has(p) || isSingleCharacter(p) || isRun(p) || isShortPeriod(p)) return 'common';
  if (COMMON_BASES.has(baseWord(p))) return 'common';
  const personal = [identity.handle, identity.email?.split('@')[0]]
    .map((x) => (x ?? '').toLowerCase())
    .filter((x) => x.length >= 4);
  if (personal.some((x) => p.includes(x)) || PRODUCT_WORDS.some((w) => p.includes(w))) return 'personal';
  return null;
}

export const PROBLEM_MESSAGES: ReadonlyMap<PasswordProblem | 'breached', string> = new Map([
  ['too_short', `Use at least ${MIN_LENGTH} characters`],
  ['too_long', `Use at most ${MAX_BYTES} bytes (accented letters count as two or three)`],
  ['common', 'This password is too easy to guess'],
  ['personal', 'Do not use your name, e-mail or the site name in the password'],
  ['breached', 'This password appeared in a data breach; choose another one'],
]);

export interface Passwords {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string | null | undefined): Promise<boolean>;
  /** Number of breaches containing the password, or null when the service could not answer. */
  breaches(password: string): Promise<number | null>;
}

export function bcryptPasswords(rounds = 11, fetchImpl: typeof fetch = fetch, timeoutMs = 2000): Passwords {
  // Compared when the account has no password, so both paths cost the same time.
  let dummy: Promise<string> | undefined;
  return {
    hash: (password) => bcrypt.hash(password, rounds),
    async verify(password, hash) {
      if (hash) return bcrypt.compare(password, hash);
      dummy ??= bcrypt.hash('no-password-on-this-account', rounds);
      await bcrypt.compare(password, await dummy);
      return false;
    },
    async breaches(password) {
      const digest = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
      try {
        const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${digest.slice(0, 5)}`, {
          headers: { 'Add-Padding': 'true', 'User-Agent': 'zelos-api' },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return null;
        for (const line of (await res.text()).split('\n')) {
          const [suffix, count] = line.trim().split(':');
          if (suffix === digest.slice(5)) return Number(count) || 0;
        }
        return 0;
      } catch {
        return null;
      }
    },
  };
}
