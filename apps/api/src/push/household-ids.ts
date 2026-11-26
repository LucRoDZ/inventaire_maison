import { Inject, Injectable } from '@nestjs/common';
import { asc } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module';
import { households } from '../database/schema';

/**
 * Every household of the instance, for the daily summary (a task outside any request). The
 * households table is not row-level secured; this class never reads household data.
 */
@Injectable()
export class HouseholdIds {
  constructor(@Inject(DB) private readonly db: Database) {}

  async all(): Promise<number[]> {
    const rows = await this.db
      .select({ id: households.id })
      .from(households)
      .orderBy(asc(households.id));
    return rows.map((row) => row.id);
  }
}
