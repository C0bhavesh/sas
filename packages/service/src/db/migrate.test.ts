import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from './migrate';
import type { Db } from './types';
import { createTestDb } from '../testing/testDb';

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});
afterEach(async () => {
  await db.close();
});

describe('migrate', () => {
  it('creates the schema and records the migration', async () => {
    const tables = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const names = tables.map((t) => t.table_name);
    for (const t of [
      'companies',
      'financial_years',
      'account_groups',
      'ledgers',
      'ledger_openings',
      'books',
      'counters',
      'vouchers',
      'voucher_lines',
      'ledger_entries',
      'outstanding_bills',
      'bill_adjustments',
      'on_account',
      'change_log',
    ]) {
      expect(names).toContain(t);
    }
    const applied = await db.query<{ name: string }>('SELECT name FROM schema_migrations');
    expect(applied.map((a) => a.name)).toContain('001_init.sql');
  });

  it('is safe to run twice', async () => {
    const before = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM schema_migrations');
    await migrate(db);
    const after = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM schema_migrations');
    expect(before[0]?.n).toBeGreaterThanOrEqual(1);
    expect(after[0]?.n).toBe(before[0]?.n);
  });
});

describe('change log', () => {
  it('records insert, update and delete of a synced table', async () => {
    const id = randomUUID();
    await db.query(`INSERT INTO companies(id, code, name) VALUES ($1, 'X', 'X Co')`, [id]);
    await db.query(`UPDATE companies SET name = 'Y Co' WHERE id = $1`, [id]);
    await db.query(`DELETE FROM companies WHERE id = $1`, [id]);
    const rows = await db.query<{ op: string; table_name: string }>(
      `SELECT op, table_name FROM change_log WHERE row_id = $1 ORDER BY id`,
      [id],
    );
    expect(rows.map((r) => r.op)).toEqual(['I', 'U', 'D']);
    expect(rows.every((r) => r.table_name === 'companies')).toBe(true);
  });
});
