import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '@sas/shared';
import type { Db } from '../db/types';
import { createLedger, setOpening } from '../masters/ledgers';
import { listPendingBills, registerBill } from '../outstanding/billService';
import { saveVoucher } from '../posting/voucherService';
import { trialBalance } from '../reports/financial';
import { createUser } from '../security/users';
import { seedCompany, type SeededCompany } from '../testing/fixtures';
import { createTestDb } from '../testing/testDb';
import { closeYear, lockYear, reopenYear } from './yearEnd';

let db: Db;
let s: SeededCompany;
let admin: Actor;
let sales: string;
let rent: string;
const NEXT = { label: '2027-28', start: '2027-04-01', end: '2028-03-31' };

beforeEach(async () => {
  db = await createTestDb();
  s = await seedCompany(db);
  admin = { userId: await createUser(db, { username: 'boss', password: 'pass1234', isAdmin: true }), username: 'boss', isAdmin: true };
  const capital = await createLedger(db, { companyId: s.companyId, groupCode: 5, name: 'Capital' });
  sales = await createLedger(db, { companyId: s.companyId, groupCode: 29, name: 'Sales' });
  rent = await createLedger(db, { companyId: s.companyId, groupCode: 32, name: 'Rent' });
  await setOpening(db, s.cashLedgerId, s.yearId, '10000', 'Dr');
  await setOpening(db, capital, s.yearId, '10000', 'Cr');
  const base = { companyId: s.companyId, yearId: s.yearId, actorId: null };
  await saveVoucher(db, {
    ...base,
    bookId: s.journalBookId,
    kind: 'journal',
    date: '2026-05-01',
    lines: [
      { ledgerId: s.partyLedgerId, side: 'Dr', amount: '3000' },
      { ledgerId: sales, side: 'Cr', amount: '3000' },
    ],
  });
  await saveVoucher(db, {
    ...base,
    bookId: s.cashBookId,
    kind: 'receipt',
    date: '2026-05-05',
    lines: [{ ledgerId: s.partyLedgerId, side: 'Cr', amount: '1000' }],
  });
  await saveVoucher(db, {
    ...base,
    bookId: s.cashBookId,
    kind: 'payment',
    date: '2026-05-08',
    lines: [{ ledgerId: rent, side: 'Dr', amount: '400' }],
  });
});
afterEach(async () => {
  await db.close();
});

async function openings(yearId: string) {
  const rows = await db.query<{ name: string; amount: string; side: string }>(
    `SELECT l.name, o.amount, o.side FROM ledger_openings o JOIN ledgers l ON l.id = o.ledger_id WHERE o.year_id = $1`,
    [yearId],
  );
  return Object.fromEntries(rows.map((r) => [r.name, [r.amount, r.side]]));
}
const status = async (yearId: string) =>
  (await db.query<{ status: string }>('SELECT status FROM financial_years WHERE id = $1', [yearId]))[0]?.status;
const close = () => closeYear(db, admin, { companyId: s.companyId, yearId: s.yearId, next: NEXT });

describe('closeYear', () => {
  it('writes the next year\'s openings and moves the profit to Profit & Loss A/c', async () => {
    const r = await close();
    expect(r.netProfit).toBe('2600.00');
    expect(r.carriedLedgers).toBe(4);
    expect(await openings(r.nextYearId)).toEqual({
      Cash: ['10600.00', 'Dr'],
      Capital: ['10000.00', 'Cr'],
      'Ramesh Traders': ['2000.00', 'Dr'],
      'Profit & Loss A/c': ['2600.00', 'Cr'],
    });
    expect(await status(s.yearId)).toBe('closed');
  });

  it('the next year opens balanced', async () => {
    const r = await close();
    const tb = await trialBalance(db, { companyId: s.companyId, yearId: r.nextYearId, asOn: '2027-04-01' });
    expect(tb.totalDebit).toBe('12600.00');
    expect(tb.totalCredit).toBe('12600.00');
    expect(tb.difference).toBe('0.00');
  });

  it('closed year refuses new vouchers', async () => {
    await close();
    await expect(
      saveVoucher(db, {
        companyId: s.companyId,
        yearId: s.yearId,
        bookId: s.cashBookId,
        kind: 'receipt',
        date: '2026-06-01',
        lines: [{ ledgerId: s.partyLedgerId, side: 'Cr', amount: '1' }],
        actorId: null,
      }),
    ).rejects.toMatchObject({ code: 'YEAR_LOCKED' });
  });

  it('carries pending bills forward', async () => {
    await registerBill(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      ledgerId: s.partyLedgerId,
      billNo: 'S-1',
      billDate: '2026-05-01',
      amount: '3000',
      side: 'Dr',
    });
    const r = await close();
    expect(r.carriedBills).toBe(1);
    expect((await listPendingBills(db, s.companyId, s.partyLedgerId)).map((b) => b.billNo)).toEqual(['S-1']);
  });

  it('rejects bad next-year dates', async () => {
    await expect(
      closeYear(db, admin, { companyId: s.companyId, yearId: s.yearId, next: { label: 'x', start: '2026-12-01', end: '2027-11-30' } }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('needs the utilities edit right', async () => {
    const clerkId = await createUser(db, { username: 'clerk', password: 'pass1234' });
    await expect(
      closeYear(db, { userId: clerkId, username: 'clerk', isAdmin: false }, { companyId: s.companyId, yearId: s.yearId, next: NEXT }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('reopenYear', () => {
  it('lets you correct the old year and close again; openings are recalculated, not duplicated', async () => {
    const first = await close();
    await reopenYear(db, admin, s.companyId, s.yearId);
    expect(await status(s.yearId)).toBe('open');
    await saveVoucher(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      bookId: s.cashBookId,
      kind: 'receipt',
      date: '2026-06-01',
      lines: [{ ledgerId: s.partyLedgerId, side: 'Cr', amount: '500' }],
      actorId: null,
    });
    const second = await close();
    expect(second.nextYearId).toBe(first.nextYearId);
    expect(await openings(second.nextYearId)).toEqual({
      Cash: ['11100.00', 'Dr'],
      Capital: ['10000.00', 'Cr'],
      'Ramesh Traders': ['1500.00', 'Dr'],
      'Profit & Loss A/c': ['2600.00', 'Cr'],
    });
  });

  it('refuses once the next year is closed', async () => {
    const r = await close();
    await closeYear(db, admin, {
      companyId: s.companyId,
      yearId: r.nextYearId,
      next: { label: '2028-29', start: '2028-04-01', end: '2029-03-31' },
    });
    await expect(reopenYear(db, admin, s.companyId, s.yearId)).rejects.toMatchObject({ code: 'YEAR_BAD_STATE' });
  });

  it('refuses to reopen a year that is not closed', async () => {
    await expect(reopenYear(db, admin, s.companyId, s.yearId)).rejects.toMatchObject({ code: 'YEAR_BAD_STATE' });
  });
});

describe('lockYear', () => {
  it('locks for good', async () => {
    await close();
    await lockYear(db, admin, s.companyId, s.yearId);
    expect(await status(s.yearId)).toBe('locked');
    await expect(reopenYear(db, admin, s.companyId, s.yearId)).rejects.toMatchObject({ code: 'YEAR_BAD_STATE' });
    await expect(close()).rejects.toMatchObject({ code: 'YEAR_BAD_STATE' });
  });

  it('only a closed year can be locked', async () => {
    await expect(lockYear(db, admin, s.companyId, s.yearId)).rejects.toMatchObject({ code: 'YEAR_BAD_STATE' });
  });
});
