import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';
import { StockModule } from '../stock/stock.module';
import { SyncModule } from '../sync/sync.module';
import { HouseholdIds } from './household-ids';
import { PushController } from './push.controller';
import { PushScheduler } from './push.scheduler';
import { PUSH_SENDER, WebPushSender } from './push.sender';
import { PushService } from './push.service';

@Module({
  imports: [ScheduleModule.forRoot(), StockModule, SyncModule],
  controllers: [PushController],
  providers: [
    PushService,
    PushScheduler,
    HouseholdIds,
    {
      provide: PUSH_SENDER,
      useFactory: (config: AppConfig) => new WebPushSender(config),
      inject: [APP_CONFIG],
    },
  ],
})
export class PushModule {}
