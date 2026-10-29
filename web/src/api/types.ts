/** Shapes the v2 API returns. Kept by hand next to api/src; the API tests pin the same shapes. */

export type Role = 'user' | 'operator' | 'auditor' | 'admin';
export type Visibility = 'public' | 'unlisted' | 'private' | 'password';
export type Audience = 'public' | 'members';
export type VideoStatus = 'UPLOADING' | 'PROCESSING' | 'READY' | 'SCHEDULED' | 'ERROR';
export const CATEGORIES = ['technology', 'education', 'entertainment', 'music', 'gaming', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  handle: string;
  avatar: string | null;
  banner: string | null;
  description: string;
  role: Role;
  hasPassword: boolean;
  googleLinked: boolean;
  notifyByEmail: boolean;
  counters: { subscribers: number; videos: number };
  createdAt: string;
}

export interface Session { token: string; user: User }

export interface ChannelRef { id: string; name: string; handle: string | null; avatar: string | null }

export interface VideoCard {
  id: string;
  title: string;
  thumbnail: string | null;
  durationSec: number | null;
  views: number;
  publishedAt: string | null;
  visibility: Visibility;
  audience: Audience;
  hasViolence: boolean;
  channel: ChannelRef;
}

export type Lock = 'password' | 'members' | 'removed' | 'not_ready';

export interface VideoDetails extends VideoCard {
  description: string;
  tags: string[];
  category: Category | null;
  counters: { views: number; likes: number; comments: number };
  chapters: { startSec: number; title: string }[];
  captions: { lang: string; label: string }[];
  previewVtt: string | null;
  locked: Lock | null;
  /** Owner and staff only. */
  status?: VideoStatus;
  step?: string;
  processingProgress?: number;
  error?: string | null;
  moderation?: { status: string; reasonCode: string | null };
  publishAt?: string | null;
}

/** A password video before unlock: only the id. */
export interface LockedStub { id: string; locked: 'password' }

export interface Playback {
  masterUrl: string;
  cdnQuery: Record<string, string>;
  playbackToken: string;
  expiresAt: string;
  captions: { lang: string; label: string; url: string }[];
}

export interface Page<T> { items: T[]; nextCursor: string | null }

export interface Comment {
  id: string;
  body: string;
  parentId: string | null;
  pinned: boolean;
  replyCount: number;
  createdAt: string;
  byCreator: boolean;
  author: ChannelRef;
}

export interface Channel {
  id: string;
  displayName: string;
  handle: string;
  avatar: string | null;
  banner: string | null;
  description: string;
  subscribers: number;
  videos: number;
  createdAt: string;
}

export interface Tier { id: string; name: string; price: number; currency: 'VND'; level: number; perks: string[]; description: string; badgeColor: string }
export interface Membership { tierId: string; level: number; expiresAt: string; cancelled: boolean }

export interface ChannelPage {
  channel: Channel;
  viewer: { subscribed: boolean; membership: Membership | null; isOwner: boolean } | null;
  tiers: Tier[];
}

export interface PlaylistSummary {
  id: string;
  kind: 'custom' | 'watch_later';
  title: string;
  description: string;
  visibility: 'public' | 'unlisted' | 'private';
  count: number;
  updatedAt: string;
  owner: string;
}

export type PlaylistItem = (VideoCard & { unavailable: false; addedAt: string }) | { id: string; unavailable: true; addedAt: string };

export interface Notification { id: string; type: string; createdAt: string; read: boolean; data: Record<string, unknown> }

export type UploadGrant =
  | { mode: 'post'; url: string; fields: Record<string, string>; expiresInSec: number }
  | { mode: 'multipart'; partSize: number; partCount: number; expiresInSec: number };
