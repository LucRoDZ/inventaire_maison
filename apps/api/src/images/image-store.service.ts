import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';
import { householdImageDir } from '../database/legacy-images';
import { makeThumbnail } from './image.processor';

/** Names are generated here, never taken from a client: 32 hex characters and `.webp`. */
export const IMAGE_FILE_PATTERN = /^[a-f0-9]{32}\.webp$/;

/**
 * Thumbnails on disk, one folder per household (`h<id>/`). Callers check that the product, hence
 * the file, belongs to the household of the request before reading: nothing is served on a name
 * alone.
 */
@Injectable()
export class ImageStore {
  private readonly dir: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.dir = path.resolve(config.IMAGES_DIR);
  }

  private folder(householdId: number): string {
    return householdImageDir(this.dir, householdId);
  }

  /** Makes a thumbnail of the image and stores it for the household; returns the file name. */
  async saveThumbnail(householdId: number, input: Buffer): Promise<string> {
    const data = await makeThumbnail(input);
    const name = `${randomBytes(16).toString('hex')}.webp`;
    await mkdir(this.folder(householdId), { recursive: true });
    await writeFile(path.join(this.folder(householdId), name), data, { flag: 'wx' });
    return name;
  }

  /**
   * Reads a thumbnail of the household. Files of older versions still at the root of IMAGES_DIR
   * (not moved at start) are read there: the caller has already checked the owner in the database.
   */
  async read(householdId: number, name: string): Promise<Buffer | null> {
    if (!IMAGE_FILE_PATTERN.test(name)) return null;
    for (const file of [path.join(this.folder(householdId), name), path.join(this.dir, name)]) {
      try {
        return await readFile(file);
      } catch {
        // Try the next place.
      }
    }
    return null;
  }

  /** Best effort: a file that is already gone is not an error. */
  async remove(householdId: number, name: string | null | undefined): Promise<void> {
    if (!name || !IMAGE_FILE_PATTERN.test(name)) return;
    await unlink(path.join(this.folder(householdId), name)).catch(() => undefined);
  }

  /** Every picture of a household, once the household itself is deleted. */
  async removeHousehold(householdId: number): Promise<void> {
    await rm(this.folder(householdId), { recursive: true, force: true });
  }
}
