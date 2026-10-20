import { PGlite } from '@electric-sql/pglite';
import type { Db, Queryable } from '../db/types';

/**
 * Postgres compiled to WASM. Tests use it in memory; development mode can pass a folder to keep data.
 * DATE and NUMERIC are returned as strings, like production.
 */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const options = {
    parsers: {
      1082: (v: string) => v, // date
      1700: (v: string) => v, // numeric
    },
  };
  const pg = dataDir ? new PGlite(dataDir, options) : new PGlite(options);
  await pg.waitReady;
  return {
    async query<T>(sql: string, params?: unknown[]) {
      const r = await pg.query<T>(sql, params as any[]);
      return r.rows;
    },
    async exec(sql: string) {
      await pg.exec(sql);
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      return pg.transaction(async (t) =>
        fn({
          async query<R>(sql: string, params?: unknown[]) {
            const r = await t.query<R>(sql, params as any[]);
            return r.rows;
          },
          async exec(sql: string) {
            await t.exec(sql);
          },
        }),
      );
    },
    close: () => pg.close(),
  };
}
