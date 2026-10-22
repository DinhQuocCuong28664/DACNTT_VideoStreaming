/**
 * Getting a chosen picture into a format the server accepts for avatars.
 *
 * The server screens avatars with Amazon Rekognition, which reads JPEG and
 * PNG only, so it no longer accepts WebP. People still pick WebP files, so
 * the browser redraws them as PNG (keeping any transparency) before the
 * upload, scaled down to at most MAX_SIDE pixels so that a large photo still
 * fits under the size limit once it is lossless.
 */
export const SERVER_AVATAR_TYPES = ['image/jpeg', 'image/png'];
export const PICKABLE_AVATAR_TYPES = [...SERVER_AVATAR_TYPES, 'image/webp'];
const MAX_SIDE = 1024;

/** Width and height that fit inside MAX_SIDE, never enlarged. */
export const fitWithin = (width, height, maxSide = MAX_SIDE) => {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
};

/** The file name with its extension replaced by `.png`. */
export const pngName = (name) => `${(name || 'avatar').replace(/\.[^./\\]+$/, '')}.png`;

/**
 * Returns a file the server accepts: the same file for JPEG and PNG, a PNG
 * redraw for WebP. Throws for any other type.
 */
export const prepareAvatarFile = async (file) => {
  if (SERVER_AVATAR_TYPES.includes(file.type)) return file;
  if (file.type !== 'image/webp') throw new Error(`Unsupported avatar type: ${file.type}`);

  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('Could not encode PNG'))), 'image/png');
    });
    return new File([blob], pngName(file.name), { type: 'image/png' });
  } finally {
    bitmap.close?.();
  }
};
