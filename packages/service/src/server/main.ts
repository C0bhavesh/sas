import { buildApp } from '../api/app';
import { createPgDb } from '../db/pg';
import { migrate } from '../db/migrate';
import type { Db } from '../db/types';
import { execRunner, pgConnFromUrl, type BackupConfig } from '../ops/backup';
import { bootstrapAdmin } from './bootstrap';

async function openDatabase(): Promise<Db> {
  if (process.env.DATABASE_URL) return createPgDb(process.env.DATABASE_URL);
  if (process.env.SAS_DEV_PGLITE_DIR) {
    // Development only: an embedded Postgres, so no installation is needed.
    const { createPgliteDb } = await import('../testing/pglite');
    return createPgliteDb(process.env.SAS_DEV_PGLITE_DIR);
  }
  console.error('Set DATABASE_URL (PostgreSQL) or, for development only, SAS_DEV_PGLITE_DIR.');
  process.exit(1);
}

const db = await openDatabase();
await migrate(db);

const adminPassword = process.env.ADMIN_PASSWORD;
if (adminPassword && (await bootstrapAdmin(db, process.env.ADMIN_USERNAME ?? 'admin', adminPassword))) {
  console.log('Created the first administrator.');
}
const users = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM users');
if ((users[0]?.n ?? 0) === 0) {
  console.error('No users exist yet. Start once with ADMIN_PASSWORD set to create the first administrator.');
  process.exit(1);
}

let backup: BackupConfig | undefined;
if (process.env.BACKUP_DIR && process.env.DATABASE_URL) {
  backup = { conn: pgConnFromUrl(process.env.DATABASE_URL), dir: process.env.BACKUP_DIR, runner: execRunner() };
}

const app = buildApp({ db, backup, logger: true });
const port = Number(process.env.PORT ?? 4100);
const host = process.env.HOST ?? '127.0.0.1';
await app.listen({ port, host });

const stop = async () => {
  await app.close();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
