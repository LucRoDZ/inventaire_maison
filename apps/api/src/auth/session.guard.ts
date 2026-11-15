import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SESSION_COOKIE_NAME } from '@inventaire/shared';
import type { Request, Response } from 'express';
import { UNAUTHENTICATED_MESSAGE } from './auth.constants';
import { AuthCookieService } from './auth-cookie.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SessionService } from './session.service';

/** Global guard: every route needs a valid session unless marked @Public(). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuthCookieService) private readonly cookies: AuthCookieService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const token = (req.cookies as Record<string, unknown> | undefined)?.[SESSION_COOKIE_NAME];
    if (typeof token !== 'string' || token === '') {
      throw new UnauthorizedException(UNAUTHENTICATED_MESSAGE);
    }

    const session = await this.sessions.validate(token);
    if (!session) {
      this.cookies.clear(res);
      throw new UnauthorizedException(UNAUTHENTICATED_MESSAGE);
    }
    if (session.refreshedExpiresAt) this.cookies.set(res, token, session.refreshedExpiresAt);
    req.user = session.user;
    return true;
  }
}
