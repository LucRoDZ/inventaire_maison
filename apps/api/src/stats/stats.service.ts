import { Inject, Injectable } from '@nestjs/common';
import { STATS_DAYS, type StatsDto } from '@inventaire/shared';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock';
import { products, stockMovements } from '../database/schema';
import { TenantDb } from '../database/tenant-db';

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_WASTED = 5;

/** Consumption and waste of the household over the last 30 days, computed in SQL. */
@Injectable()
export class StatsService {
  constructor(
    @Inject(TenantDb) private readonly tenant: TenantDb,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async get(): Promise<StatsDto> {
    const since = new Date(this.clock.now().getTime() - STATS_DAYS * DAY_MS);
    return this.tenant.run(async (tx, householdId) => {
      const period = and(
        eq(stockMovements.householdId, householdId),
        inArray(stockMovements.reason, ['consumed', 'wasted']),
        gte(stockMovements.createdAt, since),
      );
      const units = sql<number>`coalesce(sum(-${stockMovements.delta}), 0)::int`;
      const totals = await tx
        .select({ reason: stockMovements.reason, units })
        .from(stockMovements)
        .where(period)
        .groupBy(stockMovements.reason);
      const of = (reason: string) => totals.find((row) => row.reason === reason)?.units ?? 0;
      const consumed = of('consumed');
      const wasted = of('wasted');

      const wastedUnits = sql<number>`sum(-${stockMovements.delta})::int`;
      const top = await tx
        .select({ productId: stockMovements.productId, name: products.name, units: wastedUnits })
        .from(stockMovements)
        .innerJoin(
          products,
          and(eq(products.id, stockMovements.productId), eq(products.householdId, householdId)),
        )
        .where(and(period, eq(stockMovements.reason, 'wasted')))
        .groupBy(stockMovements.productId, products.name)
        .orderBy(desc(wastedUnits), products.name, stockMovements.productId)
        .limit(TOP_WASTED);

      return {
        days: STATS_DAYS,
        consumed,
        wasted,
        wasteRate: consumed + wasted === 0 ? null : wasted / (consumed + wasted),
        topWasted: top,
      };
    });
  }
}
