/**
 * Daily clean-up of abandoned uploads (§4.5): drafts still UPLOADING 24 hours after they began.
 * It aborts the multipart upload (best effort; a lifecycle rule removes it after a day anyway),
 * deletes any raw object and then the draft, guarded on the status so a draft that started
 * processing meanwhile is kept.
 */

export const ABANDONED_AFTER_HOURS = 24;

export interface Draft { id: string; uploadVersion: number; uploadId: string | null }

export interface ReconcilerDeps {
  abandoned(before: Date, limit: number): Promise<Draft[]>;
  abortMultipart(key: string, uploadId: string): Promise<void>;
  deleteRawPrefix(prefix: string): Promise<number>;
  /** Deletes the draft only if it is still UPLOADING; returns whether it did. */
  deleteDraft(id: string): Promise<boolean>;
  now: () => Date;
  log: (entry: Record<string, unknown>) => void;
}

export async function reconcile(deps: ReconcilerDeps, limit = 500): Promise<{ removed: number; kept: number }> {
  const before = new Date(deps.now().getTime() - ABANDONED_AFTER_HOURS * 3_600_000);
  let removed = 0;
  let kept = 0;
  for (const d of await deps.abandoned(before, limit)) {
    if (d.uploadId) {
      await deps.abortMultipart(`raw/${d.id}/${d.uploadVersion}/source`, d.uploadId).catch((err: unknown) =>
        deps.log({ level: 'warn', msg: 'abort multipart failed', videoId: d.id, error: String(err) }));
    }
    if (await deps.deleteDraft(d.id)) {
      await deps.deleteRawPrefix(`raw/${d.id}/`);
      removed += 1;
    } else {
      kept += 1;
    }
  }
  deps.log({ level: 'info', msg: 'abandoned drafts reconciled', removed, kept });
  return { removed, kept };
}

// ── Runtime wiring ────────────────────────────────────────────────────

let runtime: ReconcilerDeps | undefined;

async function createRuntime(): Promise<ReconcilerDeps> {
  const [{ SecretsManagerClient, GetSecretValueCommand }, { S3Client, AbortMultipartUploadCommand, ListObjectsV2Command, DeleteObjectsCommand }, { MongoClient, ObjectId }, { required }] = await Promise.all([
    import('@aws-sdk/client-secrets-manager'),
    import('@aws-sdk/client-s3'),
    import('mongodb'),
    import('./lib/s3.js'),
  ]);
  const secret = JSON.parse((await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: required('API_SECRET_ARN') }))).SecretString ?? '{}') as { mongodbUri: string };
  const videos = new MongoClient(secret.mongodbUri, { maxPoolSize: 2, maxIdleTimeMS: 60_000 }).db(required('DB_NAME')).collection('videos');
  const s3 = new S3Client({});
  const bucket = required('RAW_BUCKET');

  return {
    async abandoned(before, limit) {
      const list = await videos.find({ status: 'UPLOADING', 'upload.startedAt': { $lt: before } }, { projection: { uploadVersion: 1, 'upload.uploadId': 1 } }).limit(limit).toArray();
      return list.map((v) => ({ id: String(v._id), uploadVersion: Number(v['uploadVersion']), uploadId: (v['upload']?.['uploadId'] as string | null) ?? null }));
    },
    async abortMultipart(key, uploadId) {
      await s3.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }));
    },
    async deleteRawPrefix(prefix) {
      const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
      const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
      if (keys.length) await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } }));
      return keys.length;
    },
    async deleteDraft(id) {
      return (await videos.deleteOne({ _id: new ObjectId(id), status: 'UPLOADING' })).deletedCount === 1;
    },
    now: () => new Date(),
    log: (entry) => console.log(JSON.stringify(entry)),
  };
}

export const handler = async () => {
  runtime ??= await createRuntime();
  return reconcile(runtime);
};
