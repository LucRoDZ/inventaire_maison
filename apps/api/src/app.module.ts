import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { ClockModule } from './common/clock';
import { HouseholdScopeMiddleware } from './common/household-context';
import { PushModule } from './push/push.module';
import { ProductsModule } from './products/products.module';
import { ScanModule } from './scan/scan.module';
import { ShoppingModule } from './shopping/shopping.module';
import { StockModule } from './stock/stock.module';
import { SyncModule } from './sync/sync.module';
import { RateLimitModule } from './common/rate-limit.module';
import { NotFoundModule } from './common/not-found.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { HomeModule } from './home/home.module';
import { HouseholdsModule } from './households/households.module';
import { ImagesModule } from './images/images.module';
import { LocationsModule } from './locations/locations.module';
import { SettingsModule } from './settings/settings.module';
import { StatsModule } from './stats/stats.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule,
    ClockModule,
    DatabaseModule,
    RateLimitModule,
    AuthModule,
    HouseholdsModule,
    UsersModule,
    LocationsModule,
    CategoriesModule,
    ProductsModule,
    ScanModule,
    StockModule,
    SyncModule,
    ShoppingModule,
    HomeModule,
    ImagesModule,
    SettingsModule,
    StatsModule,
    PushModule,
    NotFoundModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HouseholdScopeMiddleware).forRoutes('{*path}');
  }
}
