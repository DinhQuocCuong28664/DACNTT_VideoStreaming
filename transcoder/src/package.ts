/**
 * Packaging of a finished local encode: rewrite each media playlist in the canonical form,
 * measure real bandwidth, read CODECS from the first segment, and build the master playlist.
 */
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildMasterPlaylist,
  buildMediaPlaylist,
  codecsFor,
  decryptPrefix,
  keyUri,
  measureBandwidth,
  parseMediaPlaylist,
  toNumber,
  type KeyMaterial,
  type MeasuredSegment,
  type PlannedRendition,
  type Rational,
  type RungOutput,
  type Variant,
} from '@zelos/shared';

/** First 16 KiB hold the PAT, PMT and the first access unit with its SPS. */
const PREFIX_BYTES = 16 * 1024;

export interface PackageInput {
  outputDir: string;
  renditions: readonly PlannedRendition[];
  hasAudio: boolean;
  fps: Rational;
  key: KeyMaterial;
  apiBaseUrl: string;
  videoId: string;
}

export async function packageLocal(input: PackageInput): Promise<{ master: string; rungs: RungOutput[] }> {
  const variants: Variant[] = [];
  const rungs: RungOutput[] = [];
  const keyTag = { uri: keyUri(input.apiBaseUrl, input.videoId), ivHex: input.key.ivHex };
  const key = Buffer.from(input.key.keyHex, 'hex');
  const iv = Buffer.from(input.key.ivHex, 'hex');

  for (const r of input.renditions) {
    const dir = join(input.outputDir, r.name);
    const entries = parseMediaPlaylist(await readFile(join(dir, 'index.m3u8'), 'utf8'));
    const measured: MeasuredSegment[] = [];
    for (const e of entries) {
      const bytes = await stat(join(dir, e.uri)).then((s) => s.size).catch(() => 0);
      // A listed segment that is missing or empty would become a gap in playback: fail instead.
      if (bytes <= 0) throw new Error(`${r.name}: segment ${e.uri} is missing or empty`);
      measured.push({ ...e, bytes });
    }
    if (measured.length === 0) throw new Error(`${r.name}: ffmpeg wrote no segments`);

    await writeFile(join(dir, 'index.m3u8'), buildMediaPlaylist(measured, keyTag));

    const bandwidth = measureBandwidth(measured);
    if (!bandwidth) throw new Error(`${r.name}: no measurable segment`);
    const head = (await readFile(join(dir, measured[0]!.uri))).subarray(0, PREFIX_BYTES);
    const codecs = codecsFor(decryptPrefix(head, key, iv), input.hasAudio);

    variants.push({ uri: `${r.name}/index.m3u8`, width: r.width, height: r.height, bandwidth, frameRate: toNumber(input.fps), codecs });
    rungs.push({ name: r.name, width: r.width, height: r.height, bandwidth, codecs });
  }

  return { master: buildMasterPlaylist(variants), rungs };
}
