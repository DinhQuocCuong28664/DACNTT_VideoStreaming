/**
 * CloudFront signing (§5.5). Playback gets a custom policy with a wildcard path for one video,
 * sent as query parameters that the player appends to CDN requests only. Thumbnails and preview
 * sprites in listings get per-file URLs whose expiry is rounded to a six-hour boundary, so the
 * same URL repeats within that time and browsers can cache it.
 */
import { getSignedCookies, getSignedUrl } from '@aws-sdk/cloudfront-signer';
import { HttpError } from '../http/errors.js';

export interface PolicyParams { Policy: string; Signature: string; 'Key-Pair-Id': string }

export interface Cdn {
  /** Query parameters granting every file under `videos/{videoId}/` until `expiresAt`. */
  videoPolicy(videoId: string, expiresAt: Date): PolicyParams;
  /** A signed URL for one file of the processed bucket. */
  fileUrl(path: string, now: Date): string;
  baseUrl: string;
}

const SIX_HOURS = 6 * 3600 * 1000;
/** Expiry of listing URLs: the next six-hour boundary plus six hours (6 to 12 hours from now). */
export const listingExpiry = (now: Date) => new Date(Math.ceil(now.getTime() / SIX_HOURS) * SIX_HOURS + SIX_HOURS);

export function cloudFrontCdn(baseUrl: string, keyPairId: string | undefined, privateKey: string | undefined): Cdn {
  const base = baseUrl.replace(/\/$/, '');
  const credentials = () => {
    if (!keyPairId || !privateKey) throw new HttpError(503, 'PLAYBACK_UNAVAILABLE', 'Playback is not configured');
    return { keyPairId, privateKey };
  };
  return {
    baseUrl: base,
    videoPolicy(videoId, expiresAt) {
      const policy = JSON.stringify({
        Statement: [{
          Resource: `${base}/videos/${videoId}/*`,
          Condition: { DateLessThan: { 'AWS:EpochTime': Math.floor(expiresAt.getTime() / 1000) } },
        }],
      });
      const c = getSignedCookies({ ...credentials(), policy });
      return { Policy: c['CloudFront-Policy'] ?? '', Signature: c['CloudFront-Signature'], 'Key-Pair-Id': c['CloudFront-Key-Pair-Id'] };
    },
    fileUrl(path, now) {
      return getSignedUrl({ ...credentials(), url: `${base}/${path}`, dateLessThan: listingExpiry(now) });
    },
  };
}

/** Unsigned stand-in for tests: the parameters name the video and expiry. */
export function fakeCdn(baseUrl = 'https://cdn.example.test'): Cdn {
  return {
    baseUrl,
    videoPolicy: (videoId, expiresAt) => ({ Policy: `videos/${videoId}/*`, Signature: `sig-${expiresAt.getTime()}`, 'Key-Pair-Id': 'TESTKEY' }),
    fileUrl: (path, now) => `${baseUrl}/${path}?Expires=${listingExpiry(now).getTime() / 1000}`,
  };
}
