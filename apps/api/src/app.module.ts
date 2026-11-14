import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ClockModule } from './common/clock';
import { NotFoundModule } from './common/not-found.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { SeedModule } from './database/seed/seed.module';
import { HealthController } from './health/health.controller';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule,
    ClockModule,
    DatabaseModule,
    SeedModule,
    AuthModule,
    UsersModule,
    NotFoundModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
