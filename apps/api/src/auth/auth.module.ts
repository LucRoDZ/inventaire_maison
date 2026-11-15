import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthCookieService } from './auth-cookie.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginThrottleService } from './login-throttle.service';
import { OriginGuard } from './origin.guard';
import { PasswordService } from './password.service';
import { RolesGuard } from './roles.guard';
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
    // Order matters: origin, then session, then role.
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [PasswordService, SessionService, AuthCookieService],
})
export class AuthModule {}
