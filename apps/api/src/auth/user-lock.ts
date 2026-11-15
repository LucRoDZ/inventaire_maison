import { sql } from 'drizzle-orm';
import type { Transaction } from '../database/database.module';

/** First key of the advisory locks on a user (the login throttle uses 1). */
const LOCK_NAMESPACE = 2;

/**
 * Serialises, until the end of the transaction, the operations that read then change a user's
 * credentials or sessions: login (session creation) and password change.
 */
export async function lockUser(tx: Transaction, userId: number): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_NAMESPACE}::int, ${userId}::int)`);
}
