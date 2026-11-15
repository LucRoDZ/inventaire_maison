import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ADJUST_REASONS,
  STOCK_SORTS,
  type StockAdjustResponse,
  type StockListResponse,
} from '@inventaire/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { parseBody } from '../common/validation';
import { StockQuery } from './stock.query';
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

const listSchema = z.object({
  location: z.coerce.number().int().min(1).max(2_147_483_647).optional(),
  shelf: z.coerce.number().int().min(1).max(2_147_483_647).optional(),
  category: z.coerce.number().int().min(1).max(2_147_483_647).optional(),
  q: z.string().max(100).optional(),
  sort: z.enum(STOCK_SORTS).default('name'),
});

@Controller('stock')
export class StockController {
  constructor(
    @Inject(StockService) private readonly stock: StockService,
    @Inject(StockQuery) private readonly query: StockQuery,
  ) {}

  @Get()
  list(@Query() query: Record<string, unknown>): Promise<StockListResponse> {
    const parsed = listSchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Filtres invalides');
    return this.query.list(parsed.data);
  }

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
