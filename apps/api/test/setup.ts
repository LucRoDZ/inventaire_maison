import { tmpdir } from 'node:os';
import path from 'node:path';
import 'reflect-metadata';
import { afterAll } from 'vitest';
import { closeOwnerPool } from './helpers';

process.env['NODE_ENV'] = 'test';
// Two roles, as in production: the owner migrates, the application role runs under row-level
// security. The role of the API tests is its own (roles are shared by the whole cluster).
process.env['DATABASE_MIGRATION_URL'] ??= 'postgres://test:test@localhost:5432/inventaire_test';
process.env['DATABASE_URL'] ??=
  'postgres://inventaire_test_app:inventaire-test-app@localhost:5432/inventaire_test';
process.env['SESSION_SECRET'] ??= 'test-session-secret-test-session-secret';
process.env['ADMIN_USERNAME'] ??= 'admin';
process.env['ADMIN_PASSWORD'] ??= 'test-admin-password';
process.env['OFF_USER_AGENT'] ??= 'InventaireMaison-Test/1.0';
// Every test request comes from 127.0.0.1: the global limit is raised, except in its own test.
process.env['RATE_LIMIT_PER_MINUTE'] ??= '100000';
process.env['IMAGES_DIR'] ??= path.join(tmpdir(), `inventaire-test-images-${process.pid}`);

afterAll(async () => {
  await closeOwnerPool();
});
