import { Body, Controller, Get, HttpCode, Inject, Post, Req } from '@nestjs/common';
import {
  REMOVAL_REASONS,
  SYNC_KEY_MAX_LENGTH,
  SYNC_KEY_MIN_LENGTH,
  SYNC_MAX_OPS,
  type CatalogCacheEntry,
  type SyncRequest,
  type SyncResponse,
} from '@inventaire/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { parseBody } from '../common/validation';
import { SyncService } from './sync.service';

const id = z.number().int().min(1).max(2_147_483_647);
const date = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
});
const key = z.string().min(SYNC_KEY_MIN_LENGTH).max(SYNC_KEY_MAX_LENGTH);
const quantity = z.number().int().min(1).max(1_000_000);
const common = {
  key,
  deviceId: key,
  createdAt: z.string().datetime({ offset: true }),
  productId: id,
  quantity,
};

const opSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('add'),
      ...common,
      locationId: id.optional(),
      shelfId: id.nullable().optional(),
      expiryDate: date.nullable().optional(),
    })
    .strict(),
  z
    .object({ kind: z.literal('remove'), ...common, reason: z.enum(REMOVAL_REASONS).optional() })
    .strict(),
  z.object({ kind: z.literal('shop'), ...common }).strict(),
]);

const requestSchema = z.object({ ops: z.array(opSchema).max(SYNC_MAX_OPS) }).strict();

@Controller('sync')
export class SyncController {
  constructor(@Inject(SyncService) private readonly sync: SyncService) {}

  @Post()
  @HttpCode(200)
  async apply(@Body() body: unknown, @Req() req: Request): Promise<SyncResponse> {
    const input = parseBody(
      requestSchema,
      body,
      `Synchronisation invalide : ${SYNC_MAX_OPS} opérations au plus, chacune avec sa clé`,
    ) as SyncRequest;
    return { results: await this.sync.apply(input.ops, req.user!.id) };
  }

  @Get('catalog')
  catalog(): Promise<CatalogCacheEntry[]> {
    return this.sync.catalog();
  }
}
