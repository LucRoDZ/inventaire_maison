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
  HOUSEHOLD_NAME_MAX_LENGTH,
  OFF_TAG_PATTERN,
  type CategoryDto,
  type HouseholdDto,
  type OffCategoryMapDto,
} from '@inventaire/shared';
import { z } from 'zod';
import { Roles } from '../auth/roles.decorator';
import { CategoriesService } from '../categories/categories.service';
import { parseBody, parseId } from '../common/validation';
import { HouseholdsService } from './households.service';

const householdName = z.string().trim().min(1).max(HOUSEHOLD_NAME_MAX_LENGTH);
const nameSchema = z.object({ name: householdName }).strict();
const deleteSchema = z.object({ confirmName: z.string().max(200) }).strict();

const categoryName = z.string().trim().min(1).max(CATEGORY_NAME_MAX_LENGTH);
const icon = z.enum(CATEGORY_ICONS);
const sortOrder = z.number().int().min(0).max(10_000);
const categoryId = z.number().int().min(1).max(2_147_483_647);
const offTag = z.string().trim().max(100).regex(OFF_TAG_PATTERN);

const categoryCreateSchema = z
  .object({ name: categoryName, icon, sortOrder: sortOrder.optional() })
  .strict();
const categoryPatchSchema = z
  .object({ name: categoryName, icon, sortOrder })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0);
const mapCreateSchema = z.object({ offTag, categoryId }).strict();
const mapPatchSchema = z
  .object({ offTag, categoryId })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0);

const NAME_INVALID = 'Nom de foyer invalide : 1 à 40 caractères';
const CATEGORY_INVALID = 'Catégorie invalide : nom de 1 à 40 caractères et icône de la liste';
const MAP_INVALID = 'Correspondance invalide : tag au format « fr:slug » et catégorie';

/**
 * The admin console (D2, D3): households, and the categories and Open Food Facts mappings of a
 * household chosen explicitly in the path, checked here, never deduced from the admin's account.
 * Every route answers 404 to a member (RolesGuard). It never reads products nor stock.
 */
@Controller('admin/households')
@Roles('admin')
export class HouseholdsController {
  constructor(
    @Inject(HouseholdsService) private readonly households: HouseholdsService,
    @Inject(CategoriesService) private readonly categories: CategoriesService,
  ) {}

  @Get()
  list(): Promise<HouseholdDto[]> {
    return this.households.list();
  }

  @Post()
  async create(@Body() body: unknown): Promise<{ id: number; name: string }> {
    const { name } = parseBody(nameSchema, body, NAME_INVALID);
    const created = await this.households.create(name);
    return { id: created.id, name: created.name };
  }

  @Patch(':id')
  rename(@Param('id') rawId: string, @Body() body: unknown): Promise<{ id: number; name: string }> {
    const id = parseId(rawId);
    return this.households.rename(id, parseBody(nameSchema, body, NAME_INVALID).name);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') rawId: string, @Body() body: unknown): Promise<void> {
    const id = parseId(rawId);
    const { confirmName } = parseBody(deleteSchema, body, 'Retapez le nom du foyer pour confirmer');
    await this.households.remove(id, confirmName);
  }

  // Categories of the chosen household.

  @Get(':id/categories')
  async listCategories(@Param('id') rawId: string): Promise<CategoryDto[]> {
    const id = await this.household(rawId);
    return this.categories.list(id);
  }

  @Post(':id/categories')
  async createCategory(@Param('id') rawId: string, @Body() body: unknown): Promise<CategoryDto> {
    const id = await this.household(rawId);
    return this.categories.create(id, parseBody(categoryCreateSchema, body, CATEGORY_INVALID));
  }

  @Patch(':id/categories/:categoryId')
  async updateCategory(
    @Param('id') rawId: string,
    @Param('categoryId') rawCategoryId: string,
    @Body() body: unknown,
  ): Promise<CategoryDto> {
    const id = await this.household(rawId);
    const target = parseId(rawCategoryId);
    return this.categories.update(
      id,
      target,
      parseBody(categoryPatchSchema, body, CATEGORY_INVALID),
    );
  }

  @Delete(':id/categories/:categoryId')
  @HttpCode(204)
  async removeCategory(
    @Param('id') rawId: string,
    @Param('categoryId') rawCategoryId: string,
  ): Promise<void> {
    const id = await this.household(rawId);
    await this.categories.remove(id, parseId(rawCategoryId));
  }

  // Open Food Facts mappings of the chosen household.

  @Get(':id/off-category-map')
  async listMap(@Param('id') rawId: string): Promise<OffCategoryMapDto[]> {
    return this.categories.listMap(await this.household(rawId));
  }

  @Post(':id/off-category-map')
  async createMap(@Param('id') rawId: string, @Body() body: unknown): Promise<OffCategoryMapDto> {
    const id = await this.household(rawId);
    return this.categories.createMap(id, parseBody(mapCreateSchema, body, MAP_INVALID));
  }

  @Patch(':id/off-category-map/:mapId')
  async updateMap(
    @Param('id') rawId: string,
    @Param('mapId') rawMapId: string,
    @Body() body: unknown,
  ): Promise<OffCategoryMapDto> {
    const id = await this.household(rawId);
    const target = parseId(rawMapId);
    return this.categories.updateMap(id, target, parseBody(mapPatchSchema, body, MAP_INVALID));
  }

  @Delete(':id/off-category-map/:mapId')
  @HttpCode(204)
  async removeMap(@Param('id') rawId: string, @Param('mapId') rawMapId: string): Promise<void> {
    const id = await this.household(rawId);
    await this.categories.removeMap(id, parseId(rawMapId));
  }

  /** The household of the path, checked: 404 when it does not exist. */
  private async household(rawId: string): Promise<number> {
    const id = parseId(rawId);
    await this.households.require(id);
    return id;
  }
}
