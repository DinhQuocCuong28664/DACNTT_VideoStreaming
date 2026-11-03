/**
 * Turns raw ffprobe JSON into the few facts the pipeline needs, and decides whether a source
 * may take the chunked path.
 */
import { parseRational, toNumber, type Rational } from './rational.js';

interface FfprobeStream {
  index?: number;
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  sample_aspect_ratio?: string;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  nb_frames?: string | number;
  duration?: string | number;
  start_time?: string | number;
  channels?: number;
  disposition?: { attached_pic?: number };
  side_data_list?: Array<{ rotation?: number | string }>;
  tags?: Record<string, string>;
}

export interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { duration?: string | number; start_time?: string | number };
}

export interface VideoFacts {
  index: number;
  codec: string | null;
  /** Mean frame rate (avg_frame_rate); null when it is missing or implausible. */
  fps: Rational | null;
  /** Base rate (r_frame_rate); phones writing VFR files often report 90000/1 here. */
  baseFps: Rational | null;
  nbFrames: number | null;
  duration: number | null;
  start: number | null;
  /** Display size after sample aspect ratio and rotation. */
  width: number | null;
  height: number | null;
}

export interface AudioFacts {
  index: number;
  codec: string | null;
  channels: number | null;
  start: number | null;
}

export interface ProbeSummary {
  formatDuration: number | null;
  formatStart: number;
  video: VideoFacts | null;
  audio: AudioFacts | null;
}

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Rotation from the display matrix (newer ffmpeg) or the legacy `rotate` tag. */
export function streamRotation(stream: FfprobeStream): number {
  const matrix = stream.side_data_list?.find((d) => d.rotation !== undefined);
  if (matrix) return Number(matrix.rotation) || 0;
  return Number(stream.tags?.['rotate']) || 0;
}

/** Display size: width scaled by the sample aspect ratio, then swapped for 90/270° rotation. */
export function displaySize(stream: FfprobeStream): { width: number; height: number } | null {
  let width = Number(stream.width);
  let height = Number(stream.height);
  if (!(width > 0 && height > 0)) return null;

  const sar = /^(\d+):(\d+)$/.exec(stream.sample_aspect_ratio ?? '');
  if (sar && Number(sar[1]) > 0 && Number(sar[2]) > 0) {
    width = (width * Number(sar[1])) / Number(sar[2]);
  }
  if (Math.abs(streamRotation(stream)) % 180 === 90) {
    [width, height] = [height, width];
  }
  return { width: Math.round(width), height: Math.round(height) };
}

export const MIN_FPS = 1;
export const MAX_FPS = 240;

/** avg_frame_rate if it is plausible; ffprobe writes 0/0 when it cannot tell. */
function plausibleFps(value: unknown): Rational | null {
  const r = parseRational(value);
  if (!r) return null;
  const fps = toNumber(r);
  return fps >= MIN_FPS && fps <= MAX_FPS ? r : null;
}

export function summarizeProbe(info: FfprobeOutput): ProbeSummary {
  const streams = info.streams ?? [];
  const format = info.format ?? {};

  // Cover art arrives as a one-frame video stream; the real picture is the first other one.
  const videoStream = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  // Same rule as ffmpeg's default: the audio stream with the most channels.
  const audioStream = streams
    .filter((s) => s.codec_type === 'audio')
    .reduce<FfprobeStream | null>((best, s) => (!best || (s.channels ?? 0) > (best.channels ?? 0) ? s : best), null);

  const size = videoStream ? displaySize(videoStream) : null;

  return {
    formatDuration: num(format.duration),
    formatStart: num(format.start_time) ?? 0,
    video: videoStream
      ? {
          index: videoStream.index ?? 0,
          codec: videoStream.codec_name ?? null,
          fps: plausibleFps(videoStream.avg_frame_rate),
          baseFps: parseRational(videoStream.r_frame_rate),
          nbFrames: num(videoStream.nb_frames),
          duration: num(videoStream.duration),
          start: num(videoStream.start_time),
          width: size?.width ?? null,
          height: size?.height ?? null,
        }
      : null,
    audio: audioStream
      ? {
          index: audioStream.index ?? 0,
          codec: audioStream.codec_name ?? null,
          channels: num(audioStream.channels),
          start: num(audioStream.start_time),
        }
      : null,
  };
}

/** Frame count from nb_frames, else the video stream duration, else the file duration. */
export function estimateFrameCount(summary: ProbeSummary): number {
  const video = summary.video;
  if (!video?.fps) return 0;
  if (video.nbFrames && video.nbFrames > 0) return Math.floor(video.nbFrames);
  const seconds = [video.duration, summary.formatDuration].find((s): s is number => !!s && s > 0);
  return seconds ? Math.max(1, Math.round((seconds * video.fps.num) / video.fps.den)) : 0;
}

/** Best known duration in seconds, or null when nothing is known. */
export function durationSeconds(summary: ProbeSummary): number | null {
  const d = summary.video?.duration ?? summary.formatDuration;
  return d && d > 0 ? d : null;
}

export const MAX_AV_START_SKEW_SECONDS = 0.25;
const MIN_CHUNK_FPS = 10;
const MAX_CHUNK_FPS = 120;
const MAX_FPS_DISAGREEMENT = 0.01;

export type Eligibility = { ok: true } | { ok: false; reason: string };

/**
 * The chunked path cuts the source at frame boundaries computed from a constant frame rate,
 * so it accepts only CFR sources whose picture and sound start together.
 */
export function chunkEligibility(summary: ProbeSummary): Eligibility {
  const { video, audio } = summary;
  if (!video) return { ok: false, reason: 'no video stream' };
  if (!video.fps) return { ok: false, reason: 'unreadable frame rate' };
  const rate = toNumber(video.fps);
  if (rate < MIN_CHUNK_FPS || rate > MAX_CHUNK_FPS) {
    return { ok: false, reason: `frame rate ${rate.toFixed(2)} outside the trusted range` };
  }

  if (video.baseFps) {
    const fps = toNumber(video.fps);
    const base = toNumber(video.baseFps);
    if (Math.abs(fps - base) / base > MAX_FPS_DISAGREEMENT) {
      return { ok: false, reason: `variable frame rate: avg ${fps.toFixed(3)} vs r ${base.toFixed(3)}` };
    }
  }
  if (estimateFrameCount(summary) <= 0) return { ok: false, reason: 'unknown video duration' };

  if (audio) {
    const skew = Math.abs((audio.start ?? 0) - (video.start ?? 0));
    if (skew > MAX_AV_START_SKEW_SECONDS) {
      return { ok: false, reason: `audio and video start ${skew.toFixed(2)} s apart` };
    }
  }
  return { ok: true };
}
