import 'reflect-metadata';

process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] ??= 'postgres://test:test@localhost:5432/inventaire_test';
process.env['SESSION_SECRET'] ??= 'test-session-secret-test-session-secret';
process.env['ADMIN_USERNAME'] ??= 'admin';
process.env['ADMIN_PASSWORD'] ??= 'test-admin-password';
process.env['OFF_USER_AGENT'] ??= 'InventaireMaison-Test/1.0';
