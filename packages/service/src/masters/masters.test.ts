import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/types';
import { createTestDb } from '../testing/testDb';
import { createBook } from './books';
import { createCompany } from './companies';
import { DEFAULT_GROUPS } from './groups';
import { createLedger, setOpening } from './ledgers';

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});
afterEach(async () => {
  await db.close();
});

async function newCompany() {
  return createCompany(db, {
    code: 'C1',
    name: 'Test Textiles',
    fyLabel: '2026-27',
    fyStart: '2026-04-01',
    fyEnd: '2027-03-31',
  });
}

describe('createCompany', () => {
  it('creates the company, an open year and the standard groups', async () => {
    const { companyId, yearId } = await newCompany();
    const years = await db.query<{ status: string }>('SELECT status FROM financial_years WHERE id = $1', [yearId]);
    expect(years[0]?.status).toBe('open');
    const groups = await db.query<{ code: number }>('SELECT code FROM account_groups WHERE company_id = $1', [
      companyId,
    ]);
    expect(groups).toHaveLength(DEFAULT_GROUPS.length);
    const debtors = await db.query<{ nature: string }>(
      'SELECT nature FROM account_groups WHERE company_id = $1 AND code = 42',
      [companyId],
    );
    expect(debtors[0]?.nature).toBe('asset');
  });

  it('links Creditors-for-Others (34) under Sundry Creditors (35)', async () => {
    const { companyId } = await newCompany();
    const rows = await db.query<{ parent_code: number }>(
      `SELECT p.code AS parent_code FROM account_groups c JOIN account_groups p ON p.id = c.parent_id
       WHERE c.company_id = $1 AND c.code = 34`,
      [companyId],
    );
    expect(rows[0]?.parent_code).toBe(35);
  });

  it('rejects a duplicate company code', async () => {
    await newCompany();
    await expect(newCompany()).rejects.toThrow();
  });
});

describe('createLedger / setOpening', () => {
  it('creates a ledger under a group and stores an opening balance', async () => {
    const { companyId, yearId } = await newCompany();
    const ledgerId = await createLedger(db, { companyId, groupCode: 42, name: 'Ramesh Traders', city: 'Surat' });
    await setOpening(db, ledgerId, yearId, '1500.50', 'Dr');
    const rows = await db.query<{ amount: string; side: string }>(
      'SELECT amount, side FROM ledger_openings WHERE ledger_id = $1',
      [ledgerId],
    );
    expect(rows[0]).toEqual({ amount: '1500.50', side: 'Dr' });
  });

  it('setOpening twice replaces the earlier value', async () => {
    const { companyId, yearId } = await newCompany();
    const ledgerId = await createLedger(db, { companyId, groupCode: 42, name: 'A' });
    await setOpening(db, ledgerId, yearId, '10', 'Dr');
    await setOpening(db, ledgerId, yearId, '20', 'Cr');
    const rows = await db.query<{ amount: string; side: string }>(
      'SELECT amount, side FROM ledger_openings WHERE ledger_id = $1',
      [ledgerId],
    );
    expect(rows).toEqual([{ amount: '20.00', side: 'Cr' }]);
  });

  it('rejects an unknown group and a duplicate name (case-insensitive)', async () => {
    const { companyId } = await newCompany();
    await expect(createLedger(db, { companyId, groupCode: 999, name: 'X' })).rejects.toThrow(/group/i);
    await createLedger(db, { companyId, groupCode: 42, name: 'Ramesh' });
    await expect(createLedger(db, { companyId, groupCode: 42, name: 'RAMESH' })).rejects.toThrow();
  });
});

describe('createBook', () => {
  it('requires a default ledger for cash and bank books', async () => {
    const { companyId } = await newCompany();
    await expect(createBook(db, { companyId, code: 'CB', name: 'Cash Book', type: 'cash' })).rejects.toThrow(
      /ledger/i,
    );
    const cash = await createLedger(db, { companyId, groupCode: 16, name: 'Cash' });
    const id = await createBook(db, { companyId, code: 'CB', name: 'Cash Book', type: 'cash', defaultLedgerId: cash });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('creates a journal book without a ledger', async () => {
    const { companyId } = await newCompany();
    const id = await createBook(db, { companyId, code: 'JV', name: 'Journal', type: 'journal' });
    expect(id).toBeTruthy();
  });
});
