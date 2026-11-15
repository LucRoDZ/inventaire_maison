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
} from '@nestjs/common';
import {
  CATEGORY_ICONS,
  CATEGORY_NAME_MAX_LENGTH,
  OFF_TAG_PATTERN,
  type CategoryDto,
  type OffCategoryMapDto,
} from '@inventaire/shared';
import { z } from 'zod';
import { Roles } from '../auth/roles.decorator';
import { parseBody, parseId } from '../common/validation';
import { CategoriesService } from './categories.service';

const name = z.string().trim().min(1).max(CATEGORY_NAME_MAX_LENGTH);
const icon = z.enum(CATEGORY_ICONS);
const sortOrder = z.number().int().min(0).max(10_000);
const categoryId = z.number().int().min(1).max(2_147_483_647);
const offTag = z.string().trim().max(100).regex(OFF_TAG_PATTERN);

const categoryCreateSchema = z.object({ name, icon, sortOrder: sortOrder.optional() }).strict();
const categoryPatchSchema = z
  .object({ name, icon, sortOrder })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0);
const mapCreateSchema = z.object({ offTag, categoryId }).strict();
const mapPatchSchema = z
  .object({ offTag, categoryId })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0);

const CATEGORY_INVALID = 'Catégorie invalide : nom de 1 à 40 caractères et icône de la liste';
const MAP_INVALID = 'Correspondance invalide : tag au format « fr:slug » et catégorie';

@Controller('categories')
export class CategoriesController {
  constructor(@Inject(CategoriesService) private readonly categories: CategoriesService) {}

  @Get()
  list(): Promise<CategoryDto[]> {
    return this.categories.list();
  }

  @Post()
  @Roles('admin')
  create(@Body() body: unknown): Promise<CategoryDto> {
    return this.categories.create(parseBody(categoryCreateSchema, body, CATEGORY_INVALID));
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') rawId: string, @Body() body: unknown): Promise<CategoryDto> {
    const id = parseId(rawId);
    return this.categories.update(id, parseBody(categoryPatchSchema, body, CATEGORY_INVALID));
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(204)
  async remove(@Param('id') rawId: string): Promise<void> {
    await this.categories.remove(parseId(rawId));
  }
}

/** The mapping table is an administration tool: members never need it. */
@Controller('off-category-map')
@Roles('admin')
export class OffCategoryMapController {
  constructor(@Inject(CategoriesService) private readonly categories: CategoriesService) {}

  @Get()
  list(): Promise<OffCategoryMapDto[]> {
    return this.categories.listMap();
  }

  @Post()
  create(@Body() body: unknown): Promise<OffCategoryMapDto> {
    return this.categories.createMap(parseBody(mapCreateSchema, body, MAP_INVALID));
  }

  @Patch(':id')
  update(@Param('id') rawId: string, @Body() body: unknown): Promise<OffCategoryMapDto> {
    const id = parseId(rawId);
    return this.categories.updateMap(id, parseBody(mapPatchSchema, body, MAP_INVALID));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') rawId: string): Promise<void> {
    await this.categories.removeMap(parseId(rawId));
  }
}
