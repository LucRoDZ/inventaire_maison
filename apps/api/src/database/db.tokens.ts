import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/** Runtime connections (DATABASE_URL): the application role, subject to row-level security. */
export const PG_POOL = Symbol('PG_POOL');
export const DB = Symbol('DB');
export type Database = NodePgDatabase;
/** A transaction opened with db.transaction(). */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Either the database or a transaction: services accept it to join a caller's transaction. */
export type Executor = Database | Transaction;
