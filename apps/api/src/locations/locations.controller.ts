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
  PLACE_NAME_MAX_LENGTH,
  SHELF_KINDS,
  type LocationDto,
  type ShelfDto,
} from '@inventaire/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { Roles } from '../auth/roles.decorator';
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

@Controller('locations')
export class LocationsController {
  constructor(@Inject(LocationsService) private readonly locations: LocationsService) {}

  @Get()
  list(): Promise<LocationDto[]> {
    return this.locations.list();
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') rawId: string, @Body() body: unknown): Promise<LocationDto> {
    const locationId = parseId(rawId);
    return this.locations.updateLocation(
      locationId,
      parseBody(locationPatchSchema, body, 'Lieu invalide : nom de 1 à 40 caractères'),
    );
  }
}

@Controller('shelves')
export class ShelvesController {
  constructor(@Inject(LocationsService) private readonly locations: LocationsService) {}

  @Post()
  @Roles('admin')
  create(@Body() body: unknown): Promise<ShelfDto> {
    return this.locations.createShelf(
      parseBody(shelfCreateSchema, body, 'Étagère invalide : nom de 1 à 40 caractères'),
    );
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') rawId: string, @Body() body: unknown): Promise<ShelfDto> {
    const shelfId = parseId(rawId);
    return this.locations.updateShelf(
      shelfId,
      parseBody(shelfPatchSchema, body, 'Étagère invalide : nom de 1 à 40 caractères'),
    );
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(204)
  async remove(@Param('id') rawId: string, @Req() req: Request): Promise<void> {
    await this.locations.deleteShelf(parseId(rawId), req.user!.id);
  }
}
