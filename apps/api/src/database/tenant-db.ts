import { AsyncLocalStorage } from 'node:async_hooks';
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { HouseholdContext } from '../common/household-context';
import { DB, type Database, type Transaction } from './db.tokens';

/** The open transaction of the current call chain, and the household it is bound to. */
interface Bound {
  tx: Transaction;
  householdId: number;
}

export class MissingHouseholdError extends Error {
  constructor() {
    super('Aucun foyer dans le contexte : accès aux données refusé');
    this.name = 'MissingHouseholdError';
  }
}

/** Binds a transaction to a household: row-level security then only shows that household. */
export async function bindHousehold(tx: Transaction, householdId: number): Promise<void> {
  if (!Number.isInteger(householdId) || householdId < 1) throw new MissingHouseholdError();
  // `true`: local to the transaction, so the pooled connection keeps no household afterwards.
  await tx.execute(sql`select set_config('app.household_id', ${String(householdId)}, true)`);
}

/**
 * The only way to the household data tables (locations, shelves, categories, off_category_map,
 * products, stock_items, stock_movements). Every call runs in a transaction bound to one household
 * with `set_config('app.household_id', …, true)`; services filter by `household_id` on top of it
 * (the application filter is the rule, row-level security the net). A test refuses any other
 * service that injects DB and touches these tables.
 */
@Injectable()
export class TenantDb {
  private readonly bound = new AsyncLocalStorage<Bound>();

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(HouseholdContext) private readonly context: HouseholdContext,
  ) {}

  /**
   * Runs `fn` in the household of the current request. A nested call joins the transaction already
   * open in the same call chain. No household (outside a signed-in request): refused.
   */
  async run<T>(fn: (tx: Transaction, householdId: number) => Promise<T>): Promise<T> {
    const open = this.bound.getStore();
    if (open) return fn(open.tx, open.householdId);
    const householdId = this.context.current();
    if (householdId === undefined) throw new MissingHouseholdError();
    return this.forHousehold(householdId, fn);
  }

  /**
   * Runs `fn` in an explicit household. Reserved to the admin console (categories and mappings of
   * a chosen household, number of pieces of furniture) and to scripts; the caller has checked the
   * household and the role.
   */
  async forHousehold<T>(
    householdId: number,
    fn: (tx: Transaction, householdId: number) => Promise<T>,
  ): Promise<T> {
    const open = this.bound.getStore();
    if (open?.householdId === householdId) return fn(open.tx, householdId);
    return this.db.transaction(async (tx) => {
      await bindHousehold(tx, householdId);
      return this.bound.run({ tx, householdId }, () => fn(tx, householdId));
    });
  }

  /**
   * Same as `forHousehold`, from a task that outlives its request (a background download): it
   * never joins the request's transaction, which may already be committed.
   */
  detached<T>(
    householdId: number,
    fn: (tx: Transaction, householdId: number) => Promise<T>,
  ): Promise<T> {
    return this.bound.exit(() => this.forHousehold(householdId, fn));
  }

  /**
   * Creates a household and fills it in one transaction: `create` inserts the household row (not
   * row-level secured) and returns its id; the transaction is then bound to it for `fn`.
   */
  async withNewHousehold<T>(
    create: (tx: Transaction) => Promise<number>,
    fn: (tx: Transaction, householdId: number) => Promise<T>,
  ): Promise<T> {
    return this.bound.exit(() =>
      this.db.transaction(async (tx) => {
        const householdId = await create(tx);
        await bindHousehold(tx, householdId);
        return this.bound.run({ tx, householdId }, () => fn(tx, householdId));
      }),
    );
  }
}
