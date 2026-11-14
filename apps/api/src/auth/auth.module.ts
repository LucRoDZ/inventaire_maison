import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthCookieService } from './auth-cookie.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginThrottleService } from './login-throttle.service';
import { PasswordService } from './password.service';
import { SessionGuard } from './session.guard';
import { SessionService } from './session.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthCookieService,
    LoginThrottleService,
    PasswordService,
    SessionService,
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [PasswordService, SessionService, AuthCookieService],
})
export class AuthModule {}
