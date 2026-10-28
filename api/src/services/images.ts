/**
 * User images (avatar, banner, custom thumbnail). The browser uploads to the raw bucket under
 * images/{userId}/{uploadId} with a presigned POST; the API then checks the bytes, screens them
 * with Rekognition (fail closed: no verdict, no image) and copies them to the processed bucket.
 */
import { DetectModerationLabelsCommand, RekognitionClient } from '@aws-sdk/client-rekognition';
import { screenImage } from '@zelos/shared';
import { HttpError } from '../http/errors.js';

export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
/** Rekognition reads JPEG and PNG only. */
export const IMAGE_TYPES = ['image/jpeg', 'image/png'] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

export type ImageScreener = (bytes: Buffer) => Promise<{ allowed: boolean; labels: string[] }>;

export function rekognitionScreener(client = new RekognitionClient({ maxAttempts: 3 })): ImageScreener {
  return async (bytes) => {
    let out;
    try {
      out = await client.send(new DetectModerationLabelsCommand({ Image: { Bytes: bytes }, MinConfidence: 50 }));
    } catch {
      throw new HttpError(503, 'SCREENING_UNAVAILABLE', 'Images cannot be checked right now; try again later');
    }
    return screenImage({ labels: out.ModerationLabels ?? [], contentTypes: out.ContentTypes ?? [] });
  };
}

/** The real type from the first bytes, whatever the upload claimed. */
export function sniffImage(bytes: Buffer): { type: ImageType; ext: 'jpg' | 'png' } | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { type: 'image/png', ext: 'png' };
  return null;
}

export const imageUploadKey = (userId: string, uploadId: string) => `images/${userId}/${uploadId}`;
