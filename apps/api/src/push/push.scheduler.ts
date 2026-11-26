import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PUSH_SUMMARY_HOUR, PUSH_SUMMARY_TIME_ZONE } from '@inventaire/shared';
import { SyncService } from '../sync/sync.service';
import { HouseholdIds } from './household-ids';
import { PushService } from './push.service';

/** Fires the daily summary at 8:00 Paris time, and purges the old sync keys at night. */
@Injectable()
export class PushScheduler {
  private readonly logger = new Logger(PushScheduler.name);

  constructor(
    @Inject(PushService) private readonly push: PushService,
    @Inject(SyncService) private readonly sync: SyncService,
    @Inject(HouseholdIds) private readonly householdIds: HouseholdIds,
  ) {}

  @Cron(`0 ${PUSH_SUMMARY_HOUR} * * *`, { timeZone: PUSH_SUMMARY_TIME_ZONE })
  async run(): Promise<void> {
    try {
      await this.push.sendDailySummary();
    } catch (error) {
      this.logger.error(`Résumé quotidien : ${(error as Error).message}`);
    }
  }

  /** Purges the idempotency keys past their retention, household by household. */
  @Cron('30 3 * * *', { timeZone: PUSH_SUMMARY_TIME_ZONE })
  async purgeKeys(): Promise<number> {
    let purged = 0;
    for (const id of await this.householdIds.all()) {
      try {
        purged += await this.sync.purgeExpired(id);
      } catch (error) {
        this.logger.error(`Purge des clés du foyer ${id} : ${(error as Error).message}`);
      }
    }
    return purged;
  }
}
