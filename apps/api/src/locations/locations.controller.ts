import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  LOCATION_KINDS,
  MAX_SHELVES_PER_LOCATION,
  PLACE_NAME_MAX_LENGTH,
  SHELF_KINDS,
  type LocationDto,
  type ShelfDto,
} from '@inventaire/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { parseBody, parseId } from '../common/validation';
import { LocationsService } from './locations.service';

const name = z.string().trim().min(1).max(PLACE_NAME_MAX_LENGTH);
const sortOrder = z.number().int().min(0).max(10_000);
// Lucide icon names are kebab-case.
const icon = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .max(40);
const id = z.number().int().min(1).max(2_147_483_647);

const locationCreateSchema = z
  .object({
    name,
    kind: z.enum(LOCATION_KINDS),
    shelfCount: z.number().int().min(1).max(MAX_SHELVES_PER_LOCATION).optional(),
  })
  .strict();

const deleteQuerySchema = z
  .object({
    moveStockTo: z
      .string()
      .regex(/^\d{1,10}$/)
      .optional(),
  })
  .strict();

const locationPatchSchema = z
  .object({ name, icon, sortOrder })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0);

const shelfCreateSchema = z
  .object({ locationId: id, name, kind: z.enum(SHELF_KINDS), sortOrder: sortOrder.optional() })
  .strict();

const shelfPatchSchema = z
  .object({ locationId: id, name, kind: z.enum(SHELF_KINDS), sortOrder })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0);

/**
 * Furniture of the household of the request, for every account (decision C7 reversed): each member
 * creates, renames, reorders and deletes the furniture of its household.
 */
@Controller('locations')
export class LocationsController {
  constructor(@Inject(LocationsService) private readonly locations: LocationsService) {}

  @Get()
  list(): Promise<LocationDto[]> {
    return this.locations.list();
  }

  @Post()
  create(@Body() body: unknown): Promise<LocationDto> {
    return this.locations.createLocation(
      parseBody(
        locationCreateSchema,
        body,
        `Meuble invalide : nom de 1 à 40 caractères, type de la liste et 1 à ${MAX_SHELVES_PER_LOCATION} étagères`,
      ),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id') rawId: string,
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<void> {
    const id = parseId(rawId);
    const parsed = deleteQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Meuble de destination invalide');
    const target =
      parsed.data.moveStockTo === undefined ? undefined : parseId(parsed.data.moveStockTo);
    await this.locations.deleteLocation(id, target, req.user!.id);
  }

  @Patch(':id')
  update(@Param('id') rawId: string, @Body() body: unknown): Promise<LocationDto> {
    const locationId = parseId(rawId);
    return this.locations.updateLocation(
      locationId,
      parseBody(locationPatchSchema, body, 'Lieu invalide : nom de 1 à 40 caractères'),
    );
  }
}

/** Shelves of the furniture of the household, for every account (decision P.B1, à confirmer). */
@Controller('shelves')
export class ShelvesController {
  constructor(@Inject(LocationsService) private readonly locations: LocationsService) {}

  @Post()
  create(@Body() body: unknown): Promise<ShelfDto> {
    return this.locations.createShelf(
      parseBody(shelfCreateSchema, body, 'Étagère invalide : nom de 1 à 40 caractères'),
    );
  }

  @Patch(':id')
  update(@Param('id') rawId: string, @Body() body: unknown): Promise<ShelfDto> {
    const shelfId = parseId(rawId);
    return this.locations.updateShelf(
      shelfId,
      parseBody(shelfPatchSchema, body, 'Étagère invalide : nom de 1 à 40 caractères'),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') rawId: string, @Req() req: Request): Promise<void> {
    await this.locations.deleteShelf(parseId(rawId), req.user!.id);
  }
}
