import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ADJUST_REASONS,
  EXPIRY_FILTERS,
  REMOVAL_REASONS,
  type StockSummaryDto,
  STOCK_SORTS,
  type StockAdjustResponse,
  type MovementHistoryResponse,
  type StockListResponse,
  type StockMoveResponse,
  type StockRemoveResponse,
} from '@inventaire/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { parseBody, parseId } from '../common/validation';
import { MovementHistoryService } from './movement-history.service';
import { StockMoveService } from './stock-move.service';
import { StockRemoveService } from './stock-remove.service';
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

const moveSchema = z
  .object({
    stockItemId: id,
    toLocationId: id,
    toShelfId: id.nullable().optional(),
    quantity: z.number().int().min(1).max(1_000_000),
  })
  .strict();

const removeSchema = z
  .object({ productId: id, reason: z.enum(REMOVAL_REASONS).optional() })
  .strict();

const historySchema = z.object({
  cursor: z.coerce.number().int().min(1).max(2_147_483_647).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const listSchema = z.object({
  location: z.coerce.number().int().min(1).max(2_147_483_647).optional(),
  shelf: z.coerce.number().int().min(1).max(2_147_483_647).optional(),
  category: z.coerce.number().int().min(1).max(2_147_483_647).optional(),
  q: z.string().max(100).optional(),
  sort: z.enum(STOCK_SORTS).default('name'),
  expiry: z.enum(EXPIRY_FILTERS).optional(),
});

@Controller('stock')
export class StockController {
  constructor(
    @Inject(StockService) private readonly stock: StockService,
    @Inject(StockQuery) private readonly query: StockQuery,
    @Inject(StockMoveService) private readonly mover: StockMoveService,
    @Inject(StockRemoveService) private readonly remover: StockRemoveService,
  ) {}

  @Get()
  list(@Query() query: Record<string, unknown>): Promise<StockListResponse> {
    const parsed = listSchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Filtres invalides');
    return this.query.list(parsed.data);
  }

  @Get('summary')
  summary(): Promise<StockSummaryDto> {
    return this.query.summary();
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

  @Post('move')
  @HttpCode(200)
  move(@Body() body: unknown, @Req() req: Request): Promise<StockMoveResponse> {
    const input = parseBody(
      moveSchema,
      body,
      'Déplacement invalide : ligne, destination et quantité (1 au moins) sont requises',
    );
    return this.mover.move(input, req.user!.id);
  }

  @Post('remove')
  @HttpCode(200)
  remove(@Body() body: unknown, @Req() req: Request): Promise<StockRemoveResponse> {
    const input = parseBody(removeSchema, body, 'Retrait invalide : un produit est requis');
    return this.remover.removeOne(input.productId, req.user!.id, input.reason);
  }
}

@Controller('products')
export class MovementsController {
  constructor(@Inject(MovementHistoryService) private readonly history: MovementHistoryService) {}

  @Get(':id/movements')
  list(
    @Param('id') rawId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<MovementHistoryResponse> {
    const productId = parseId(rawId);
    const parsed = historySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Pagination invalide');
    return this.history.list(productId, parsed.data);
  }
}
