/**
 * Hourly roll-up of player heartbeats (DynamoDB, one row per hour and video) into MongoDB
 * `analyticsDaily`. Each hour is written under its own key and the day totals are recomputed
 * from the hours, so running the same hour twice gives the same document (idempotent).
 */

export const RETENTION_BUCKETS = 20;

export interface HourRow {
  videoId: string;
  views: number;
  watchSeconds: number;
  /** Beats per position bucket, index 0..19. */
  retention: number[];
}

export interface RollupDeps {
  hourRows(hour: string): Promise<HourRow[]>;
  owners(videoIds: string[]): Promise<Map<string, string>>;
  /** Sets one hour of one day and recomputes that day's totals. */
  writeHour(videoId: string, ownerId: string, date: string, hourOfDay: string, row: HourRow): Promise<void>;
  now: () => Date;
  log: (entry: Record<string, unknown>) => void;
}

/** Hour keys (UTC, e.g. 2026-11-02T13) to roll up: the previous hour and the one before, for late beats. */
export function hoursToRoll(now: Date, back = 2): string[] {
  const start = Math.floor(now.getTime() / 3_600_000) * 3_600_000;
  return Array.from({ length: back }, (_, i) => new Date(start - (i + 1) * 3_600_000).toISOString().slice(0, 13));
}

/** Reads `r00`..`r19` attributes into an array. */
export function retentionOf(item: Record<string, unknown>): number[] {
  return Array.from({ length: RETENTION_BUCKETS }, (_, i) => Number(new Map(Object.entries(item)).get(`r${String(i).padStart(2, '0')}`) ?? 0));
}

export async function rollup(event: { hours?: string[] } | undefined, deps: RollupDeps): Promise<{ hours: string[]; rows: number }> {
  const hours = event?.hours?.length ? event.hours : hoursToRoll(deps.now());
  let rows = 0;
  for (const hour of hours) {
    const list = await deps.hourRows(hour);
    if (!list.length) continue;
    const owners = await deps.owners(list.map((r) => r.videoId));
    for (const row of list) {
      const owner = owners.get(row.videoId);
      // Deleted videos keep no analytics.
      if (!owner) continue;
      await deps.writeHour(row.videoId, owner, hour.slice(0, 10), hour.slice(11, 13), row);
      rows += 1;
    }
  }
  deps.log({ level: 'info', msg: 'heartbeats rolled up', hours, rows });
  return { hours, rows };
}

// ── Runtime wiring ────────────────────────────────────────────────────

let runtime: RollupDeps | undefined;

async function createRuntime(): Promise<RollupDeps> {
  const [{ SecretsManagerClient, GetSecretValueCommand }, { DynamoDBClient }, { DynamoDBDocumentClient, QueryCommand }, { MongoClient, ObjectId }, { required }] = await Promise.all([
    import('@aws-sdk/client-secrets-manager'),
    import('@aws-sdk/client-dynamodb'),
    import('@aws-sdk/lib-dynamodb'),
    import('mongodb'),
    import('./lib/s3.js'),
  ]);
  const secret = JSON.parse((await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: required('API_SECRET_ARN') }))).SecretString ?? '{}') as { mongodbUri: string };
  const db = new MongoClient(secret.mongodbUri, { maxPoolSize: 2, maxIdleTimeMS: 60_000 }).db(required('DB_NAME'));
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const table = required('TABLE_HEARTBEATS');
  const daily = db.collection('analyticsDaily');

  return {
    async hourRows(hour) {
      const rows: HourRow[] = [];
      let start: Record<string, unknown> | undefined;
      do {
        const out = await ddb.send(new QueryCommand({ TableName: table, KeyConditionExpression: '#h = :h', ExpressionAttributeNames: { '#h': 'hour' }, ExpressionAttributeValues: { ':h': hour }, ExclusiveStartKey: start }));
        for (const i of out.Items ?? []) {
          rows.push({ videoId: String(i['videoId']), views: Number(i['views'] ?? 0), watchSeconds: Number(i['watchSeconds'] ?? 0), retention: retentionOf(i) });
        }
        start = out.LastEvaluatedKey;
      } while (start);
      return rows;
    },
    async owners(videoIds) {
      const ids = videoIds.filter((id) => /^[a-f0-9]{24}$/.test(id)).map((id) => new ObjectId(id));
      const list = await db.collection('videos').find({ _id: { $in: ids } }, { projection: { owner: 1 } }).toArray();
      return new Map(list.map((v) => [String(v._id), String(v['owner'])]));
    },
    async writeHour(videoId, ownerId, date, hourOfDay, row) {
      const hourDoc = { views: row.views, watchSeconds: row.watchSeconds, retention: row.retention };
      await daily.updateOne(
        { video: new ObjectId(videoId), date },
        [
          { $set: { owner: new ObjectId(ownerId), [`hours.h${hourOfDay}`]: { $literal: hourDoc } } },
          { $set: {
            views: { $sum: { $map: { input: { $objectToArray: '$hours' }, in: '$$this.v.views' } } },
            watchSeconds: { $sum: { $map: { input: { $objectToArray: '$hours' }, in: '$$this.v.watchSeconds' } } },
            retention: { $map: { input: { $range: [0, RETENTION_BUCKETS] }, as: 'i', in: { $sum: { $map: { input: { $objectToArray: '$hours' }, in: { $arrayElemAt: ['$$this.v.retention', '$$i'] } } } } } },
          } },
        ],
        { upsert: true },
      );
    },
    now: () => new Date(),
    log: (entry) => console.log(JSON.stringify(entry)),
  };
}

export const handler = async (event?: { hours?: string[] }) => {
  runtime ??= await createRuntime();
  return rollup(event, runtime);
};
