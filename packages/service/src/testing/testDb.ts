import { migrate } from '../db/migrate';
import type { Db } from '../db/types';
import { createPgliteDb } from './pglite';

/** A fresh, fully migrated in-memory database. Close it in afterEach. */
export async function createTestDb(): Promise<Db> {
  const db = await createPgliteDb();
  await migrate(db);
  return db;
}
