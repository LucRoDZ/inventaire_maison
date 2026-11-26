import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  PushPublicKeyDto,
  PushSubscriptionInput,
  PushSummaryPayload,
  StockSummaryDto,
} from '@inventaire/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { pushSubscriptions, users } from '../database/schema';
import { TenantDb } from '../database/tenant-db';
import { StockQuery } from '../stock/stock.query';
import { HouseholdIds } from './household-ids';
import { PUSH_SENDER, type PushSender } from './push.sender';

const SOON_URL = '/inventaire?vue=liste&echeance=bientot';

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/** The notification of one household, or null when nothing needs attention. */
export function buildSummary(summary: StockSummaryDto): PushSummaryPayload | null {
  const { today, expired, soon } = summary;
  if (today + expired + soon === 0) return null;
  const parts: string[] = [];
  if (today > 0) parts.push(`${plural(today, 'produit périme', 'produits périment')} aujourd’hui`);
  if (expired > 0) parts.push(plural(expired, 'produit périmé', 'produits périmés'));
  if (soon > 0) parts.push(`${plural(soon, 'produit', 'produits')} à consommer bientôt`);
  const url =
    today > 0
      ? '/inventaire?vue=liste&echeance=aujourdhui'
      : expired > 0
        ? '/inventaire?vue=liste&echeance=perime'
        : SOON_URL;
  return {
    title: 'Garde-manger',
    body: `${parts.join(', ')}.`,
    tone: today > 0 || expired > 0 ? 'urgent' : 'planned',
    url,
  };
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @Inject(HouseholdIds) private readonly householdIds: HouseholdIds,
    @Inject(TenantDb) private readonly tenant: TenantDb,
    @Inject(StockQuery) private readonly stock: StockQuery,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
  ) {}

  publicKey(): PushPublicKeyDto {
    return { publicKey: this.sender.publicKey };
  }

  /** One row per device and household: subscribing again moves it to the current account. */
  async subscribe(userId: number, input: PushSubscriptionInput): Promise<void> {
    await this.tenant.run(async (tx, householdId) => {
      await tx
        .insert(pushSubscriptions)
        .values({
          householdId,
          userId,
          endpoint: input.endpoint,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
        })
        .onConflictDoUpdate({
          target: [pushSubscriptions.householdId, pushSubscriptions.endpoint],
          set: { userId, p256dh: input.keys.p256dh, auth: input.keys.auth },
        });
    });
  }

  /** Deletes the subscription of the account only; an unknown endpoint is not an error. */
  async unsubscribe(userId: number, endpoint: string): Promise<void> {
    await this.tenant.run(async (tx, householdId) => {
      await tx
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.householdId, householdId),
            eq(pushSubscriptions.endpoint, endpoint),
            eq(pushSubscriptions.userId, userId),
          ),
        );
    });
  }

  /** The daily summary of every household. A failure in one household never stops the others. */
  async sendDailySummary(): Promise<{ sent: number; removed: number }> {
    const total = { sent: 0, removed: 0 };
    if (!this.sender.enabled) return total;
    const ids = await this.householdIds.all();
    for (const id of ids) {
      try {
        const result = await this.sendFor(id);
        total.sent += result.sent;
        total.removed += result.removed;
      } catch (error) {
        this.logger.error(`Résumé du foyer ${id} : ${(error as Error).message}`);
      }
    }
    return total;
  }

  private async sendFor(householdId: number): Promise<{ sent: number; removed: number }> {
    const payload = buildSummary(await this.stock.summaryOf(householdId));
    if (!payload) return { sent: 0, removed: 0 };
    // Only devices of accounts that are enabled and still in this household.
    const targets = await this.tenant.forHousehold(householdId, (tx, hid) =>
      tx
        .select({
          id: pushSubscriptions.id,
          endpoint: pushSubscriptions.endpoint,
          p256dh: pushSubscriptions.p256dh,
          auth: pushSubscriptions.auth,
        })
        .from(pushSubscriptions)
        .innerJoin(users, eq(users.id, pushSubscriptions.userId))
        .where(
          and(
            eq(pushSubscriptions.householdId, hid),
            eq(users.householdId, hid),
            isNull(users.disabledAt),
          ),
        ),
    );
    let sent = 0;
    let removed = 0;
    for (const target of targets) {
      let result;
      try {
        result = await this.sender.send(target, payload);
      } catch (error) {
        this.logger.warn(`Envoi impossible : ${(error as Error).message}`);
        continue;
      }
      await this.tenant.forHousehold(householdId, async (tx, hid) => {
        const own = and(
          eq(pushSubscriptions.id, target.id),
          eq(pushSubscriptions.householdId, hid),
        );
        if (result === 'gone') await tx.delete(pushSubscriptions).where(own);
        else
          await tx
            .update(pushSubscriptions)
            .set({ lastSentAt: sql`now()` })
            .where(own);
      });
      if (result === 'gone') removed += 1;
      else sent += 1;
    }
    return { sent, removed };
  }
}
