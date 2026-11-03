/** User documents and the shape the API returns for them. */
import type { ObjectId } from 'mongodb';
import type { Role } from '../auth/tokens.js';

export interface UserDoc {
  _id: ObjectId;
  email: string;
  emailVerified: boolean;
  passwordHash: string | null;
  googleSub: string | null;
  displayName: string;
  /** Channel address, lowercase, shown as @handle. */
  handle: string;
  handleChanges?: { from: string; to: string; at: Date }[];
  avatar: string | null;
  banner: string | null;
  description: string;
  role: Role;
  tokenVersion: number;
  disabled: boolean;
  /** Subscribers who opted in receive an e-mail for each new upload. */
  notifyByEmail: boolean;
  counters: { subscribers: number; videos: number };
  createdAt: Date;
  updatedAt: Date;
}

/** The signed-in user's own view, including private fields. */
export function selfView(u: UserDoc) {
  return {
    id: u._id.toHexString(),
    email: u.email,
    emailVerified: u.emailVerified,
    displayName: u.displayName,
    handle: u.handle,
    avatar: u.avatar,
    banner: u.banner,
    description: u.description,
    role: u.role,
    hasPassword: Boolean(u.passwordHash),
    googleLinked: Boolean(u.googleSub),
    notifyByEmail: u.notifyByEmail,
    counters: u.counters,
    createdAt: u.createdAt.toISOString(),
  };
}

/** What anyone may see about a channel. */
export function publicView(u: Pick<UserDoc, '_id' | 'displayName' | 'handle' | 'avatar' | 'banner' | 'description' | 'counters' | 'createdAt'>) {
  return {
    id: u._id.toHexString(),
    displayName: u.displayName,
    handle: u.handle,
    avatar: u.avatar,
    banner: u.banner,
    description: u.description,
    subscribers: u.counters.subscribers,
    videos: u.counters.videos,
    createdAt: u.createdAt.toISOString(),
  };
}

export const HANDLE_RE = /^[a-z0-9](?:[a-z0-9._]{1,28})[a-z0-9]$/;

/** Paths of the web app and words that would read as official. */
export const RESERVED_HANDLES = new Set([
  'admin', 'administrator', 'api', 'auth', 'embed', 'feed', 'help', 'home', 'library', 'login',
  'logout', 'me', 'mod', 'moderator', 'operator', 'playlist', 'register', 'results', 'search',
  'settings', 'shorts', 'signin', 'signup', 'staff', 'studio', 'support', 'system', 'upload',
  'watch', 'zelos', 'zelostech',
]);

/** Turns any text into handle characters; the caller adds a suffix when it is taken. */
export function handleBase(text: string): string {
  const ascii = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u0111\u0110]/g, 'd').toLowerCase();
  const cleaned = ascii.replace(/[^a-z0-9._]+/g, '').slice(0, 24).replace(/^[._]+|[._]+$/g, '');
  return cleaned.length >= 3 ? cleaned : `user${cleaned}`;
}
