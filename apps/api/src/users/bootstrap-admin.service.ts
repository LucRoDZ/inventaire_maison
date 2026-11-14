import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { count } from 'drizzle-orm';
import { PasswordService } from '../auth/password.service';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';
import { DB, MigrationRunner, type Database } from '../database/database.module';
import { users } from '../database/schema';

@Injectable()
export class BootstrapAdminService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapAdminService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    // Injected so that migrations always run first.
    @Inject(MigrationRunner) private readonly migrations: MigrationRunner,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.bootstrap();
  }

  /** Creates the first admin from the environment, only when no user exists. */
  async bootstrap(): Promise<boolean> {
    const [row] = await this.db.select({ n: count() }).from(users);
    if (row?.n !== 0) return false;
    const passwordHash = await this.passwords.hash(this.config.ADMIN_PASSWORD);
    const inserted = await this.db
      .insert(users)
      .values({ username: this.config.ADMIN_USERNAME, passwordHash, role: 'admin' })
      .onConflictDoNothing()
      .returning({ id: users.id });
    if (inserted.length > 0)
      this.logger.log(`Administrateur « ${this.config.ADMIN_USERNAME} » créé`);
    return inserted.length > 0;
  }
}
