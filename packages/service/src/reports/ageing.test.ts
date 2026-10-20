import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/types';
import { registerBill } from '../outstanding/billService';
import { saveVoucher } from '../posting/voucherService';
import { seedCompany, type SeededCompany } from '../testing/fixtures';
import { createTestDb } from '../testing/testDb';
import { outstandingAgeing } from './ageing';

let db: Db;
let s: SeededCompany;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedCompany(db);
});
afterEach(async () => {
  await db.close();
});

function bill(billNo: string, amount: string, billDate: string) {
  return registerBill(db, {
    companyId: s.companyId,
    yearId: s.yearId,
    ledgerId: s.partyLedgerId,
    billNo,
    billDate,
    amount,
    side: 'Dr',
  });
}

describe('outstandingAgeing', () => {
  it('puts each pending bill into its age bucket', async () => {
    // as on 2026-12-31: 10 days, 50 days, 80 days and 200 days old
    await bill('S-1', '100.00', '2026-12-21');
    await bill('S-2', '200.00', '2026-11-11');
    await bill('S-3', '300.00', '2026-10-12');
    await bill('S-4', '400.00', '2026-06-14');
    const r = await outstandingAgeing(db, { companyId: s.companyId, asOn: '2026-12-31' });
    expect(r.bucketLabels).toEqual(['0-30', '31-60', '61-90', '90+']);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      ledgerName: 'Ramesh Traders',
      side: 'Dr',
      buckets: ['100.00', '200.00', '300.00', '400.00'],
      total: '1000.00',
      onAccount: '0.00',
      net: '1000.00',
    });
    expect(r.totals.total).toBe('1000.00');
  });

  it('counts only what is still pending after receipts', async () => {
    const id = await bill('S-1', '1000.00', '2026-12-21');
    await saveVoucher(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      bookId: s.cashBookId,
      kind: 'receipt',
      date: '2026-12-25',
      lines: [
        {
          ledgerId: s.partyLedgerId,
          side: 'Cr',
          amount: '700.00',
          adjustments: [{ billId: id, amount: '600.00', kind: 'cash' }],
        },
      ],
      actorId: null,
    });
    const r = await outstandingAgeing(db, { companyId: s.companyId, asOn: '2026-12-31' });
    expect(r.rows[0]).toMatchObject({ buckets: ['400.00', '0.00', '0.00', '0.00'], total: '400.00' });
    expect(r.rows[0]?.onAccount).toBe('100.00'); // 700 received, 600 adjusted
    expect(r.rows[0]?.net).toBe('300.00');
  });

  it('leaves out bills dated after the as-on date and settled bills', async () => {
    await bill('S-1', '100.00', '2027-01-15');
    const done = await bill('S-2', '50.00', '2026-12-01');
    await saveVoucher(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      bookId: s.cashBookId,
      kind: 'receipt',
      date: '2026-12-02',
      lines: [
        {
          ledgerId: s.partyLedgerId,
          side: 'Cr',
          amount: '50.00',
          adjustments: [{ billId: done, amount: '50.00', kind: 'cash' }],
        },
      ],
      actorId: null,
    });
    const r = await outstandingAgeing(db, { companyId: s.companyId, asOn: '2026-12-31' });
    expect(r.rows).toHaveLength(0);
    expect(r.totals.total).toBe('0.00');
  });

  it('filters by ledger and by side, and hides blocked groups', async () => {
    await bill('S-1', '100.00', '2026-12-21');
    const base = { companyId: s.companyId, asOn: '2026-12-31' };
    expect((await outstandingAgeing(db, { ...base, ledgerId: s.cashLedgerId })).rows).toHaveLength(0);
    expect((await outstandingAgeing(db, { ...base, side: 'Cr' })).rows).toHaveLength(0);
    expect((await outstandingAgeing(db, { ...base, side: 'Dr' })).rows).toHaveLength(1);
    const g = await db.query<{ id: string }>('SELECT id FROM account_groups WHERE company_id = $1 AND code = 42', [
      s.companyId,
    ]);
    expect((await outstandingAgeing(db, { ...base, hiddenGroupIds: [g[0]!.id] })).rows).toHaveLength(0);
  });

  it('supports custom bucket sizes', async () => {
    await bill('S-1', '100.00', '2026-12-21');
    const r = await outstandingAgeing(db, { companyId: s.companyId, asOn: '2026-12-31', bucketDays: [15] });
    expect(r.bucketLabels).toEqual(['0-15', '15+']);
    expect(r.rows[0]?.buckets).toEqual(['100.00', '0.00']);
  });
});
