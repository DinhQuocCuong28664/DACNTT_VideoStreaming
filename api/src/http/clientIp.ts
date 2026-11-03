/**
 * Client address for rate limits and guest view marks. Only the Cloudflare Worker can reach the
 * Lambda (origin secret), so CF-Connecting-IP is trusted once the origin check passed; nothing
 * else from the request is.
 */
import type { Request } from 'express';
import { isIP } from 'node:net';

export function clientIp(req: Request, trustCloudflare: boolean): string {
  if (trustCloudflare) {
    const cf = req.get('cf-connecting-ip')?.trim();
    if (cf && isIP(cf)) return cf;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/** Expands an IPv6 address to eight 16-bit groups; returns null when it is not IPv6. */
export function expandIpv6(ip: string): number[] | null {
  if (isIP(ip) !== 6) return null;
  let text = ip.split('%')[0] ?? ip;
  // An embedded IPv4 tail (::ffff:1.2.3.4) becomes two groups.
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (v4?.[1]) {
    const [a, b, c, d] = v4[1].split('.').map(Number) as [number, number, number, number];
    text = text.slice(0, -v4[1].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head = '', tail] = text.split('::');
  const left = head ? head.split(':') : [];
  const right = tail !== undefined && tail !== '' ? tail.split(':') : [];
  const fill = tail === undefined ? 0 : 8 - left.length - right.length;
  const groups = [...left, ...Array<string>(fill).fill('0'), ...right].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

/**
 * Key that groups one subscriber: the IPv4 address, or the IPv6 /56 prefix (ISPs hand a /56 or
 * a /64 to one household, so a single device can rotate through many addresses inside it).
 * An IPv4-mapped IPv6 address counts as IPv4.
 */
export function ipRateKey(ip: string): string {
  const groups = expandIpv6(ip);
  if (!groups) return ip;
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    const [hi = 0, lo = 0] = groups.slice(6);
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  }
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0] = groups;
  return `${[g0, g1, g2].map((g) => g.toString(16)).join(':')}:${(g3 & 0xff00).toString(16)}::/56`;
}
