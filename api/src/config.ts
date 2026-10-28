/**
 * Runtime configuration. Plain settings come from Lambda environment variables; secrets come
 * from one JSON secret in Secrets Manager, read once per cold start. Both are validated here so
 * a missing value fails the deploy check instead of a user request.
 */
import { z } from 'zod';
import { HARD_CAP_BYTES } from './model/video.js';

const csv = z.string().transform((s) => s.split(',').map((v) => v.trim()).filter(Boolean));

export const envSchema = z.object({
  APP_ENV: z.enum(['local', 'test', 'staging', 'prod']),
  DB_NAME: z.string().min(1),
  /** Web origins allowed by CORS, e.g. https://zelostech.site */
  WEB_ORIGINS: csv,
  /** Public base URL of the web app, used in e-mail links. */
  WEB_BASE_URL: z.string().url(),
  /** Public base URL of the API without /v1, used for the HLS key URI. */
  API_BASE_URL: z.string().url(),
  CDN_BASE_URL: z.string().url(),
  RAW_BUCKET: z.string().min(1),
  PROCESSED_BUCKET: z.string().min(1),
  KEYS_BUCKET: z.string().min(1),
  TABLE_RATE_LIMITS: z.string().min(1),
  TABLE_VIEW_MARKS: z.string().min(1),
  TABLE_WATCH_PROGRESS: z.string().min(1),
  TABLE_HEARTBEATS: z.string().min(1),
  TABLE_NOTIFICATIONS: z.string().min(1),
  /** Requests without the shared origin header are refused unless this is false (local only). */
  REQUIRE_ORIGIN_SECRET: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  MONGO_POOL_SIZE: z.coerce.number().int().min(1).max(10).default(3),
  /** Upload size cap; an invalid value falls back to the hard cap and never raises it. */
  UPLOAD_MAX_BYTES: z.string().optional(),
  /** EventBridge Scheduler group, target (the status function) and role; unset disables scheduling. */
  SCHEDULE_GROUP: z.string().optional(),
  SCHEDULE_TARGET_ARN: z.string().optional(),
  SCHEDULE_ROLE_ARN: z.string().optional(),
});

export const secretSchema = z.object({
  mongodbUri: z.string().startsWith('mongodb'),
  /** HS256 key for access, playback and unlock tokens; at least 32 bytes. */
  jwtSecret: z.string().min(32),
  /** Shared with the Cloudflare Worker, sent as X-Origin-Verify. */
  originSecret: z.string().min(32),
  googleClientId: z.string().optional(),
  cloudfrontKeyPairId: z.string().optional(),
  cloudfrontPrivateKey: z.string().optional(),
  smtpUser: z.string().optional(),
  smtpPassword: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;
export type Secrets = z.infer<typeof secretSchema>;

export interface Config {
  env: Env['APP_ENV'];
  dbName: string;
  webOrigins: readonly string[];
  webBaseUrl: string;
  apiBaseUrl: string;
  cdnBaseUrl: string;
  buckets: { raw: string; processed: string; keys: string };
  tables: { rateLimits: string; viewMarks: string; watchProgress: string; heartbeats: string; notifications: string };
  requireOriginSecret: boolean;
  mongoPoolSize: number;
  uploadMaxBytes: number;
  schedule: { group: string; targetArn: string; roleArn: string } | null;
  secrets: Secrets;
}

export function loadConfig(env: Record<string, string | undefined>, secretJson: string): Config {
  const e = envSchema.parse(env);
  const s = secretSchema.parse(JSON.parse(secretJson));
  if (e.APP_ENV !== 'local' && e.APP_ENV !== 'test' && !e.REQUIRE_ORIGIN_SECRET) {
    throw new Error('REQUIRE_ORIGIN_SECRET may only be false in local or test');
  }
  return {
    env: e.APP_ENV,
    dbName: e.DB_NAME,
    webOrigins: e.WEB_ORIGINS,
    webBaseUrl: e.WEB_BASE_URL.replace(/\/$/, ''),
    apiBaseUrl: e.API_BASE_URL.replace(/\/$/, ''),
    cdnBaseUrl: e.CDN_BASE_URL.replace(/\/$/, ''),
    buckets: { raw: e.RAW_BUCKET, processed: e.PROCESSED_BUCKET, keys: e.KEYS_BUCKET },
    tables: {
      rateLimits: e.TABLE_RATE_LIMITS,
      viewMarks: e.TABLE_VIEW_MARKS,
      watchProgress: e.TABLE_WATCH_PROGRESS,
      heartbeats: e.TABLE_HEARTBEATS,
      notifications: e.TABLE_NOTIFICATIONS,
    },
    requireOriginSecret: e.REQUIRE_ORIGIN_SECRET,
    mongoPoolSize: e.MONGO_POOL_SIZE,
    uploadMaxBytes: uploadCap(e.UPLOAD_MAX_BYTES),
    schedule: e.SCHEDULE_GROUP && e.SCHEDULE_TARGET_ARN && e.SCHEDULE_ROLE_ARN
      ? { group: e.SCHEDULE_GROUP, targetArn: e.SCHEDULE_TARGET_ARN, roleArn: e.SCHEDULE_ROLE_ARN }
      : null,
    secrets: s,
  };
}

export function uploadCap(raw: string | undefined): number {
  const n = raw === undefined || !/^\d+$/.test(raw.trim()) ? NaN : Number(raw);
  return Number.isSafeInteger(n) && n > 0 && n <= HARD_CAP_BYTES ? n : HARD_CAP_BYTES;
}
