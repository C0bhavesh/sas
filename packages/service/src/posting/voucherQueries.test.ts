import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/types';
import { registerBill } from '../outstanding/billService';
import { seedCompany, type SeededCompany } from '../testing/fixtures';
import { createTestDb } from '../testing/testDb';
import { getVoucher, listVouchers } from './voucherQueries';
import { saveVoucher } from './voucherService';

let db: Db;
let s: SeededCompany;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedCompany(db);
});
afterEach(async () => {
  await db.close();
});

const base = () => ({ companyId: s.companyId, yearId: s.yearId, actorId: null });

describe('getVoucher', () => {
  it('returns header, lines with names and sides, and bill adjustments', async () => {
    const billId = await registerBill(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      ledgerId: s.partyLedgerId,
      billNo: 'S-1',
      billDate: '2026-04-10',
      amount: '500',
      side: 'Dr',
    });
    const { voucherId } = await saveVoucher(db, {
      ...base(),
      bookId: s.cashBookId,
      kind: 'receipt',
      date: '2026-05-10',
      narration: 'part payment',
      lines: [
        {
          ledgerId: s.partyLedgerId,
          side: 'Cr',
          amount: '300.00',
          adjustments: [{ billId, amount: '300.00', kind: 'cash' }],
        },
      ],
    });
    const v = await getVoucher(db, voucherId);
    expect(v).toMatchObject({ voucherNo: 1, date: '2026-05-10', kind: 'receipt', narration: 'part payment', version: 1 });
    expect(v.lines).toEqual([
      {
        lineNo: 1,
        ledgerId: s.partyLedgerId,
        ledgerName: 'Ramesh Traders',
        side: 'Cr',
        amount: '300.00',
        narration: null,
        adjustments: [{ billId, amount: '300.00', kind: 'cash' }],
      },
    ]);
  });

  it('throws NOT_FOUND for an unknown voucher', async () => {
    await expect(getVoucher(db, '00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('listVouchers', () => {
  async function three() {
    for (const [i, date] of ['2026-05-01', '2026-05-02', '2026-05-03'].entries()) {
      await saveVoucher(db, {
        ...base(),
        bookId: s.cashBookId,
        kind: 'receipt',
        date,
        lines: [{ ledgerId: s.partyLedgerId, side: 'Cr', amount: `${(i + 1) * 100}` }],
      });
    }
  }

  it('lists newest first with the total', async () => {
    await three();
    const rows = await listVouchers(db, { companyId: s.companyId, yearId: s.yearId });
    expect(rows.map((r) => [r.voucherNo, r.date, r.total, r.bookCode])).toEqual([
      [3, '2026-05-03', '300.00', 'CB'],
      [2, '2026-05-02', '200.00', 'CB'],
      [1, '2026-05-01', '100.00', 'CB'],
    ]);
  });

  it('filters by date range and pages', async () => {
    await three();
    const p = { companyId: s.companyId, yearId: s.yearId };
    expect((await listVouchers(db, { ...p, from: '2026-05-02', to: '2026-05-02' })).map((r) => r.voucherNo)).toEqual([2]);
    expect((await listVouchers(db, { ...p, limit: 1, offset: 1 })).map((r) => r.voucherNo)).toEqual([2]);
    expect(await listVouchers(db, { ...p, bookId: s.journalBookId })).toEqual([]);
  });

  it('leaves out vouchers that touch a hidden group', async () => {
    await three();
    const g = await db.query<{ id: string }>('SELECT id FROM account_groups WHERE company_id = $1 AND code = 42', [
      s.companyId,
    ]);
    const rows = await listVouchers(db, { companyId: s.companyId, yearId: s.yearId, hiddenGroupIds: [g[0]!.id] });
    expect(rows).toEqual([]);
  });
});
