import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { ClockModule } from './common/clock';
import { ProductsModule } from './products/products.module';
import { ScanModule } from './scan/scan.module';
import { RateLimitModule } from './common/rate-limit.module';
import { NotFoundModule } from './common/not-found.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { SeedModule } from './database/seed/seed.module';
import { HealthController } from './health/health.controller';
import { ImagesModule } from './images/images.module';
import { LocationsModule } from './locations/locations.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule,
    ClockModule,
    DatabaseModule,
    SeedModule,
    RateLimitModule,
    AuthModule,
    UsersModule,
    LocationsModule,
    CategoriesModule,
    ProductsModule,
    ScanModule,
    ImagesModule,
    NotFoundModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
