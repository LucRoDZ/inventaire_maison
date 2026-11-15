import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';
import { mapOffProduct, type OffProduct } from './off.mapper';

export const OFF_TIMEOUT_MS = 4000;
const DEFAULT_BASE_URL = 'https://world.openfoodfacts.org';

export type OffResult =
  { status: 'found'; product: OffProduct } | { status: 'not_found' } | { status: 'unavailable' };

@Injectable()
export class OffClient {
  private readonly logger = new Logger(OffClient.name);
  private readonly baseUrl: string;
  private readonly userAgent: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    // `parseEnv` already drops OFF_BASE_URL in production.
    this.baseUrl = (config.OFF_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.userAgent = config.OFF_USER_AGENT;
  }

  /** Never throws: every failure becomes `unavailable`. `code` must be a normalized barcode. */
  async fetchProduct(code: string): Promise<OffResult> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/v2/product/${encodeURIComponent(code)}.json`,
        {
          headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
          signal: AbortSignal.timeout(OFF_TIMEOUT_MS),
        },
      );
      if (response.status === 404) return { status: 'not_found' };
      if (!response.ok) return { status: 'unavailable' };
      const body: unknown = await response.json();
      if (typeof body !== 'object' || body === null) return { status: 'unavailable' };
      const { status, product } = body as { status?: unknown; product?: unknown };
      if (status === 0 || status === 'failure') return { status: 'not_found' };
      const mapped = mapOffProduct(product);
      return mapped ? { status: 'found', product: mapped } : { status: 'unavailable' };
    } catch (error) {
      this.logger.warn(`Open Food Facts indisponible : ${(error as Error).name}`);
      return { status: 'unavailable' };
    }
  }
}
