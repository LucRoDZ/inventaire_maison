import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** CSRF protection: state-changing requests must come from the public origin. */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowedOrigin: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.allowedOrigin = new URL(config.PUBLIC_ORIGIN).origin;
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (!UNSAFE_METHODS.has(req.method)) return true;
    if (req.get('origin') !== this.allowedOrigin) {
      throw new ForbiddenException('Origine non autorisée');
    }
    return true;
  }
}
