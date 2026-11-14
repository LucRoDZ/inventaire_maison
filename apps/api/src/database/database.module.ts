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
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { APP_CONFIG, ConfigModule } from '../config/config.module';
import type { AppConfig } from '../config/env.schema';

export const PG_POOL = Symbol('PG_POOL');
export const DB = Symbol('DB');
export type Database = NodePgDatabase;

export const MIGRATIONS_FOLDER = path.resolve(__dirname, '../../drizzle');

@Injectable()
export class MigrationRunner implements OnModuleInit, OnApplicationShutdown {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  /** Runs before the HTTP server starts listening. */
  async onModuleInit(): Promise<void> {
    await migrate(this.db, { migrationsFolder: MIGRATIONS_FOLDER });
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
    MigrationRunner,
  ],
  exports: [PG_POOL, DB, MigrationRunner],
})
export class DatabaseModule {}
