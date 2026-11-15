import { Inject, Injectable } from '@nestjs/common';
import { SESSION_COOKIE_NAME } from '@inventaire/shared';
import type { Response } from 'express';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';

@Injectable()
export class AuthCookieService {
  private readonly secure: boolean;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.secure = config.PUBLIC_ORIGIN.startsWith('https://');
  }

  set(res: Response, token: string, expiresAt: Date): void {
    res.cookie(SESSION_COOKIE_NAME, token, { ...this.baseOptions(), expires: expiresAt });
  }

  clear(res: Response): void {
    res.clearCookie(SESSION_COOKIE_NAME, this.baseOptions());
  }

  private baseOptions() {
    return { httpOnly: true, secure: this.secure, sameSite: 'lax' as const, path: '/' };
  }
}
