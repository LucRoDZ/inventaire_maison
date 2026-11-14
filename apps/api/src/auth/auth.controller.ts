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
import { AuthCookieService } from './auth-cookie.service';
import { AuthService } from './auth.service';
import { TooManyAttemptsException } from './login-throttle.service';
import { Public } from './public.decorator';
import { SessionService } from './session.service';

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
});

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
    let result;
    try {
      result = await this.auth.login(
        parsed.data.username,
        parsed.data.password,
        req.get('user-agent'),
        req.ip ?? 'unknown',
      );
    } catch (error) {
      if (error instanceof TooManyAttemptsException) {
        res.setHeader('Retry-After', String(error.retryAfterSeconds));
      }
      throw error;
    }
    const { user, session } = result;
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
    const { id, username, role } = req.user!;
    return { id, username, role };
  }
}
