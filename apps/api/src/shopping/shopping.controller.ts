import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  QUANTITY_UNITS,
  SHOPPING_LABEL_MAX_LENGTH,
  SHOPPING_QUANTITY_MAX,
  type RecentProductDto,
  type ShoppingClearResponse,
  type ShoppingItemDto,
  type ShoppingListResponse,
  type ShoppingStoreResponse,
} from '@inventaire/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { parseBody, parseId } from '../common/validation';
import { ShoppingService } from './shopping.service';

const quantity = z.number().int().min(1).max(SHOPPING_QUANTITY_MAX);

const createSchema = z
  .object({
    productId: z.number().int().min(1).max(2_147_483_647).nullable().optional(),
    label: z.string().trim().min(1).max(SHOPPING_LABEL_MAX_LENGTH).nullable().optional(),
    quantity: quantity.optional(),
    amount: z.number().positive().max(9_999_999).nullable().optional(),
    unit: z.enum(QUANTITY_UNITS).nullable().optional(),
  })
  .strict()
  // Exactly one of the two: a catalogue product or a free label.
  .refine((v) => (v.productId != null) !== (v.label != null));

const patchSchema = z
  .object({ checked: z.boolean(), quantity })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0);

@Controller('shopping')
export class ShoppingController {
  constructor(@Inject(ShoppingService) private readonly shopping: ShoppingService) {}

  @Get()
  list(): Promise<ShoppingListResponse> {
    return this.shopping.list();
  }

  @Get('recent')
  recent(): Promise<RecentProductDto[]> {
    return this.shopping.recent();
  }

  @Post()
  create(@Body() body: unknown, @Req() req: Request): Promise<ShoppingItemDto> {
    const input = parseBody(
      createSchema,
      body,
      'Ligne invalide : un produit ou un libellé (120 caractères au plus), et une quantité de 1 à 999',
    );
    return this.shopping.create(input, req.user!.id);
  }

  @Post('clear-checked')
  @HttpCode(200)
  clearChecked(): Promise<ShoppingClearResponse> {
    return this.shopping.clearChecked();
  }

  @Post('store-checked')
  @HttpCode(200)
  storeChecked(@Req() req: Request): Promise<ShoppingStoreResponse> {
    return this.shopping.storeChecked(req.user!.id);
  }

  @Patch(':id')
  update(@Param('id') rawId: string, @Body() body: unknown): Promise<ShoppingItemDto> {
    const id = parseId(rawId);
    return this.shopping.update(
      id,
      parseBody(patchSchema, body, 'Ligne invalide : coché ou quantité de 1 à 999'),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') rawId: string): Promise<void> {
    await this.shopping.remove(parseId(rawId));
  }
}
