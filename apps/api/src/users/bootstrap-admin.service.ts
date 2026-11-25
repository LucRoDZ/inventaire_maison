import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { asc, count } from 'drizzle-orm';
import { PasswordService } from '../auth/password.service';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';
import { DB, MigrationRunner, type Database, type Executor } from '../database/database.module';
import { households, users } from '../database/schema';
import { HouseholdsService } from '../households/households.service';

/** Name of the first household of an empty instance (and of the existing data, migration 0003). */
export const FIRST_HOUSEHOLD_NAME = 'Famille';

@Injectable()
export class BootstrapAdminService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapAdminService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(HouseholdsService) private readonly households: HouseholdsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    // Injected so that migrations always run first.
    @Inject(MigrationRunner) private readonly migrations: MigrationRunner,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.bootstrap();
  }

  /**
   * Only when no account exists: creates the first admin from the environment, in the oldest
   * household if there is one (data kept by the migration), otherwise in a new household
   * « Famille » that receives a copy of the model, in the same transaction.
   */
  async bootstrap(): Promise<boolean> {
    const [row] = await this.db.select({ n: count() }).from(users);
    if (row?.n !== 0) return false;
    const passwordHash = await this.passwords.hash(this.config.ADMIN_PASSWORD);
    const insert = async (executor: Executor, householdId: number) =>
      executor
        .insert(users)
        .values({ username: this.config.ADMIN_USERNAME, passwordHash, role: 'admin', householdId })
        .onConflictDoNothing()
        .returning({ id: users.id });

    const [oldest] = await this.db
      .select({ id: households.id })
      .from(households)
      .orderBy(asc(households.id))
      .limit(1);
    const inserted = oldest
      ? await insert(this.db, oldest.id)
      : (await this.households.create(FIRST_HOUSEHOLD_NAME, (tx, id) => insert(tx, id))).extra!;
    if (inserted.length > 0) {
      this.logger.log(`Administrateur « ${this.config.ADMIN_USERNAME} » créé`);
    }
    return inserted.length > 0;
  }
}
