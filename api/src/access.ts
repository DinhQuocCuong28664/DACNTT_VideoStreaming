/**
 * Who may see and play a video (§9 "Access and playback"). One function decides for the watch
 * page, the playback grant and the key endpoint, so the three never disagree.
 */
import { ObjectId, type Db } from 'mongodb';
import { can, type Role } from './auth/tokens.js';
import { forbidden, notFound } from './http/errors.js';
import type { VideoDoc } from './model/video.js';

export interface Viewer { id: string; role: Role }

export type Access =
  /** Full details and playback. */
  | { see: 'full'; play: true; as: 'owner' | 'staff' | 'viewer' }
  /** Full details, no playback: the owner of an unready or removed video, or a non-member. */
  | { see: 'full'; play: false; as: 'owner' | 'staff' | 'viewer'; lock: 'members' | 'not_ready' | 'removed' }
  /** Only the id and the lock: a password video before it is unlocked; the title stays hidden. */
  | { see: 'stub'; play: false; as: 'viewer'; lock: 'password' };

export interface AccessInput {
  video: Pick<VideoDoc, 'owner' | 'status' | 'visibility' | 'audience' | 'moderation' | 'hlsPath'>;
  viewer: Viewer | undefined;
  unlocked: boolean;
  isMember: () => Promise<boolean>;
}

const playable = (v: AccessInput['video']) => (v.status === 'READY' || v.status === 'SCHEDULED') && Boolean(v.hlsPath);

/** Returns the access, or throws the 404/403 a stranger must get. */
export async function decideAccess({ video, viewer, unlocked, isMember }: AccessInput): Promise<Access> {
  if (viewer && video.owner.toHexString() === viewer.id) {
    if (video.moderation.status === 'removed') return { see: 'full', play: false, as: 'owner', lock: 'removed' };
    return playable(video) ? { see: 'full', play: true, as: 'owner' } : { see: 'full', play: false, as: 'owner', lock: 'not_ready' };
  }
  if (viewer && can(viewer.role, 'content:viewRemoved')) {
    return playable(video) ? { see: 'full', play: true, as: 'staff' } : { see: 'full', play: false, as: 'staff', lock: 'not_ready' };
  }
  // Strangers learn nothing about drafts, scheduled or private videos: they do not exist.
  if (video.status !== 'READY' || !video.hlsPath || video.visibility === 'private') throw notFound('Video');
  if (video.moderation.status === 'removed') throw forbidden('VIDEO_REMOVED', 'This video was removed for breaking the rules');
  if (video.moderation.status !== 'approved') throw forbidden('VIDEO_UNDER_REVIEW', 'This video is being reviewed');
  if (video.visibility === 'password' && !unlocked) return { see: 'stub', play: false, as: 'viewer', lock: 'password' };
  if (video.audience === 'members' && !(await isMember())) return { see: 'full', play: false, as: 'viewer', lock: 'members' };
  return { see: 'full', play: true, as: 'viewer' };
}

/** An active membership of `userId` in the channel `channelId`, at `minLevel` or above. */
export async function hasMembership(db: Db, userId: string | undefined, channelId: ObjectId, now: Date, minLevel = 1): Promise<boolean> {
  if (!userId || !/^[a-f0-9]{24}$/.test(userId)) return false;
  const m = await db.collection('memberships').findOne(
    { member: new ObjectId(userId), channel: channelId, expiresAt: { $gt: now }, level: { $gte: minLevel } },
    { projection: { _id: 1 } },
  );
  return Boolean(m);
}
