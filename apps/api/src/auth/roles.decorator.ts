import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@inventaire/shared';

export const ROLES_KEY = 'roles';
/** Restricts a route (or controller) to the given roles. */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
