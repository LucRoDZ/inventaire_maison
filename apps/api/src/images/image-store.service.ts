import { randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';
import { makeThumbnail } from './image.processor';

/** Names are generated here, never taken from a client: 32 hex characters and `.webp`. */
export const IMAGE_FILE_PATTERN = /^[a-f0-9]{32}\.webp$/;

@Injectable()
export class ImageStore {
  private readonly dir: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.dir = path.resolve(config.IMAGES_DIR);
  }

  /** Makes a thumbnail of the image and stores it; returns the generated file name. */
  async saveThumbnail(input: Buffer): Promise<string> {
    const data = await makeThumbnail(input);
    const name = `${randomBytes(16).toString('hex')}.webp`;
    await mkdir(this.dir, { recursive: true });
    await writeFile(path.join(this.dir, name), data, { flag: 'wx' });
    return name;
  }

  async read(name: string): Promise<Buffer | null> {
    if (!IMAGE_FILE_PATTERN.test(name)) return null;
    try {
      return await readFile(path.join(this.dir, name));
    } catch {
      return null;
    }
  }

  /** Best effort: a file that is already gone is not an error. */
  async remove(name: string | null | undefined): Promise<void> {
    if (!name || !IMAGE_FILE_PATTERN.test(name)) return;
    await unlink(path.join(this.dir, name)).catch(() => undefined);
  }
}
