import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PUSH_SUMMARY_HOUR, PUSH_SUMMARY_TIME_ZONE } from '@inventaire/shared';
import { PushService } from './push.service';

/** Fires the daily summary at 8:00 Paris time. */
@Injectable()
export class PushScheduler {
  private readonly logger = new Logger(PushScheduler.name);

  constructor(@Inject(PushService) private readonly push: PushService) {}

  @Cron(`0 ${PUSH_SUMMARY_HOUR} * * *`, { timeZone: PUSH_SUMMARY_TIME_ZONE })
  async run(): Promise<void> {
    try {
      await this.push.sendDailySummary();
    } catch (error) {
      this.logger.error(`Résumé quotidien : ${(error as Error).message}`);
    }
  }
}
