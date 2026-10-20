import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/types';
import { createLedger, setOpening } from '../masters/ledgers';
import { saveVoucher } from '../posting/voucherService';
import { seedCompany, type SeededCompany } from '../testing/fixtures';
import { createTestDb } from '../testing/testDb';
import { balanceSheet, profitAndLoss, trialBalance } from './financial';

let db: Db;
let s: SeededCompany;
let capital: string;
let sales: string;
let rent: string;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedCompany(db);
  capital = await createLedger(db, { companyId: s.companyId, groupCode: 5, name: 'Capital' });
  sales = await createLedger(db, { companyId: s.companyId, groupCode: 29, name: 'Sales' });
  rent = await createLedger(db, { companyId: s.companyId, groupCode: 32, name: 'Rent' });
  await setOpening(db, s.cashLedgerId, s.yearId, '10000', 'Dr');
  await setOpening(db, capital, s.yearId, '10000', 'Cr');

  // Credit sale of 3000, receipt of 1000, rent paid 400.
  await saveVoucher(db, {
    companyId: s.companyId,
    yearId: s.yearId,
    bookId: s.journalBookId,
    kind: 'journal',
    date: '2026-05-01',
    lines: [
      { ledgerId: s.partyLedgerId, side: 'Dr', amount: '3000' },
      { ledgerId: sales, side: 'Cr', amount: '3000' },
    ],
    actorId: null,
  });
  await saveVoucher(db, {
    companyId: s.companyId,
    yearId: s.yearId,
    bookId: s.cashBookId,
    kind: 'receipt',
    date: '2026-05-05',
    lines: [{ ledgerId: s.partyLedgerId, side: 'Cr', amount: '1000' }],
    actorId: null,
  });
  await saveVoucher(db, {
    companyId: s.companyId,
    yearId: s.yearId,
    bookId: s.cashBookId,
    kind: 'payment',
    date: '2026-05-08',
    lines: [{ ledgerId: rent, side: 'Dr', amount: '400' }],
    actorId: null,
  });
});
afterEach(async () => {
  await db.close();
});

const P = () => ({ companyId: s.companyId, yearId: s.yearId, asOn: '2027-03-31' });

describe('trialBalance', () => {
  it('lists non-zero ledgers and balances to the paisa', async () => {
    const tb = await trialBalance(db, P());
    const byName = Object.fromEntries(tb.rows.map((r) => [r.ledgerName, [r.debit, r.credit]]));
    expect(byName).toEqual({
      Cash: ['10600.00', '0.00'],
      'Ramesh Traders': ['2000.00', '0.00'],
      Rent: ['400.00', '0.00'],
      Capital: ['0.00', '10000.00'],
      Sales: ['0.00', '3000.00'],
    });
    expect(tb.totalDebit).toBe('13000.00');
    expect(tb.totalCredit).toBe('13000.00');
    expect(tb.difference).toBe('0.00');
  });

  it('respects the as-on date', async () => {
    const tb = await trialBalance(db, { ...P(), asOn: '2026-05-01' });
    expect(tb.rows.find((r) => r.ledgerName === 'Rent')).toBeUndefined();
    expect(tb.difference).toBe('0.00');
  });

  it('rolls sub-groups up into their top-level group', async () => {
    const creditor = await createLedger(db, { companyId: s.companyId, groupCode: 34, name: 'Misc Creditor' });
    await saveVoucher(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      bookId: s.journalBookId,
      kind: 'journal',
      date: '2026-05-09',
      lines: [
        { ledgerId: rent, side: 'Dr', amount: '50' },
        { ledgerId: creditor, side: 'Cr', amount: '50' },
      ],
      actorId: null,
    });
    const tb = await trialBalance(db, P());
    expect(tb.groups.find((g) => g.code === 35)).toMatchObject({ debit: '0.00', credit: '50.00' });
    expect(tb.groups.find((g) => g.code === 34)).toBeUndefined();
  });

  it('shows an imbalance when a group is hidden', async () => {
    const g = await db.query<{ id: string }>('SELECT id FROM account_groups WHERE company_id = $1 AND code = 16', [
      s.companyId,
    ]);
    const tb = await trialBalance(db, { ...P(), hiddenGroupIds: [g[0]!.id] });
    expect(tb.rows.some((r) => r.ledgerName === 'Cash')).toBe(false);
    expect(tb.difference).toBe('-10600.00');
  });
});

describe('profitAndLoss', () => {
  it('computes income, expense and net profit', async () => {
    const pl = await profitAndLoss(db, P());
    expect(pl.income.total).toBe('3000.00');
    expect(pl.expense.total).toBe('400.00');
    expect(pl.netProfit).toBe('2600.00');
    expect(pl.income.groups[0]).toMatchObject({ code: 29, name: 'Trading Income', amount: '3000.00' });
    expect(pl.income.groups[0]?.ledgers).toEqual([{ ledgerId: sales, name: 'Sales', amount: '3000.00' }]);
  });

  it('respects the as-on date', async () => {
    // the sale is dated 05-01 and the rent 05-08
    expect((await profitAndLoss(db, { ...P(), asOn: '2026-05-04' })).netProfit).toBe('3000.00');
    expect((await profitAndLoss(db, { ...P(), asOn: '2026-04-30' })).netProfit).toBe('0.00');
  });

  it('reports a loss as a negative net profit', async () => {
    await saveVoucher(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      bookId: s.cashBookId,
      kind: 'payment',
      date: '2026-06-01',
      lines: [{ ledgerId: rent, side: 'Dr', amount: '5000' }],
      actorId: null,
    });
    const pl = await profitAndLoss(db, P());
    expect(pl.expense.total).toBe('5400.00');
    expect(pl.netProfit).toBe('-2400.00');
  });
});

describe('balanceSheet', () => {
  it('ties: assets equal liabilities plus net profit', async () => {
    const bs = await balanceSheet(db, P());
    expect(bs.netProfit).toBe('2600.00');
    expect(bs.assets.total).toBe('12600.00'); // cash 10600 + debtor 2000
    expect(bs.liabilities.total).toBe('10000.00'); // capital
    expect(bs.totalAssets).toBe('12600.00');
    expect(bs.totalLiabilities).toBe('12600.00'); // capital + profit
    expect(bs.difference).toBe('0.00');
  });

  it('puts a loss on the assets side', async () => {
    await saveVoucher(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      bookId: s.cashBookId,
      kind: 'payment',
      date: '2026-06-01',
      lines: [{ ledgerId: rent, side: 'Dr', amount: '5000' }],
      actorId: null,
    });
    const bs = await balanceSheet(db, P());
    expect(bs.netProfit).toBe('-2400.00');
    expect(bs.totalAssets).toBe(bs.totalLiabilities);
    expect(bs.difference).toBe('0.00');
  });
});
