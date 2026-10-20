import pg from 'pg';
import type { Db, Queryable } from './types';

// Return DATE columns as 'YYYY-MM-DD' strings, not JS Date objects.
pg.types.setTypeParser(1082, (v: string) => v);

export function createPgDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString });
  return {
    async query<T>(sql: string, params?: unknown[]) {
      const r = await pool.query(sql, params as any[]);
      return r.rows as T[];
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tx: Queryable = {
          async query<R>(sql: string, params?: unknown[]) {
            const r = await client.query(sql, params as any[]);
            return r.rows as R[];
          },
          async exec(sql: string) {
            await client.query(sql);
          },
        };
        const result = await fn(tx);
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
