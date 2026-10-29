/**
 * Fans a VideoPublished event out to the channel's subscribers: one in-app notification each
 * (a conditional put, so a redelivered event adds nothing) and an e-mail for subscribers who
 * opted in, sent only when their notification was new and within the shared daily mail cap.
 */
import { VideoPublished } from '@zelos/shared';

export interface PublishedVideo {
  title: string;
  ownerId: string;
  channelName: string;
  /** Only public, ready, approved videos are announced. */
  announce: boolean;
}

export interface Subscriber { id: string; email: string | null }

export interface NotifierDeps {
  video(videoId: string): Promise<PublishedVideo | null>;
  /** Pages of subscribers; `email` is set only for verified addresses that opted in. */
  subscribers(channelId: string, after: string | null, limit: number): Promise<Subscriber[]>;
  /** Writes the notification unless it exists; returns whether it was new. */
  putNotification(userId: string, sk: string, item: Record<string, unknown>): Promise<boolean>;
  /** Counts one mail against today's cap; false when the cap is reached. */
  takeMailSlot(): Promise<boolean>;
  sendMail(to: string, subject: string, text: string): Promise<void>;
  webBaseUrl: string;
  now: () => Date;
  log: (entry: Record<string, unknown>) => void;
}

export const NOTIFICATION_TTL_DAYS = 90;
const PAGE = 200;

export interface NotifyResult { notified: number; mailed: number; skipped?: string }

