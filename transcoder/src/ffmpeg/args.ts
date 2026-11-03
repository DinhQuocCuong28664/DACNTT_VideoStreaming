/**
 * FFmpeg command lines. Pure functions, so every rule that keeps renditions switchable is
 * unit-tested: keyframes forced at absolute segment marks, closed GOPs of the real frame rate,
 * no scene-cut keyframes, 8-bit 4:2:0, no -level, even frame sizes, source read once.
 */
import { gopFrames, segmentName, type Chunk, type PlannedRendition, type Rational } from '@zelos/shared';

/** Reconnect options so a long HTTPS read from S3 survives a dropped connection. */
export const HTTP_INPUT_OPTIONS = [
  '-reconnect', '1',
  '-reconnect_streamed', '1',
  '-reconnect_on_network_error', '1',
  '-reconnect_delay_max', '10',
  '-rw_timeout', '60000000',
];

const isHttp = (url: string): boolean => /^https?:\/\//i.test(url);
export const httpInputOptions = (url: string): string[] => (isHttp(url) ? HTTP_INPUT_OPTIONS : []);

const COMMON = ['-hide_banner', '-loglevel', 'warning', '-nostats', '-progress', 'pipe:1', '-y'];

const seconds = (value: number): string => value.toFixed(6);

/** Keyframe at every absolute multiple of the segment length, whatever the frame rate. */
export const forceKeyFramesExpr = (segmentSeconds: number): string => `expr:gte(t,n_forced*${segmentSeconds})`;

export interface VideoEncodeOptions {
  /** Drop frames after this many seconds (chunk window), measured after the seek. */
  trimEnd?: number;
  /** Restart timestamps at zero so trim and the output offset work per chunk. */
  restartPts?: boolean;
}

/** Scaling and rate control of one rung; shared by the single and chunked paths. */
export function videoEncodeArgs(r: PlannedRendition, options: VideoEncodeOptions = {}): string[] {
  const filters = [
    options.trimEnd === undefined ? null : `trim=end=${seconds(options.trimEnd)}`,
    options.restartPts ? 'setpts=PTS-STARTPTS' : null,
    `scale=${r.width}:${r.height}`,
    'setsar=1',
  ].filter((f): f is string => f !== null);

  return [
    '-vf', filters.join(','),
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-profile:v', 'main', // no -level: x264 picks it from size and rate
    '-pix_fmt', 'yuv420p',
    '-crf', String(r.crf),
    '-maxrate', `${r.maxrateKbps}k`,
    '-bufsize', `${r.bufsizeKbit}k`,
  ];
}

function gopArgs(fps: Rational, segmentSeconds: number): string[] {
  const gop = String(gopFrames(fps, segmentSeconds));
  return ['-g', gop, '-keyint_min', gop, '-sc_threshold', '0'];
}

function hlsOutputArgs(segmentSeconds: number, dir: string, segmentPattern: string, keyInfoPath: string | null): string[] {
  return [
    '-f', 'hls',
    '-hls_time', String(segmentSeconds),
    '-hls_list_size', '0',
    '-hls_playlist_type', 'vod',
    '-start_number', '0',
    ...(keyInfoPath ? ['-hls_key_info_file', keyInfoPath] : []),
    '-hls_segment_filename', `${dir}/${segmentPattern}`,
    `${dir}/index.m3u8`,
  ];
}

export interface SingleJobInput {
  inputUrl: string;
  videoStreamIndex: number;
  audioStreamIndex: number | null;
  renditions: readonly PlannedRendition[];
  fps: Rational;
  segmentSeconds: number;
  /** Local directory; each rung writes to <outputDir>/<rung>/. */
  outputDir: string;
  keyInfoPath: string | null;
}

/** One input read, one HLS output per rung (the decoder runs once and feeds every output). */
export function singleJobArgs(input: SingleJobInput): string[] {
  const args = [...COMMON, ...httpInputOptions(input.inputUrl), '-i', input.inputUrl];
  for (const r of input.renditions) {
    args.push('-map', `0:${input.videoStreamIndex}`);
    if (input.audioStreamIndex !== null) args.push('-map', `0:${input.audioStreamIndex}`);
    args.push(
      ...videoEncodeArgs(r),
      ...gopArgs(input.fps, input.segmentSeconds),
      '-force_key_frames', forceKeyFramesExpr(input.segmentSeconds),
    );
    if (input.audioStreamIndex !== null) {
      args.push('-c:a', 'aac', '-b:a', `${r.audioKbps}k`, '-ar', '44100', '-ac', '2');
    }
    args.push(...hlsOutputArgs(input.segmentSeconds, `${input.outputDir}/${r.name}`, segmentName(0).replace('00000', '%05d'), input.keyInfoPath));
  }
  return args;
}

export interface AudioJobInput {
  inputUrl: string;
  audioStreamIndex: number;
  kbps: number;
  outputPath: string;
}

