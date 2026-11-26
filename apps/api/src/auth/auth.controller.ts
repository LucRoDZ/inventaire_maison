import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { AuthUser } from '@inventaire/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@inventaire/shared';
import { AuthCookieService } from './auth-cookie.service';
import { AuthService } from './auth.service';
import { TooManyAttemptsException } from './login-throttle.service';
import { Public } from './public.decorator';
import { SessionService } from './session.service';

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});

/** Runs an action and adds Retry-After when the login throttle answers 429. */
async function withRetryAfter<T>(res: Response, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof TooManyAttemptsException) {
      res.setHeader('Retry-After', String(error.retryAfterSeconds));
    }
    throw error;
  }
}

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuthCookieService) private readonly cookies: AuthCookieService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUser> {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Pseudo et mot de passe requis');
    const { user, session } = await withRetryAfter(res, () =>
      this.auth.login(
        parsed.data.username,
        parsed.data.password,
        req.get('user-agent'),
        req.ip ?? 'unknown',
      ),
    );
    this.cookies.set(res, session.token, session.expiresAt);
    return user;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    if (req.user) await this.sessions.delete(req.user.sessionId);
    this.cookies.clear(res);
  }

  @Get('me')
  me(@Req() req: Request): AuthUser {
    const { id, username, role, householdId } = req.user!;
    return { id, username, role, dataScope: this.sessions.dataScope(id, householdId) };
  }

  @Post('password')
  @HttpCode(204)
  async changePassword(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const parsed = passwordSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        `Le nouveau mot de passe doit faire entre ${PASSWORD_MIN_LENGTH} et ${PASSWORD_MAX_LENGTH} caractères`,
      );
    }
    await withRetryAfter(res, () =>
      this.auth.changePassword(
        req.user!,
        req.ip ?? 'unknown',
        parsed.data.currentPassword,
        parsed.data.newPassword,
      ),
    );
  }
}
