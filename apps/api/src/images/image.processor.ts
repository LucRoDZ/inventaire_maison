import sharp from 'sharp';

export const THUMBNAIL_WIDTH = 400;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
/** Refuses decompression bombs: a small file that expands to a huge bitmap. */
const MAX_INPUT_PIXELS = 50_000_000;

export class UnsupportedImageError extends Error {}

/** True when the first bytes are those of a JPEG, a PNG or a WebP file (the MIME type is never trusted). */
export function hasImageSignature(buf: Buffer): boolean {
  const jpeg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const png =
    buf.length > 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp =
    buf.length > 12 &&
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP';
  return jpeg || png || webp;
}

/**
 * Re-encodes any accepted image as a WebP of 400 px width (never enlarged). The orientation is
 * applied first, then every metadata block (EXIF, GPS...) is dropped, which sharp does by default.
 */
export async function makeThumbnail(input: Buffer): Promise<Buffer> {
  if (!hasImageSignature(input)) throw new UnsupportedImageError('signature');
  try {
    return await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new UnsupportedImageError('decode');
  }
}
