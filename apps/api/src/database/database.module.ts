import path from 'node:path';
import {
  Global,
  Logger,
  Inject,
  Injectable,
  Module,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { HouseholdContext } from '../common/household-context';
import { APP_CONFIG, ConfigModule } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';
import { appRoleFrom, assertRuntimeRole, ensureAppRole } from './app-role';
import { relocateLegacyImages } from './legacy-images';
import { TenantDb } from './tenant-db';

import { DB, PG_POOL } from './db.tokens';

export { DB, PG_POOL, type Database, type Executor, type Transaction } from './db.tokens';

export const MIGRATIONS_FOLDER = path.resolve(__dirname, '../../drizzle');

/**
 * Before the HTTP server listens: with the owner connection (DATABASE_MIGRATION_URL), applies the
 * migrations, sets up the runtime role and moves the images of older versions; then checks that
 * the runtime connection cannot bypass row-level security. The owner connection is closed after.
 */
@Injectable()
export class MigrationRunner implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(MigrationRunner.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    const owner = new Pool({
      connectionString: this.config.DATABASE_MIGRATION_URL,
      connectionTimeoutMillis: 3000,
      max: 2,
    });
    owner.on('error', (error) =>
      Logger.warn(`Connexion PostgreSQL (migrations) perdue : ${error.message}`),
    );
    try {
      await migrate(drizzle(owner), { migrationsFolder: MIGRATIONS_FOLDER });
      await ensureAppRole(owner, appRoleFrom(this.config.DATABASE_URL));
      const moved = await relocateLegacyImages(owner, this.config.IMAGES_DIR);
      if (moved > 0) this.logger.log(`${moved} images rangées par foyer`);
    } finally {
      await owner.end();
    }
    await assertRuntimeRole(this.pool);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PG_POOL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => {
        const pool = new Pool({
          connectionString: config.DATABASE_URL,
          connectionTimeoutMillis: 3000,
        });
        // An idle client lost with the server must not crash the process.
        pool.on('error', (error) => Logger.warn(`Connexion PostgreSQL perdue : ${error.message}`));
        return pool;
      },
    },
    { provide: DB, inject: [PG_POOL], useFactory: (pool: Pool) => drizzle(pool) },
    HouseholdContext,
    TenantDb,
    MigrationRunner,
  ],
  exports: [PG_POOL, DB, HouseholdContext, TenantDb, MigrationRunner],
})
export class DatabaseModule {}
