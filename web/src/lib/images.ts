import { studio } from '../api/endpoints';
import { uploadWithPost } from './upload';

export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png'] as const;

export class ImageRejected extends Error {
  constructor(readonly reason: 'type' | 'size') { super(reason); }
}

/**
 * Uploads an avatar, banner or thumbnail candidate: JPEG or PNG up to 2 MB (what Rekognition
 * reads) goes to S3 with a presigned POST; the returned id is then passed to the endpoint that
 * screens and publishes it.
 */
export async function uploadImage(file: File): Promise<string> {
  const type = TYPES.find((x) => x === file.type);
  if (!type) throw new ImageRejected('type');
  if (file.size > IMAGE_MAX_BYTES) throw new ImageRejected('size');
  const grant = await studio.imageUpload(type, file.size);
  await uploadWithPost(grant.upload, file, () => undefined);
  return grant.uploadId;
}
