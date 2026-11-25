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
  HOUSEHOLD_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_PATTERN,
  type UserDto,
} from '@inventaire/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { Roles } from '../auth/roles.decorator';
import { parseBody, parseId } from '../common/validation';
import { UsersService } from './users.service';

const password = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);
const role = z.enum(['admin', 'member']);
// The pseudo is compared and stored in lowercase.
const username = z
  .string()
  .trim()
  .toLowerCase()
  .refine((value) => USERNAME_PATTERN.test(value));

const householdId = z.number().int().min(1).max(2_147_483_647);
const householdName = z.string().trim().min(1).max(HOUSEHOLD_NAME_MAX_LENGTH);

// The household is mandatory: an existing one, or a new one created with the account.
const createSchema = z.union([
  z.object({ username, password, role: role.default('member'), householdId }).strict(),
  z
    .object({ username, password, role: role.default('member'), newHouseholdName: householdName })
    .strict(),
]);

const patchSchema = z
  .object({ role, password, disabled: z.literal(false), householdId })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0);

const CREATE_ERROR = `Compte invalide : pseudo de 3 à 30 caractères (a-z, 0-9, _ . -), mot de passe de ${PASSWORD_MIN_LENGTH} à ${PASSWORD_MAX_LENGTH} caractères et un foyer`;

/** Account administration: the whole controller is reserved to the admin (404 for a member). */
@Controller('users')
@Roles('admin')
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get()
  list(): Promise<UserDto[]> {
    return this.users.list();
  }

  @Post()
  create(@Body() body: unknown): Promise<UserDto> {
    return this.users.create(parseBody(createSchema, body, CREATE_ERROR));
  }

  @Patch(':id')
  update(@Req() req: Request, @Param('id') rawId: string, @Body() body: unknown): Promise<UserDto> {
    const id = parseId(rawId);
    return this.users.update(
      req.user!.id,
      id,
      parseBody(
        patchSchema,
        body,
        'Modification invalide : rôle, mot de passe, réactivation ou foyer',
      ),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  async deactivate(@Req() req: Request, @Param('id') rawId: string): Promise<void> {
    await this.users.deactivate(req.user!.id, parseId(rawId));
  }
}
