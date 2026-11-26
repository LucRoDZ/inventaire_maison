import { Inject, Injectable } from '@nestjs/common';
import { EXPIRY_SOON_DAYS, type SettingsDto, type SettingsPatchInput } from '@inventaire/shared';
import { eq, sql } from 'drizzle-orm';
import type { Transaction } from '../database/database.module';
import { settings } from '../database/schema';
import { TenantDb } from '../database/tenant-db';

/** The expiry alert threshold of a household (days), or the default when it has no row yet. */
export async function readExpiryAlertDays(tx: Transaction, householdId: number): Promise<number> {
  const [row] = await tx
    .select({ days: settings.expiryAlertDays })
    .from(settings)
    .where(eq(settings.householdId, householdId));
  return row?.days ?? EXPIRY_SOON_DAYS;
}

/** Settings of one household: its own (members), or one chosen in the admin console. */
@Injectable()
export class SettingsService {
  constructor(@Inject(TenantDb) private readonly tenant: TenantDb) {}

  /** Without `householdId`: the household of the request. */
  async get(householdId?: number): Promise<SettingsDto> {
    const run = <T>(fn: (tx: Transaction, hid: number) => Promise<T>) =>
      householdId === undefined ? this.tenant.run(fn) : this.tenant.forHousehold(householdId, fn);
    return run(async (tx, hid) => ({ expiryAlertDays: await readExpiryAlertDays(tx, hid) }));
  }

  /** Admin console: the household is checked by the controller beforehand. */
  async patch(householdId: number, input: SettingsPatchInput): Promise<SettingsDto> {
    return this.tenant.forHousehold(householdId, async (tx, hid) => {
      if (input.expiryAlertDays !== undefined) {
        await tx
          .insert(settings)
          .values({ householdId: hid, expiryAlertDays: input.expiryAlertDays })
          .onConflictDoUpdate({
            target: settings.householdId,
            set: { expiryAlertDays: input.expiryAlertDays, updatedAt: sql`now()` },
          });
      }
      return { expiryAlertDays: await readExpiryAlertDays(tx, hid) };
    });
  }
}
