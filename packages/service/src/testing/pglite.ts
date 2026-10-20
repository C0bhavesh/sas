import { PGlite } from '@electric-sql/pglite';
import type { Db, Queryable } from '../db/types';

/** In-memory Postgres for tests. DATE and NUMERIC are returned as strings, like production. */
export async function createPgliteDb(): Promise<Db> {
  const pg = new PGlite({
    parsers: {
      1082: (v: string) => v, // date
      1700: (v: string) => v, // numeric
    },
  });
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
