import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/types';
import { setOpening } from '../masters/ledgers';
import { saveVoucher } from '../posting/voucherService';
import { seedCompany, type SeededCompany } from '../testing/fixtures';
import { createTestDb } from '../testing/testDb';
import { ledgerBalances } from './balances';
import { assertIsoDate, fromDrCr, toDrCr } from './format';
import { cashBookDaily, ledgerReport } from './ledgerReport';

let db: Db;
let s: SeededCompany;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedCompany(db);
  await setOpening(db, s.cashLedgerId, s.yearId, '1000', 'Dr');
});
afterEach(async () => {
  await db.close();
});

function receipt(amount: string, date: string) {
  return {
    companyId: s.companyId,
    yearId: s.yearId,
    bookId: s.cashBookId,
    kind: 'receipt' as const,
    date,
    lines: [{ ledgerId: s.partyLedgerId, side: 'Cr' as const, amount }],
    actorId: null,
  };
}
function payment(amount: string, date: string) {
  return {
    companyId: s.companyId,
    yearId: s.yearId,
    bookId: s.cashBookId,
    kind: 'payment' as const,
    date,
    lines: [{ ledgerId: s.partyLedgerId, side: 'Dr' as const, amount }],
    actorId: null,
  };
}

describe('format helpers', () => {
  it('toDrCr / fromDrCr round-trip', () => {
    expect(toDrCr(12345n)).toEqual({ amount: '123.45', side: 'Dr' });
    expect(toDrCr(-5n)).toEqual({ amount: '0.05', side: 'Cr' });
    expect(toDrCr(0n)).toEqual({ amount: '0.00', side: 'Dr' });
    expect(fromDrCr({ amount: '123.45', side: 'Dr' })).toBe(12345n);
    expect(fromDrCr({ amount: '0.05', side: 'Cr' })).toBe(-5n);
  });
  it('assertIsoDate rejects bad dates', () => {
    expect(() => assertIsoDate('2026-05-10')).not.toThrow();
    expect(() => assertIsoDate('10/05/2026')).toThrowError(/date/i);
  });
});

describe('ledgerBalances', () => {
  it('adds opening and movement up to the as-on date', async () => {
    await saveVoucher(db, receipt('500', '2026-05-10'));
    await saveVoucher(db, receipt('200', '2026-06-10'));
    const rows = await ledgerBalances(db, { companyId: s.companyId, yearId: s.yearId, asOn: '2026-05-31' });
    const cash = rows.find((r) => r.ledgerId === s.cashLedgerId)!;
    expect(cash).toMatchObject({ opening: 100000n, debit: 50000n, credit: 0n, balance: 150000n });
    const party = rows.find((r) => r.ledgerId === s.partyLedgerId)!;
    expect(party.balance).toBe(-50000n); // credit balance
  });

  it('leaves out ledgers in hidden groups', async () => {
    const group = await db.query<{ id: string }>('SELECT id FROM account_groups WHERE company_id = $1 AND code = 16', [
      s.companyId,
    ]);
    const rows = await ledgerBalances(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      asOn: '2027-03-31',
      hiddenGroupIds: [group[0]!.id],
    });
    expect(rows.some((r) => r.ledgerId === s.cashLedgerId)).toBe(false);
  });
});

describe('ledgerReport', () => {
  it('shows opening, running balance and closing', async () => {
    await saveVoucher(db, receipt('500', '2026-05-10'));
    await saveVoucher(db, payment('200', '2026-05-12'));
    const r = await ledgerReport(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      ledgerId: s.cashLedgerId,
      from: '2026-04-01',
      to: '2026-05-31',
    });
    expect(r.ledgerName).toBe('Cash');
    expect(r.opening).toEqual({ amount: '1000.00', side: 'Dr' });
    expect(r.rows.map((x) => [x.date, x.debit, x.credit, x.balance.amount])).toEqual([
      ['2026-05-10', '500.00', '0.00', '1500.00'],
      ['2026-05-12', '0.00', '200.00', '1300.00'],
    ]);
    expect(r.rows[0]).toMatchObject({ voucherNo: 1, bookCode: 'CB' });
    expect(r.totalDebit).toBe('500.00');
    expect(r.totalCredit).toBe('200.00');
    expect(r.closing).toEqual({ amount: '1300.00', side: 'Dr' });
  });

  it('a report starting mid-year folds earlier entries into the opening', async () => {
    await saveVoucher(db, receipt('500', '2026-05-10'));
    await saveVoucher(db, receipt('100', '2026-06-10'));
    const r = await ledgerReport(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      ledgerId: s.cashLedgerId,
      from: '2026-06-01',
      to: '2026-06-30',
    });
    expect(r.opening).toEqual({ amount: '1500.00', side: 'Dr' });
    expect(r.rows).toHaveLength(1);
    expect(r.closing).toEqual({ amount: '1600.00', side: 'Dr' });
  });

  it('rejects an unknown ledger and a bad date', async () => {
    await expect(
      ledgerReport(db, {
        companyId: s.companyId,
        yearId: s.yearId,
        ledgerId: '00000000-0000-4000-8000-000000000000',
        from: '2026-04-01',
        to: '2026-05-31',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      ledgerReport(db, { companyId: s.companyId, yearId: s.yearId, ledgerId: s.cashLedgerId, from: 'x', to: 'y' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('cashBookDaily', () => {
  it('summarises each day with opening, receipts, payments and closing', async () => {
    await saveVoucher(db, receipt('500', '2026-05-10'));
    await saveVoucher(db, receipt('300', '2026-05-10'));
    await saveVoucher(db, payment('200', '2026-05-12'));
    const days = await cashBookDaily(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      bookId: s.cashBookId,
      from: '2026-05-01',
      to: '2026-05-31',
    });
    expect(days).toEqual([
      {
        date: '2026-05-10',
        opening: { amount: '1000.00', side: 'Dr' },
        receipts: '800.00',
        payments: '0.00',
        closing: { amount: '1800.00', side: 'Dr' },
      },
      {
        date: '2026-05-12',
        opening: { amount: '1800.00', side: 'Dr' },
        receipts: '0.00',
        payments: '200.00',
        closing: { amount: '1600.00', side: 'Dr' },
      },
    ]);
  });

  it('refuses a book that has no ledger', async () => {
    await expect(
      cashBookDaily(db, {
        companyId: s.companyId,
        yearId: s.yearId,
        bookId: s.journalBookId,
        from: '2026-05-01',
        to: '2026-05-31',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
