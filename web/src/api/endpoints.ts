/** Typed calls of every v2 route the web app uses, grouped like the API features. */
import { api, request } from './http';
import type {
  Category, Channel, ChannelPage, Comment, LockedStub, Membership, Notification, Page, Playback,
  PlaylistItem, PlaylistSummary, Role, Session, Tier, UploadGrant, User, VideoCard, VideoDetails, Visibility,
} from './types';

const enc = encodeURIComponent;

export const auth = {
  register: (b: { email: string; password: string; displayName: string; handle?: string }) => api.post<Session>('/auth/register', b),
  login: (b: { email: string; password: string }) => api.post<Session>('/auth/login', b),
  google: (idToken: string) => api.post<Session>('/auth/google', { idToken }),
  linkGoogle: (idToken: string) => api.post<{ user: User }>('/auth/link-google', { idToken }),
  me: () => api.get<{ user: User }>('/auth/me'),
  verifyEmail: (token: string) => api.post<{ verified: true }>('/auth/verify-email', { token }),
  resendVerification: () => api.post<{ sent: boolean }>('/auth/resend-verification'),
  forgotPassword: (email: string) => api.post<{ sent: true }>('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) => api.post<Session>('/auth/reset-password', { token, password }),
  changePassword: (b: { currentPassword?: string; newPassword: string }) => api.post<Session>('/auth/change-password', b),
  logout: () => api.post<void>('/auth/logout'),
};

const unlockHeader = (unlockToken?: string | null): Record<string, string> => (unlockToken ? { 'X-Unlock-Token': unlockToken } : {});

export const videos = {
  list: (q: { cursor?: string | null; category?: Category | null; limit?: number } = {}) => api.get<Page<VideoCard>>('/videos', { query: q }),
  get: (id: string, unlockToken?: string | null) => api.get<{ video: VideoDetails | LockedStub }>(`/videos/${enc(id)}`, { headers: unlockHeader(unlockToken) }),
  playback: (id: string, unlockToken?: string | null) => api.get<Playback>(`/videos/${enc(id)}/playback`, { headers: unlockHeader(unlockToken) }),
  unlock: (id: string, password: string) => api.post<{ unlockToken: string }>(`/videos/${enc(id)}/unlock`, { password }),
  view: (id: string, playbackToken: string) => api.post<{ counted: boolean; views: number }>(`/videos/${enc(id)}/view`, {}, { headers: { 'X-Playback-Token': playbackToken } }),
  heartbeat: (id: string, playbackToken: string, b: { positionSec: number; watchedSec: number }) =>
    api.post<{ counted: boolean }>(`/videos/${enc(id)}/heartbeat`, b, { headers: { 'X-Playback-Token': playbackToken } }),
  related: (id: string) => api.get<{ items: VideoCard[] }>(`/videos/${enc(id)}/related`),
  update: (id: string, b: Partial<{ title: string; description: string; tags: string[]; category: Category | null; visibility: Visibility; password: string; audience: 'public' | 'members'; minTierLevel: number; hasViolence: boolean }>) =>
    api.patch<{ video: VideoDetails }>(`/videos/${enc(id)}`, b),
  remove: (id: string) => api.del<void>(`/videos/${enc(id)}`),
  reaction: (id: string) => api.get<{ kind: 'like' | 'dislike' | null }>(`/videos/${enc(id)}/reaction`),
  react: (id: string, kind: 'like' | 'dislike' | null) => api.put<{ kind: 'like' | 'dislike' | null; likes: number }>(`/videos/${enc(id)}/reaction`, { kind }),
  report: (id: string, reason: string, details: string) => api.post<{ reported: true; repeated: boolean }>(`/videos/${enc(id)}/report`, { reason, details }),
  appeal: (id: string, message: string) => api.post<{ appeal: { status: string } }>(`/videos/${enc(id)}/appeal`, { message }),
  appealStatus: (id: string) => api.get<{ appeal: { status: string; message: string; resolution: string | null } | null }>(`/videos/${enc(id)}/appeal`),
};

export const comments = {
  list: (videoId: string, cursor?: string | null, unlockToken?: string | null) =>
    api.get<Page<Comment> & { total: number }>(`/videos/${enc(videoId)}/comments`, { query: { cursor }, headers: unlockHeader(unlockToken) }),
  replies: (id: string, cursor?: string | null) => api.get<Page<Comment>>(`/comments/${enc(id)}/replies`, { query: { cursor } }),
  create: (videoId: string, body: string, parentId?: string) => api.post<{ comment: Comment }>(`/videos/${enc(videoId)}/comments`, { body, ...(parentId ? { parentId } : {}) }),
  remove: (id: string) => api.del<void>(`/comments/${enc(id)}`),
  pin: (id: string) => api.put<void>(`/comments/${enc(id)}/pin`),
  unpin: (id: string) => api.del<void>(`/comments/${enc(id)}/pin`),
  report: (id: string, reason: string, details: string) => api.post<{ reported: true; repeated: boolean }>(`/comments/${enc(id)}/report`, { reason, details }),
};

export const channels = {
  get: (ref: string) => api.get<ChannelPage>(`/channels/${enc(ref)}`),
  videos: (ref: string, cursor?: string | null) => api.get<Page<VideoCard>>(`/channels/${enc(ref)}/videos`, { query: { cursor } }),
  subscribe: (ref: string) => api.put<{ subscribed: boolean; subscribers: number }>(`/channels/${enc(ref)}/subscription`),
  unsubscribe: (ref: string) => api.del<{ subscribed: boolean; subscribers: number }>(`/channels/${enc(ref)}/subscription`),
  join: (ref: string, tierId: string) => api.put<{ membership: Membership }>(`/channels/${enc(ref)}/membership`, { tierId }),
  cancel: (ref: string) => api.del<{ membership: Membership }>(`/channels/${enc(ref)}/membership`),
};

export const me = {
  profile: (b: Partial<{ displayName: string; handle: string; description: string; notifyByEmail: boolean }>) => api.patch<{ user: User }>('/me/profile', b),
  subscriptions: () => api.get<{ items: Channel[] }>('/me/subscriptions'),
  feed: (cursor?: string | null) => api.get<Page<VideoCard>>('/me/feed', { query: { cursor } }),
  history: (cursor?: string | null) => api.get<Page<VideoCard & { positionSec: number; watchedAt: string }>>('/me/history', { query: { cursor } }),
  removeHistory: (videoId: string) => api.del<void>(`/me/history/${enc(videoId)}`),
  clearHistory: () => api.del<{ removed: number }>('/me/history'),
  progress: (videoId: string) => api.get<{ positionSec: number }>(`/me/progress/${enc(videoId)}`),
  notifications: (cursor?: string | null) => api.get<Page<Notification> & { unread: number }>('/me/notifications', { query: { cursor } }),
  markRead: (ids: string[]) => api.post<{ unread: number }>('/me/notifications/read', { ids }),
  videos: (q: { cursor?: string | null; status?: string } = {}) => api.get<Page<VideoDetails>>('/me/videos', { query: q }),
  analytics: (days = 28) => api.get<{ days: { date: string; views: number; watchSeconds: number }[]; top: VideoCard[]; subscribers: number }>('/me/analytics', { query: { days } }),
  tiers: { create: (b: Omit<Tier, 'id' | 'currency'>) => api.post<{ tier: Tier }>('/me/tiers', b), update: (id: string, b: Partial<Tier>) => api.patch<{ tier: Tier }>(`/me/tiers/${enc(id)}`, b), remove: (id: string) => api.del<void>(`/me/tiers/${enc(id)}`) },
  members: () => api.get<{ items: (Membership & { member: { id: string; name: string; handle: string; avatar: string | null } | null })[] }>('/me/members'),
  avatar: (uploadId: string) => api.put<{ user: User }>('/me/avatar', { uploadId }),
  banner: (uploadId: string) => api.put<{ user: User }>('/me/banner', { uploadId }),
};

export const playlists = {
  mine: () => api.get<{ items: PlaylistSummary[] }>('/me/playlists'),
  create: (b: { title: string; description?: string; visibility?: 'public' | 'unlisted' | 'private' }) => api.post<{ playlist: PlaylistSummary }>('/me/playlists', b),
  get: (id: string) => api.get<{ playlist: PlaylistSummary; items: PlaylistItem[] }>(`/playlists/${enc(id)}`),
  update: (id: string, b: Partial<{ title: string; description: string; visibility: 'public' | 'unlisted' | 'private' }>) => api.patch<{ playlist: PlaylistSummary }>(`/playlists/${enc(id)}`, b),
  remove: (id: string) => api.del<void>(`/playlists/${enc(id)}`),
  add: (id: string, videoId: string) => api.post<{ added: true }>(`/playlists/${enc(id)}/items`, { videoId }),
  removeItem: (id: string, videoId: string) => api.del<void>(`/playlists/${enc(id)}/items/${enc(videoId)}`),
  reorder: (id: string, videoIds: string[]) => api.put<void>(`/playlists/${enc(id)}/order`, { videoIds }),
};

export const studio = {
  captions: (id: string, lang: string, label: string, vtt: string) =>
    request<{ captions: { lang: string; label: string }[] }>('PUT', `/videos/${enc(id)}/captions/${enc(lang)}`, { query: { label }, raw: { body: vtt, contentType: 'text/vtt' } }),
  removeCaption: (id: string, lang: string) => api.del<void>(`/videos/${enc(id)}/captions/${enc(lang)}`),
  chapters: (id: string, chapters: { startSec: number; title: string }[]) => api.put<{ chapters: { startSec: number; title: string }[] }>(`/videos/${enc(id)}/chapters`, { chapters }),
  thumbnail: (id: string, uploadId: string) => api.put<{ thumbnail: string | null }>(`/videos/${enc(id)}/thumbnail`, { uploadId }),
  removeThumbnail: (id: string) => api.del<void>(`/videos/${enc(id)}/thumbnail`),
  schedule: (id: string, publishAt: string) => api.put<{ status: string; publishAt: string }>(`/videos/${enc(id)}/schedule`, { publishAt }),
  unschedule: (id: string) => api.del<{ status: string; visibility: string }>(`/videos/${enc(id)}/schedule`),
  analytics: (id: string, days = 28) => api.get<{ days: { date: string; views: number; watchSeconds: number }[]; totals: { views: number; watchSeconds: number }; retention: number[] }>(`/videos/${enc(id)}/analytics`, { query: { days } }),
  imageUpload: (contentType: 'image/jpeg' | 'image/png', size: number) =>
    api.post<{ uploadId: string; upload: { url: string; fields: Record<string, string>; expiresInSec: number } }>('/images/uploads', { contentType, size }),
};

export const uploads = {
  create: (b: { fileName: string; size: number; contentType: string; title?: string; description?: string; visibility?: Exclude<Visibility, 'password'> }) =>
    api.post<{ video: { id: string; uploadVersion: number; status: string }; upload: UploadGrant }>('/uploads', b),
  parts: (id: string, partNumbers: number[]) => api.post<{ parts: { partNumber: number; size: number; url: string }[]; expiresInSec: number }>(`/uploads/${enc(id)}/parts`, { partNumbers }),
  complete: (id: string) => api.post<{ video: { id: string; status: string } }>(`/uploads/${enc(id)}/complete`),
  abort: (id: string) => api.post<void>(`/uploads/${enc(id)}/abort`),
};

export const discovery = {
  search: (q: string, page = 1, category?: Category | null) => api.get<{ items: VideoCard[]; channels: Channel[]; nextPage: number | null }>('/search', { query: { q, page, category } }),
  suggest: (q: string, signal?: AbortSignal) => api.get<{ items: string[] }>('/search/suggest', { query: { q }, ...(signal ? { signal } : {}) }),
};

/** A video in the moderation queue: the card plus the moderation record. */
export type QueueItem = VideoCard & { status: string; ownerEmail?: string | null; moderation: { status: string; source?: string; reasonCode?: string; openReports?: number; labels?: { timestamp: number; labels: { Name?: string; ParentName?: string; Confidence?: number }[] }[]; error?: string | null } };
export type Interval = { value: number; low: number; high: number; n: number } | null;
export interface Metrics {
  autoRemoved: { reviewed: number; falsePositive: number; unreviewed: number; falsePositiveRate: Interval };
  autoHeld: { reviewed: number; confirmed: number; unreviewed: number; precision: Interval };
  missed: { falseNegative: number };
  audit: { pending: number; labelled: number; failed: number; falseNegativeRate: Interval };
  byReason: { outcome: string; reasonCode: string; count: number }[];
}
export interface ModerationEvent { video: string; actorRole: Role; decision: string; action: string; outcome: string; reasonCode: string; note: string; createdAt: string }
export interface StaffUser { id: string; email: string; handle: string; displayName: string; role: Role; disabled?: boolean; createdAt: string }

export const admin = {
  stats: () => api.get<{ review: number; removed: number; reportedComments: number; openAppeals: number }>('/admin/stats'),
  queue: (tab: 'review' | 'removed', cursor?: string | null) => api.get<Page<QueueItem>>('/admin/queue', { query: { tab, cursor } }),
  reports: (id: string) => api.get<{ items: { reason: string; details: string; status: string; createdAt: string }[]; openByReason: Record<string, number> }>(`/admin/videos/${enc(id)}/reports`),
  decide: (id: string, b: { decision: 'approve' | 'block'; reasonCode: string; note: string }) => api.post<{ moderation: { status: string } }>(`/admin/videos/${enc(id)}/decision`, b),
  comments: () => api.get<{ items: { id: string; video: string; body: string; openReports: number }[] }>('/admin/comments'),
  decideComment: (id: string, decision: 'dismiss' | 'remove') => api.post<{ decision: string }>(`/admin/comments/${enc(id)}/decision`, { decision }),
  appeals: (status: 'open' | 'upheld' | 'rejected' = 'open') => api.get<{ items: { id: string; message: string; status: string; createdAt: string; video: VideoCard | null }[] }>('/admin/appeals', { query: { status } }),
  decideAppeal: (id: string, decision: 'uphold' | 'reject', resolution: string) => api.post<{ appeal: { status: string } }>(`/admin/appeals/${enc(id)}/decision`, { decision, resolution }),
  sample: (size: number) => api.post<{ sampled: number }>('/admin/audit/sample', { size }),
  audit: () => api.get<{ items: { id: string; video: VideoCard | null }[] }>('/admin/audit'),
  label: (id: string, result: 'pass' | 'fail', note: string) => api.post<{ sample: { status: string } }>(`/admin/audit/${enc(id)}`, { result, note }),
  metrics: () => api.get<Metrics>('/admin/metrics'),
  events: (outcome?: string | null, cursor?: string | null) => api.get<Page<ModerationEvent>>('/admin/events', { query: { outcome, cursor } }),
  users: (q?: string, role?: Role | null) => api.get<{ items: StaffUser[] }>('/admin/users', { query: { q, role } }),
  setRole: (id: string, role: Role) => api.put<{ user: { id: string; role: Role } }>(`/admin/users/${enc(id)}/role`, { role }),
  roleChanges: () => api.get<{ items: { user: string; from: Role; to: Role; by: string; at: string }[] }>('/admin/role-changes'),
};
