import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { ADJUST_REASONS, type StockAdjustResponse } from '@inventaire/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { parseBody } from '../common/validation';
import { StockService } from './stock.service';

const id = z.number().int().min(1).max(2_147_483_647);
/** `YYYY-MM-DD` that is a real calendar date. */
const date = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
});
const quantity = z.number().int().min(-1_000_000).max(1_000_000);

const adjustSchema = z
  .object({
    productId: id,
    locationId: id,
    shelfId: id.nullable().optional(),
    expiryDate: date.nullable().optional(),
    delta: quantity,
    reason: z.enum(ADJUST_REASONS),
  })
  .strict();

@Controller('stock')
export class StockController {
  constructor(@Inject(StockService) private readonly stock: StockService) {}

  @Post('adjust')
  @HttpCode(200)
  adjust(@Body() body: unknown, @Req() req: Request): Promise<StockAdjustResponse> {
    const input = parseBody(
      adjustSchema,
      body,
      'Ajustement invalide : produit, lieu, quantité non nulle, raison et date valides sont requis',
    );
    return this.stock.adjust(input, req.user!.id);
  }
}