export async function notify(event: unknown, deps: NotifierDeps): Promise<NotifyResult> {
  const detail = VideoPublished.parse((event as { detail?: unknown }).detail);
  const video = await deps.video(detail.videoId);
  if (!video?.announce) return { notified: 0, mailed: 0, skipped: video ? 'not public' : 'gone' };

  // The publish time is part of the key, so the same event always writes the same item.
  const sk = `${detail.publishedAt}#upload#${detail.videoId}`;
  const expiresAt = Math.floor(deps.now().getTime() / 1000) + NOTIFICATION_TTL_DAYS * 86_400;
  const link = `${deps.webBaseUrl}/watch/${detail.videoId}`;
  let notified = 0;
  let mailed = 0;
  let capped = false;
  let after: string | null = null;

  for (;;) {
    const page = await deps.subscribers(video.ownerId, after, PAGE);
    for (const s of page) {
      const fresh = await deps.putNotification(s.id, sk, {
        type: 'upload', createdAt: detail.publishedAt, read: false, expiresAt,
        data: { videoId: detail.videoId, title: video.title, channelId: video.ownerId, channelName: video.channelName },
      });
      if (!fresh) continue;
      notified += 1;
      if (!s.email || capped) continue;
      if (!(await deps.takeMailSlot())) {
        capped = true;
        deps.log({ level: 'warn', msg: 'daily mail cap reached, remaining subscribers get in-app notifications only', videoId: detail.videoId });
        continue;
      }
      try {
        await deps.sendMail(s.email, `${video.channelName} uploaded: ${video.title}`.slice(0, 150), `${video.channelName} uploaded a new video:\n\n${video.title}\n${link}\n\nYou get this e-mail because you subscribed and turned on upload e-mails. Turn them off in your settings.`);
        mailed += 1;
      } catch (err) {
        // A failed mail does not undo the notification and is not retried.
        deps.log({ level: 'error', msg: 'upload mail failed', error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (page.length < PAGE) break;
    after = page.at(-1)?.id ?? null;
  }
  deps.log({ level: 'info', msg: 'subscribers notified', videoId: detail.videoId, notified, mailed });
  return { notified, mailed };
}

// ── Runtime wiring ────────────────────────────────────────────────────

let runtime: NotifierDeps | undefined;

async function createRuntime(): Promise<NotifierDeps> {
  const [{ SecretsManagerClient, GetSecretValueCommand }, { DynamoDBClient, ConditionalCheckFailedException }, { DynamoDBDocumentClient, PutCommand, UpdateCommand }, { MongoClient, ObjectId }, nodemailer, { required }] = await Promise.all([
    import('@aws-sdk/client-secrets-manager'),
    import('@aws-sdk/client-dynamodb'),
    import('@aws-sdk/lib-dynamodb'),
    import('mongodb'),
    import('nodemailer'),
    import('./lib/s3.js'),
  ]);
  const secret = JSON.parse((await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: required('API_SECRET_ARN') }))).SecretString ?? '{}') as { mongodbUri: string; smtpUser?: string; smtpPassword?: string };
  const client = new MongoClient(secret.mongodbUri, { maxPoolSize: 2, maxIdleTimeMS: 60_000 });
  const db = client.db(required('DB_NAME'));
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const notifications = required('TABLE_NOTIFICATIONS');
  const limits = required('TABLE_RATE_LIMITS');
  const mailCap = Number(process.env['DAILY_MAIL_CAP'] ?? 400);
  const transport = secret.smtpUser && secret.smtpPassword
    ? nodemailer.default.createTransport({ service: 'gmail', auth: { user: secret.smtpUser, pass: secret.smtpPassword } })
    : null;

  return {
    async video(videoId) {
      const v = await db.collection('videos').findOne({ _id: new ObjectId(videoId) }, { projection: { title: 1, owner: 1, channelName: 1, status: 1, visibility: 1, moderation: 1 } });
      if (!v) return null;
      return {
        title: String(v['title']), ownerId: String(v['owner']), channelName: String(v['channelName'] ?? ''),
        announce: v['status'] === 'READY' && v['visibility'] === 'public' && v['moderation']?.['status'] === 'approved',
      };
    },
    async subscribers(channelId, after, limit) {
      const subs = await db.collection('subscriptions')
        .find({ channel: new ObjectId(channelId), ...(after ? { subscriber: { $gt: new ObjectId(after) } } : {}) }, { projection: { subscriber: 1 } })
        .sort({ subscriber: 1 }).limit(limit).toArray();
      const ids = subs.map((s) => s['subscriber'] as InstanceType<typeof ObjectId>);
      const people = await db.collection('users').find({ _id: { $in: ids } }, { projection: { email: 1, emailVerified: 1, notifyByEmail: 1, disabled: 1 } }).toArray();
      const byId = new Map(people.map((u) => [String(u._id), u]));
      return ids.flatMap((id) => {
        const u = byId.get(String(id));
        if (!u || u['disabled']) return [];
        return [{ id: String(id), email: u['emailVerified'] && u['notifyByEmail'] ? String(u['email']) : null }];
      });
    },
    async putNotification(userId, sk, item) {
      try {
        await ddb.send(new PutCommand({ TableName: notifications, Item: { userId, sk, ...item }, ConditionExpression: 'attribute_not_exists(sk)' }));
        return true;
      } catch (err) {
        if (err instanceof ConditionalCheckFailedException) return false;
        throw err;
      }
    },
    async takeMailSlot() {
      if (!transport) return false;
      // Same counter as the API's mailer, so both share one daily cap.
      const day = new Date().toISOString().slice(0, 10);
      const out = await ddb.send(new UpdateCommand({
        TableName: limits, Key: { pk: `mail-day#${day}` },
        UpdateExpression: 'ADD #c :one SET expiresAt = if_not_exists(expiresAt, :exp)',
        ExpressionAttributeNames: { '#c': 'count' },
        ExpressionAttributeValues: { ':one': 1, ':exp': Math.floor(Date.now() / 1000) + 2 * 86_400 },
        ReturnValues: 'UPDATED_NEW',
      }));
      return Number(out.Attributes?.['count'] ?? 1) <= mailCap;
    },
    async sendMail(to, subject, text) {
      await transport?.sendMail({ from: `Zelos <${secret.smtpUser}>`, to, subject, text });
    },
    webBaseUrl: required('WEB_BASE_URL').replace(/\/$/, ''),
    now: () => new Date(),
    log: (entry) => console.log(JSON.stringify(entry)),
  };
}

export const handler = async (event: unknown): Promise<NotifyResult> => {
  runtime ??= await createRuntime();
  return notify(event, runtime);
};
