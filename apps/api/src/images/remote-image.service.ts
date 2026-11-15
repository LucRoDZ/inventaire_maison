import { Injectable, Logger } from '@nestjs/common';
import { ImageStore } from './image-store.service';
import { MAX_UPLOAD_BYTES } from './image.processor';

export const REMOTE_IMAGE_TIMEOUT_MS = 4000;
const ALLOWED_HOST_SUFFIX = '.openfoodfacts.org';

/** HTTPS only, and only a host that ends with `.openfoodfacts.org`. */
export function isAllowedImageUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname.toLowerCase().endsWith(ALLOWED_HOST_SUFFIX);
  } catch {
    return false;
  }
}

async function readLimited(response: Response, limit: number): Promise<Buffer | null> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!response.body) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > limit) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

@Injectable()
export class RemoteImageService {
  private readonly logger = new Logger(RemoteImageService.name);

  constructor(private readonly store: ImageStore) {}

  /**
   * Downloads a remote picture and stores its thumbnail. Returns the stored file name, or null on
   * any failure (the product then simply has no image). Never throws.
   */
  async download(url: string | null | undefined): Promise<string | null> {
    if (!url || !isAllowedImageUrl(url)) return null;
    try {
      const response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(REMOTE_IMAGE_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const data = await readLimited(response, MAX_UPLOAD_BYTES);
      if (!data) return null;
      return await this.store.saveThumbnail(data);
    } catch (error) {
      this.logger.warn(`Image distante ignorée : ${(error as Error).name}`);
      return null;
    }
  }
}