/** AAC-LC stereo track of one bitrate, encoded once for every chunk to copy. */
export function audioJobArgs(input: AudioJobInput): string[] {
  return [
    ...COMMON,
    ...httpInputOptions(input.inputUrl),
    '-i', input.inputUrl,
    '-map', `0:${input.audioStreamIndex}`,
    '-c:a', 'aac', '-b:a', `${input.kbps}k`, '-ar', '44100', '-ac', '2',
    '-movflags', '+faststart',
    input.outputPath,
  ];
}

function windowArgs(seek: number, duration: number | null): string[] {
  return [...(seek > 0 ? ['-ss', seconds(seek)] : []), ...(duration === null ? [] : ['-t', seconds(duration)])];
}

export interface ChunkJobInput {
  videoUrl: string;
  videoStreamIndex: number;
  /** Pre-encoded audio tracks by bitrate (kbps → URL). */
  audio: ReadonlyMap<number, string>;
  renditions: readonly PlannedRendition[];
  chunk: Chunk;
  fps: Rational;
  segmentSeconds: number;
  outputDir: string;
  keyInfoPath: string | null;
}

/**
 * One chunk of every rung. The video window is cut exactly by `trim` after a seek half a frame
 * early; the matching audio window is copied from the pre-encoded track; the output offset
 * places the chunk on the shared timeline so playlists join without discontinuities.
 */
export function chunkJobArgs(input: ChunkJobInput): string[] {
  const { chunk } = input;
  const args = [...COMMON];
  args.push(...httpInputOptions(input.videoUrl), ...windowArgs(chunk.seekSeconds, chunk.durationSeconds), '-i', input.videoUrl);

  const audioInputs = [...input.audio.entries()];
  for (const [, url] of audioInputs) {
    args.push(...httpInputOptions(url), ...windowArgs(chunk.audioSeekSeconds, chunk.audioDurationSeconds), '-i', url);
  }

  const trimEnd = chunk.durationSeconds === null ? undefined : chunk.durationSeconds;
  for (const r of input.renditions) {
    args.push('-map', `0:${input.videoStreamIndex}`);
    const audioInput = audioInputs.findIndex(([kbps]) => kbps === r.audioKbps);
    if (audioInput >= 0) args.push('-map', `${audioInput + 1}:a:0`);
    args.push(
      ...videoEncodeArgs(r, { restartPts: true, ...(trimEnd === undefined ? {} : { trimEnd }) }),
      '-fps_mode', 'passthrough',
      ...gopArgs(input.fps, input.segmentSeconds),
    );
    // Without -copypriorss 0 the copy keeps the AAC packet just before the seek point, and
    // every chunk boundary plays one audio packet twice.
    if (audioInput >= 0) args.push('-c:a', 'copy', '-copypriorss', '0');
    args.push(
      '-output_ts_offset', seconds(chunk.tsOffsetSeconds),
      ...hlsOutputArgs(input.segmentSeconds, `${input.outputDir}/${r.name}`, segmentName(0, chunk.index).replace('_000', '_%03d'), input.keyInfoPath),
    );
  }
  return args;
}

export interface AnalyseJobInput {
  inputUrl: string;
  videoStreamIndex: number;
  /** One frame every this many seconds for the seek-preview sprite. */
  previewIntervalSec: number;
  outputDir: string;
}

/**
 * Decodes keyframes only (fast on long sources) and writes small preview frames at a fixed
 * interval; moderation frames are taken separately at the sample timestamps.
 */
export function previewFramesArgs(input: AnalyseJobInput): string[] {
  return [
    ...COMMON,
    '-skip_frame', 'nokey',
    ...httpInputOptions(input.inputUrl),
    '-i', input.inputUrl,
    '-map', `0:${input.videoStreamIndex}`,
    '-vf', `fps=1/${input.previewIntervalSec},scale=160:-2`,
    '-fps_mode', 'vfr',
    '-q:v', '5',
    `${input.outputDir}/p_%05d.jpg`,
  ];
}

/** Tiles preview frames into sprite sheets of columns × rows. */
export function spriteArgs(framesDir: string, columns: number, rows: number, outputPattern: string): string[] {
  return [...COMMON, '-framerate', '1', '-i', `${framesDir}/p_%05d.jpg`, '-vf', `tile=${columns}x${rows}`, '-q:v', '5', outputPattern];
}

/** One frame at a timestamp, at most 720 px wide, for Rekognition or the thumbnail. */
export function frameAtArgs(inputUrl: string, videoStreamIndex: number, timestamp: number, outputPath: string): string[] {
  return [
    ...COMMON,
    '-ss', seconds(timestamp),
    ...httpInputOptions(inputUrl),
    '-i', inputUrl,
    '-map', `0:${videoStreamIndex}`,
    '-frames:v', '1',
    '-vf', "scale='min(720,iw)':-2",
    '-q:v', '4',
    outputPath,
  ];
}
