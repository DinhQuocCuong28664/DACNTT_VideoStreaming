/**
 * Workflow step "Stitch" of the chunked path: validates every chunk result against the plan,
 * writes one media playlist per rung, reads CODECS from each rung's first segment, and uploads
 * the master playlist last. Refuses to publish when any chunk is missing or off its plan.
 */
import {
  KeyMaterial,
  buildMasterPlaylist,
  buildMediaPlaylist,
  codecsFor,
  decryptPrefix,
  hasErrors,
  keyObject,
  keyUri,
  measureBandwidth,
  processedPaths,
  stitchChunks,
  toNumber,
  workPaths,
  type ChunkResult,
  type PackageResult,
  type RungOutput,
  type TranscodePlan,
  type Variant,
} from '@zelos/shared';
import { z } from 'zod';
import { required, s3Store, type ObjectStore } from './lib/s3.js';

const StitchInput = z.object({
  videoId: z.string().regex(/^[a-f0-9]{24}$/),
  uploadVersion: z.number().int().positive(),
});

const PREFIX_BYTES = 16 * 1024;
const PLAYLIST = 'application/vnd.apple.mpegurl';
const PLAYLIST_CACHE = 'public, max-age=60';

export interface StitchDeps {
  store: ObjectStore;
  buckets: { work: string; processed: string; keys: string };
  apiBaseUrl: string;
}

export class StitchRefusedError extends Error {
  constructor(messages: string[]) {
    super(`stitch refused: ${messages.join('; ')}`);
    this.name = 'StitchRefusedError';
  }
}

export async function stitch(input: unknown, deps: StitchDeps): Promise<PackageResult> {
  const { videoId, uploadVersion } = StitchInput.parse(input);
  const work = workPaths(videoId, uploadVersion);
  const processed = processedPaths(videoId, uploadVersion);
  const { store, buckets } = deps;

  const plan = await store.getJson<TranscodePlan>(buckets.work, work.plan);
  if (plan.mode !== 'chunked') throw new Error('stitch runs only for chunked plans');
  const key = KeyMaterial.parse(await store.getJson<unknown>(buckets.keys, keyObject(videoId, uploadVersion)));

  const resultKeys = await store.list(buckets.work, work.chunkResultsPrefix);
  const results = await Promise.all(resultKeys.map((k) => store.getJson<ChunkResult>(buckets.work, k)));
  const rungNames = plan.renditions.map((r) => r.name);
  const stitched = stitchChunks(plan.chunkPlan, rungNames, results);
  for (const issue of stitched.issues) console.log(JSON.stringify({ level: issue.level, msg: issue.message, videoId }));
  if (hasErrors(stitched.issues)) {
    throw new StitchRefusedError(stitched.issues.filter((i) => i.level === 'error').map((i) => i.message));
  }

  const keyTag = { uri: keyUri(deps.apiBaseUrl, videoId), ivHex: key.ivHex };
  const variants: Variant[] = [];
  const rungs: RungOutput[] = [];
  for (const r of plan.renditions) {
    const segments = stitched.rungs.get(r.name) ?? [];
    const bandwidth = measureBandwidth(segments);
    if (!bandwidth) throw new StitchRefusedError([`${r.name} has no measurable segment`]);
    await store.putText(buckets.processed, processed.mediaPlaylist(r.name), buildMediaPlaylist(segments, keyTag), PLAYLIST, PLAYLIST_CACHE);

    const head = await store.getRange(buckets.processed, `${processed.rungDir(r.name)}/${segments[0]!.uri}`, PREFIX_BYTES);
    const codecs = codecsFor(decryptPrefix(head, Buffer.from(key.keyHex, 'hex'), Buffer.from(key.ivHex, 'hex')), plan.hasAudio);

    variants.push({ uri: `${r.name}/index.m3u8`, width: r.width, height: r.height, bandwidth, frameRate: toNumber(plan.fps), codecs });
    rungs.push({ name: r.name, width: r.width, height: r.height, bandwidth, codecs });
  }

  // The master goes last: until it exists, the CDN has nothing to play.
  await store.putText(buckets.processed, processed.master, buildMasterPlaylist(variants), PLAYLIST, PLAYLIST_CACHE);

  const durationSec = (stitched.rungs.get(rungNames.at(-1)!) ?? []).reduce((t, s) => t + s.duration, 0);
  const result: PackageResult = { master: processed.master, rungs, durationSec };
  await store.putText(buckets.work, work.encodeResult, JSON.stringify(result), 'application/json');
  return result;
}

let deps: StitchDeps | undefined;

export const handler = async (event: unknown): Promise<PackageResult> => {
  deps ??= {
    store: s3Store(),
    buckets: { work: required('WORK_BUCKET'), processed: required('PROCESSED_BUCKET'), keys: required('KEYS_BUCKET') },
    apiBaseUrl: required('API_BASE_URL'),
  };
  return stitch(event, deps);
};
