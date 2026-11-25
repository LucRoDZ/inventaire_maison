import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@inventaire/shared';
import type { Request } from 'express';
import { ROLES_KEY } from './roles.decorator';

/**
 * Runs after the session guard. Routes without @Roles() are open to any signed-in user. A route
 * reserved to the admin answers 404 to anyone else, like an unknown route: its existence is not
 * revealed.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;
    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user || !roles.includes(user.role)) {
      throw new NotFoundException();
    }
    return true;
  }
}
