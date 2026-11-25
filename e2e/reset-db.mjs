// Recreates the e2e database so every run starts empty (the API then migrates, seeds and creates the admin).
// DATABASE_MIGRATION_URL (the owner, a superuser of the test cluster) points at the e2e database; the
// maintenance database "postgres" is used to drop and create it.
import pg from 'pg';

const url = new URL(
  process.env.DATABASE_MIGRATION_URL ??
    process.env.DATABASE_URL ??
    'postgres://test:test@localhost:5432/inventaire_e2e',
);
const name = url.pathname.slice(1);
if (!/^[a-z0-9_]+$/.test(name) || !name.includes('e2e')) {
  console.error(`reset-db : refus de recréer la base « ${name} » (le nom doit contenir « e2e »).`);
  process.exit(1);
}

const admin = new pg.Client({ connectionString: new URL('/postgres', url).toString() });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
await admin.query(`CREATE DATABASE ${name}`);
await admin.end();
console.log(`reset-db : base « ${name} » recréée.`);
