const crypto = require('crypto');
const httpError = require('../utils/httpError');

/**
 * Only requests that came through the Cloudflare Worker reach the routes.
 *
 * The Lambda function URL is public: anyone who learns its hostname can call
 * it directly and skip Cloudflare (its DDoS protection, its client IP header,
 * which the rate limiters key on). The Worker adds X-Origin-Verify with a
 * secret only it and this function know (infrastructure/cloudflare-worker);
 * a request without it is refused with 403.
 *
 * Off until ORIGIN_VERIFY_SECRET is set (by runtimeSecrets.js on Lambda), so
 * local runs and tests are unaffected and the secret can be rolled out after
 * the Worker sends it. Health checks stay open: CD checks the function URL
 * directly after a deploy, and they reveal nothing.
 */
const HEADER = 'x-origin-verify';
const OPEN_PATHS = new Set(['/', '/health', '/api/health']);

const matches = (received, expected) => {
  const a = Buffer.from(String(received || ''));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const originVerify = (req, res, next) => {
  const expected = process.env.ORIGIN_VERIFY_SECRET;
  if (!expected || OPEN_PATHS.has(req.path)) return next();
  if (matches(req.get(HEADER), expected)) return next();
  return next(httpError(403, 'Forbidden', 'ORIGIN_NOT_ALLOWED'));
};

module.exports = originVerify;
module.exports.HEADER = HEADER;
