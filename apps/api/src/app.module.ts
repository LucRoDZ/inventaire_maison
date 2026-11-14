import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { SeedModule } from './database/seed/seed.module';
import { HealthController } from './health/health.controller';

@Module({ imports: [ConfigModule, DatabaseModule, SeedModule], controllers: [HealthController] })
export class AppModule {}
