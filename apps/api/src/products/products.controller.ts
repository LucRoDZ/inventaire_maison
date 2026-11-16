import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  PRODUCT_NAME_MAX_LENGTH,
  PRODUCT_TEXT_MAX_LENGTH,
  type ProductDetailDto,
  type ProductDto,
} from '@inventaire/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { parseBody, parseId } from '../common/validation';
import { ProductsService } from './products.service';

const id = z.number().int().min(1).max(2_147_483_647);
const name = z.string().trim().min(1).max(PRODUCT_NAME_MAX_LENGTH);
/** Optional free text: blank means "none". */
const text = z
  .string()
  .trim()
  .max(PRODUCT_TEXT_MAX_LENGTH)
  .nullable()
  .transform((value) => (value ? value : null));

const createSchema = z
  .object({
    name,
    categoryId: id,
    brand: text.optional(),
    sizeLabel: text.optional(),
    defaultLocationId: id.nullable().optional(),
    barcode: z.string().max(40).nullable().optional(),
    barcodeFormat: z.enum(['ean_13', 'ean_8', 'upc_a', 'upc_e']).optional(),
  })
  .strict();

const patchSchema = z
  .object({ name, brand: text, categoryId: id, defaultLocationId: id.nullable() })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0);

const searchSchema = z.object({
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

@Controller('products')
export class ProductsController {
  constructor(@Inject(ProductsService) private readonly products: ProductsService) {}

  @Get()
  search(@Query() query: Record<string, unknown>): Promise<ProductDto[]> {
    const parsed = searchSchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Recherche invalide');
    return this.products.search({
      q: parsed.data.q,
      limit: parsed.data.limit,
    });
  }

  @Get(':id')
  get(@Param('id') rawId: string): Promise<ProductDetailDto> {
    return this.products.get(parseId(rawId));
  }

  @Post()
  create(@Body() body: unknown, @Req() req: Request): Promise<ProductDto> {
    const input = parseBody(
      createSchema,
      body,
      'Produit invalide : un nom (120 caractères au plus) et une catégorie sont requis',
    );
    return this.products.create(input, req.user!.id);
  }

  @Patch(':id')
  update(@Param('id') rawId: string, @Body() body: unknown): Promise<ProductDto> {
    const productId = parseId(rawId);
    return this.products.update(
      productId,
      parseBody(patchSchema, body, 'Produit invalide : nom, marque, catégorie ou lieu habituel'),
    );
  }
}
