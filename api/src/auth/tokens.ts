/**
 * Signed tokens. One HS256 key, separated by audience so a token of one kind is never accepted
 * as another:
 *   access   – the signed-in user (Authorization: Bearer), revoked by bumping tokenVersion
 *   playback – one video for the key endpoint, issued by /playback after the access rule passed
 *   unlock   – one password-protected video, issued by /unlock
 */
import jwt from 'jsonwebtoken';

export const ROLES = ['user', 'operator', 'auditor', 'admin'] as const;
export type Role = (typeof ROLES)[number];
export const STAFF_ROLES: readonly Role[] = ['operator', 'auditor', 'admin'];

/**
 * Staff permissions. Checks name a permission, never a role, so adding a role only changes this
 * table. Operators decide; auditors only read metrics, so oversight does not depend on the
 * people being overseen.
 */
export const PERMISSIONS = {
  'moderation:review': ['admin', 'operator'],
  'moderation:appeals': ['admin', 'operator'],
  'moderation:audit': ['admin', 'operator'],
  'moderation:sample': ['admin'],
  'metrics:read': ['admin', 'auditor'],
  'events:read': ['admin', 'auditor'],
  'users:manage': ['admin'],
  'pii:email': ['admin'],
  'content:viewRemoved': ['admin', 'operator'],
} as const satisfies Record<string, readonly Role[]>;
export type Permission = keyof typeof PERMISSIONS;

const PERMISSION_MAP: ReadonlyMap<Permission, readonly Role[]> = new Map(Object.entries(PERMISSIONS) as [Permission, readonly Role[]][]);

export const can = (role: Role | undefined, permission: Permission): boolean =>
  role !== undefined && (PERMISSION_MAP.get(permission) ?? []).includes(role);

export interface AccessClaims { sub: string; role: Role; tv: number }
export interface PlaybackClaims { sub: string; v: number }
export interface UnlockClaims { sub: string }

const ISSUER = 'zelos-api';
export const TTL = { access: 7 * 24 * 3600, playback: 2 * 3600, unlock: 6 * 3600 } as const;

type Kind = keyof typeof TTL;
const TTL_BY_KIND: ReadonlyMap<Kind, number> = new Map(Object.entries(TTL) as [Kind, number][]);

export class Tokens {
  constructor(private readonly key: string, private readonly now: () => Date = () => new Date()) {}

  private sign(kind: Kind, payload: object): string {
    return jwt.sign({ ...payload, iat: Math.floor(this.now().getTime() / 1000) }, this.key, {
      algorithm: 'HS256', audience: kind, issuer: ISSUER, expiresIn: TTL_BY_KIND.get(kind),
    });
  }

  private verify(kind: Kind, token: string): Record<string, unknown> | null {
    try {
      const out = jwt.verify(token, this.key, {
        algorithms: ['HS256'], audience: kind, issuer: ISSUER,
        clockTimestamp: Math.floor(this.now().getTime() / 1000),
      });
      return typeof out === 'object' ? (out as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  access(c: AccessClaims): string { return this.sign('access', c); }
  playback(videoId: string, uploadVersion: number): string { return this.sign('playback', { sub: videoId, v: uploadVersion }); }
  unlock(videoId: string): string { return this.sign('unlock', { sub: videoId }); }

  verifyAccess(token: string): AccessClaims | null {
    const p = this.verify('access', token);
    if (!p || typeof p['sub'] !== 'string' || typeof p['tv'] !== 'number') return null;
    const role = (ROLES as readonly unknown[]).includes(p['role']) ? (p['role'] as Role) : null;
    return role ? { sub: p['sub'], role, tv: p['tv'] } : null;
  }

  verifyPlayback(token: string, videoId: string): PlaybackClaims | null {
    const p = this.verify('playback', token);
    return p && p['sub'] === videoId && typeof p['v'] === 'number' ? { sub: videoId, v: p['v'] } : null;
  }

  verifyUnlock(token: string, videoId: string): boolean {
    return this.verify('unlock', token)?.['sub'] === videoId;
  }
}
