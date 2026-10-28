/**
 * RFC 6381 codec strings for the master playlist, read from the first segment itself rather
 * than guessed from settings: `avc1.PPCCLL` comes from the H.264 sequence parameter set (SPS).
 */
import { createDecipheriv } from 'node:crypto';

/** The pipeline always encodes AAC-LC audio. */
export const AAC_LC = 'mp4a.40.2';

const NAL_SPS = 7;

/**
 * Finds the first SPS NAL unit (start code 00 00 01 or 00 00 00 01) and returns
 * `avc1.` + profile_idc, constraint flags and level_idc as six lower-case hex digits.
 * Returns null when there is no complete SPS header in the bytes.
 */
export function avcCodecFromBytes(bytes: Uint8Array): string | null {
  for (let i = 0; i + 3 < bytes.length; i += 1) {
    if (bytes.at(i) !== 0 || bytes.at(i + 1) !== 0) continue;
    let nal: number;
    if (bytes.at(i + 2) === 1) nal = i + 3;
    else if (bytes.at(i + 2) === 0 && bytes.at(i + 3) === 1) nal = i + 4;
    else continue;

    const header = bytes.at(nal);
    if (header === undefined || (header & 0x1f) !== NAL_SPS) continue;
    const triplet = [bytes.at(nal + 1), bytes.at(nal + 2), bytes.at(nal + 3)];
    if (triplet.some((b) => b === undefined)) return null;
    return `avc1.${triplet.map((b) => b!.toString(16).padStart(2, '0')).join('')}`;
  }
  return null;
}

/**
 * Decrypts the leading whole AES-128-CBC blocks of an encrypted segment. CBC lets a prefix be
 * decrypted on its own, so only the first few kilobytes need to be downloaded.
 */
export function decryptPrefix(encrypted: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  if (key.length !== 16 || iv.length !== 16) throw new Error('AES-128 needs a 16-byte key and IV');
  const whole = encrypted.subarray(0, encrypted.length - (encrypted.length % 16));
  const decipher = createDecipheriv('aes-128-cbc', key, iv);
  decipher.setAutoPadding(false);
  return new Uint8Array(Buffer.concat([decipher.update(whole), decipher.final()]));
}

/** Codec string of a rendition: video from the SPS, plus AAC-LC when the video has sound. */
export function codecsFor(segmentPrefix: Uint8Array, hasAudio: boolean): string | null {
  const video = avcCodecFromBytes(segmentPrefix);
  if (!video) return null;
  return hasAudio ? `${video},${AAC_LC}` : video;
}
