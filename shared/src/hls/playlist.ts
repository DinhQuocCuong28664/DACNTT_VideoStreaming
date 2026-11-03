/**
 * HLS playlists (RFC 8216): parse media playlists, write media and master playlists, and
 * measure the bandwidth that a master playlist declares.
 */

export interface SegmentEntry {
  /** URI as written in the playlist, relative to it. */
  uri: string;
  /** EXTINF duration in seconds. */
  duration: number;
}

export interface MeasuredSegment extends SegmentEntry {
  bytes: number;
}

/**
 * Segment URIs with their durations. The URI is the first non-empty line after #EXTINF that
 * is not a tag, so tags such as #EXT-X-ENDLIST are never taken for a file. Accepts CRLF.
 */
export function parseMediaPlaylist(text: string): SegmentEntry[] {
  const segments: SegmentEntry[] = [];
  let pending: number | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') continue;
    if (line.startsWith('#EXTINF:')) {
      const value = Number.parseFloat(line.slice('#EXTINF:'.length));
      pending = Number.isFinite(value) ? value : null;
      continue;
    }
    if (line.startsWith('#')) continue;
    if (pending !== null) {
      segments.push({ uri: line, duration: pending });
      pending = null;
    }
  }
  return segments;
}

export interface KeyTag {
  /** Absolute URI of the key endpoint. */
  uri: string;
  /** 16-byte IV as 32 hex characters. */
  ivHex: string;
}

/** Formats a duration the way ffmpeg does, with six decimals. */
const extinf = (seconds: number): string => seconds.toFixed(6);

/**
 * A VOD media playlist. TARGETDURATION is the longest segment rounded to the nearest integer,
 * which keeps every rounded EXTINF at or below it (RFC 8216 §4.3.3.1).
 */
export function buildMediaPlaylist(segments: readonly SegmentEntry[], key: KeyTag | null = null): string {
  if (segments.length === 0) throw new Error('a media playlist needs at least one segment');
  const target = Math.max(1, ...segments.map((s) => Math.round(s.duration)));
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    `#EXT-X-TARGETDURATION:${target}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-PLAYLIST-TYPE:VOD',
    '#EXT-X-INDEPENDENT-SEGMENTS',
  ];
  if (key) lines.push(`#EXT-X-KEY:METHOD=AES-128,URI="${key.uri}",IV=0x${key.ivHex}`);
  for (const s of segments) lines.push(`#EXTINF:${extinf(s.duration)},`, s.uri);
  lines.push('#EXT-X-ENDLIST');
  return `${lines.join('\n')}\n`;
}

export interface Bandwidth {
  /** Highest segment bitrate in bit/s, rounded up: BANDWIDTH is an upper bound. */
  peak: number;
  /** Total bits over total seconds. */
  average: number;
  segments: number;
}

/** Bandwidth from real segment sizes; segments with no bytes or no duration are skipped. */
export function measureBandwidth(segments: readonly MeasuredSegment[]): Bandwidth | null {
  let totalBytes = 0;
  let totalSeconds = 0;
  let peak = 0;
  let counted = 0;
  for (const s of segments) {
    if (!(s.duration > 0) || !(s.bytes > 0)) continue;
    totalBytes += s.bytes;
    totalSeconds += s.duration;
    peak = Math.max(peak, (s.bytes * 8) / s.duration);
    counted += 1;
  }
  if (counted === 0) return null;
  return { peak: Math.ceil(peak), average: Math.round((totalBytes * 8) / totalSeconds), segments: counted };
}

export interface Variant {
  /** Playlist path relative to the master, for example "720p/index.m3u8". */
  uri: string;
  width: number;
  height: number;
  bandwidth: Bandwidth;
  frameRate: number | null;
  /** RFC 6381 codec string, or null when it could not be read (the attribute is then left out). */
  codecs: string | null;
}

/** Master playlist with variants in ascending bandwidth, as players expect. */
export function buildMasterPlaylist(variants: readonly Variant[]): string {
  if (variants.length === 0) throw new Error('a master playlist needs at least one variant');
  const sorted = [...variants].sort((a, b) => a.bandwidth.peak - b.bandwidth.peak);
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-INDEPENDENT-SEGMENTS'];
  for (const v of sorted) {
    const attrs = [
      `BANDWIDTH=${v.bandwidth.peak}`,
      `AVERAGE-BANDWIDTH=${v.bandwidth.average}`,
      `RESOLUTION=${v.width}x${v.height}`,
      ...(v.frameRate ? [`FRAME-RATE=${v.frameRate.toFixed(3)}`] : []),
      ...(v.codecs ? [`CODECS="${v.codecs}"`] : []),
    ];
    lines.push(`#EXT-X-STREAM-INF:${attrs.join(',')}`, v.uri);
  }
  return `${lines.join('\n')}\n`;
}
