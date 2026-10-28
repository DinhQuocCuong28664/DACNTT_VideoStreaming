/**
 * MongoDB implementation of VideoStore. Every update filters on the upload version and the
 * expected status, so writes are idempotent and a late event of an older run is ignored.
 * The client is created once per Lambda instance with a small pool (§5.8 connection budget).
 */
import { MongoClient, ObjectId, type Collection, type Document } from 'mongodb';
import type { ProgressState, TranscodeProgress } from '@zelos/shared';
import type { VideoDoc, VideoStore } from '../status.js';

let client: MongoClient | undefined;

export async function videosCollection(uri: string, dbName: string): Promise<Collection<Document>> {
  client ??= new MongoClient(uri, { maxPoolSize: 2, maxIdleTimeMS: 60_000, serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  return client.db(dbName).collection('videos');
}

const toDoc = (d: Document | null): VideoDoc | null =>
  d ? { _id: String(d['_id']), owner: String(d['owner']), status: String(d['status']), uploadVersion: Number(d['uploadVersion']), publishAt: d['publishAt'] ?? null, progress: d['progress'] } : null;

export function mongoVideoStore(videos: Collection<Document>, now: () => Date = () => new Date()): VideoStore {
  const id = (videoId: string) => new ObjectId(videoId);
  return {
    async startProcessing(videoId, uploadVersion, progress: ProgressState, keyRef) {
      const d = await videos.findOneAndUpdate(
        { _id: id(videoId), uploadVersion, status: { $in: ['UPLOADING', 'ERROR', 'PROCESSING'] } },
        { $set: { status: 'PROCESSING', step: 'probe', processingProgress: 0, progress, keyRef, error: null, updatedAt: now() } },
        { returnDocument: 'after' },
      );
      return toDoc(d);
    },

    async recordProgress(videoId, uploadVersion, event: TranscodeProgress) {
      const update: Document = { $set: { updatedAt: now() } };
      if (event.part !== undefined) {
        if (event.percent >= 100) update['$addToSet'] = { 'progress.chunksDone': event.part };
        if (event.parts !== undefined) update['$set']['progress.chunkCount'] = event.parts;
      } else {
        update['$max'] = { [`progress.${event.step}`]: event.percent };
        update['$set']['step'] = event.step;
      }
      const d = await videos.findOneAndUpdate({ _id: id(videoId), uploadVersion, status: 'PROCESSING' }, update, { returnDocument: 'after' });
      return toDoc(d);
    },

    async setOverallProgress(videoId, uploadVersion, percent) {
      await videos.updateOne({ _id: id(videoId), uploadVersion, status: 'PROCESSING' }, { $max: { processingProgress: percent } });
    },

    async publish(videoId, uploadVersion, fields) {
      const at = now();
      const literal = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { $literal: v }]));
      // A pipeline update decides READY or SCHEDULED from the stored publishAt in the same write.
      const d = await videos.findOneAndUpdate(
        { _id: id(videoId), uploadVersion, status: 'PROCESSING' },
        [{
          $set: {
            ...literal,
            status: { $cond: [{ $gt: ['$publishAt', at] }, 'SCHEDULED', 'READY'] },
            processedAt: at,
            updatedAt: at,
          },
        }],
        { returnDocument: 'after' },
      );
      return toDoc(d);
    },

    async fail(videoId, uploadVersion, reason) {
      const d = await videos.findOneAndUpdate(
        { _id: id(videoId), uploadVersion, status: { $in: ['UPLOADING', 'PROCESSING'] } },
        { $set: { status: 'ERROR', error: reason, updatedAt: now() } },
        { returnDocument: 'after' },
      );
      return toDoc(d);
    },
  };
}
