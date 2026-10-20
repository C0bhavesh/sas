import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/types';
import { deleteVoucher, saveVoucher, updateVoucher } from '../posting/voucherService';
import { seedCompany, type SeededCompany } from '../testing/fixtures';
import { createTestDb } from '../testing/testDb';
import { applyOnAccount, listOnAccount, listPendingBills, pendingOf, registerBill } from './billService';

let db: Db;
let s: SeededCompany;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedCompany(db);
});
afterEach(async () => {
  await db.close();
});

function bill(billNo: string, amount: string, billDate = '2026-04-10') {
  return registerBill(db, {
    companyId: s.companyId,
    yearId: s.yearId,
    ledgerId: s.partyLedgerId,
    billNo,
    billDate,
    amount,
    side: 'Dr', // a sales bill on a debtor
  });
}

function receipt(lineAmount: string, adjustments: { billId: string; amount: string; kind?: 'cash' | 'discount' }[]) {
  return {
    companyId: s.companyId,
    yearId: s.yearId,
    bookId: s.cashBookId,
    kind: 'receipt' as const,
    date: '2026-05-10',
    lines: [
      {
        ledgerId: s.partyLedgerId,
        side: 'Cr' as const,
        amount: lineAmount,
        adjustments: adjustments.map((a) => ({ billId: a.billId, amount: a.amount, kind: a.kind ?? ('cash' as const) })),
      },
    ],
    actorId: null,
  };
}

describe('registerBill / pendingOf', () => {
  it('a new bill is fully pending', async () => {
    const id = await bill('S-1', '5000.00');
    expect(await pendingOf(db, id)).toBe('5000.00');
  });

  it('rejects a duplicate bill number on the same ledger and side', async () => {
    await bill('S-1', '10.00');
    await expect(bill('S-1', '20.00')).rejects.toThrow();
  });
});

describe('receipt against a bill', () => {
  it('reduces pending by the adjusted amount', async () => {
    const id = await bill('S-1', '5000.00');
    await saveVoucher(db, receipt('3000.00', [{ billId: id, amount: '3000.00' }]));
    expect(await pendingOf(db, id)).toBe('2000.00');
  });

  it('settles one receipt across several bills', async () => {
    const a = await bill('S-1', '1000.00');
    const b = await bill('S-2', '2000.00');
    await saveVoucher(db, receipt('2500.00', [{ billId: a, amount: '1000.00' }, { billId: b, amount: '1500.00' }]));
    expect(await pendingOf(db, a)).toBe('0.00');
    expect(await pendingOf(db, b)).toBe('500.00');
    expect((await listPendingBills(db, s.companyId, s.partyLedgerId)).map((p) => p.billNo)).toEqual(['S-2']);
  });

  it('rejects an adjustment larger than the pending amount', async () => {
    const id = await bill('S-1', '100.00');
    await expect(saveVoucher(db, receipt('150.00', [{ billId: id, amount: '150.00' }]))).rejects.toMatchObject({
      code: 'ADJUSTMENT_INVALID',
    });
    expect(await pendingOf(db, id)).toBe('100.00');
  });

  it('rejects adjustments that add up to more than the line', async () => {
    const id = await bill('S-1', '500.00');
    await expect(saveVoucher(db, receipt('100.00', [{ billId: id, amount: '200.00' }]))).rejects.toMatchObject({
      code: 'ADJUSTMENT_EXCEEDS_LINE',
    });
  });

  it('rejects a bill that belongs to another account', async () => {
    const other = await registerBill(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      ledgerId: s.discountLedgerId,
      billNo: 'X-1',
      billDate: '2026-04-10',
      amount: '100.00',
      side: 'Dr',
    });
    await expect(saveVoucher(db, receipt('50.00', [{ billId: other, amount: '50.00' }]))).rejects.toMatchObject({
      code: 'ADJUSTMENT_INVALID',
    });
  });

  it('rejects a payment (debit) line against a debit bill — wrong side', async () => {
    const id = await bill('S-1', '100.00');
    await expect(
      saveVoucher(db, {
        companyId: s.companyId,
        yearId: s.yearId,
        bookId: s.cashBookId,
        kind: 'payment',
        date: '2026-05-10',
        lines: [
          {
            ledgerId: s.partyLedgerId,
            side: 'Dr',
            amount: '50.00',
            adjustments: [{ billId: id, amount: '50.00', kind: 'cash' }],
          },
        ],
        actorId: null,
      }),
    ).rejects.toMatchObject({ code: 'ADJUSTMENT_INVALID' });
  });

  it('a journal credit to the party can settle a bill by discount', async () => {
    const id = await bill('S-1', '1000.00');
    await saveVoucher(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      bookId: s.journalBookId,
      kind: 'journal',
      date: '2026-05-10',
      lines: [
        { ledgerId: s.discountLedgerId, side: 'Dr', amount: '100.00' },
        {
          ledgerId: s.partyLedgerId,
          side: 'Cr',
          amount: '100.00',
          adjustments: [{ billId: id, amount: '100.00', kind: 'discount' }],
        },
      ],
      actorId: null,
    });
    expect(await pendingOf(db, id)).toBe('900.00');
  });

  it('editing the receipt re-adjusts; deleting it restores the full pending amount', async () => {
    const id = await bill('S-1', '5000.00');
    const { voucherId } = await saveVoucher(db, receipt('3000.00', [{ billId: id, amount: '3000.00' }]));
    await updateVoucher(db, voucherId, 1, {
      date: '2026-05-10',
      lines: receipt('1000.00', [{ billId: id, amount: '1000.00' }]).lines,
      actorId: null,
    });
    expect(await pendingOf(db, id)).toBe('4000.00');
    await deleteVoucher(db, voucherId, 2, null);
    expect(await pendingOf(db, id)).toBe('5000.00');
  });
});

describe('on-account money', () => {
  it('the unadjusted rest of a receipt line becomes on-account', async () => {
    const id = await bill('S-1', '3000.00');
    await saveVoucher(db, receipt('4000.00', [{ billId: id, amount: '3000.00' }]));
    const rows = await listOnAccount(db, s.companyId, s.partyLedgerId);
    expect(rows).toEqual([expect.objectContaining({ side: 'Cr', amount: '1000.00', remaining: '1000.00' })]);
  });

  it('a receipt with no adjustments is entirely on-account', async () => {
    await saveVoucher(db, receipt('700.00', []));
    const rows = await listOnAccount(db, s.companyId, s.partyLedgerId);
    expect(rows[0]?.amount).toBe('700.00');
  });

  it('can be applied to a later bill, partly, and not beyond what remains', async () => {
    await saveVoucher(db, receipt('1000.00', []));
    const [oa] = await listOnAccount(db, s.companyId, s.partyLedgerId);
    const later = await bill('S-9', '600.00', '2026-06-01');
    await applyOnAccount(db, oa!.id, later, '400.00');
    expect(await pendingOf(db, later)).toBe('200.00');
    expect((await listOnAccount(db, s.companyId, s.partyLedgerId))[0]?.remaining).toBe('600.00');
    await expect(applyOnAccount(db, oa!.id, later, '300.00')).rejects.toMatchObject({ code: 'ADJUSTMENT_INVALID' });
  });

  it('a voucher whose on-account money was applied cannot be edited or deleted', async () => {
    const { voucherId } = await saveVoucher(db, receipt('1000.00', []));
    const [oa] = await listOnAccount(db, s.companyId, s.partyLedgerId);
    const later = await bill('S-9', '600.00', '2026-06-01');
    await applyOnAccount(db, oa!.id, later, '100.00');
    await expect(deleteVoucher(db, voucherId, 1, null)).rejects.toMatchObject({ code: 'ON_ACCOUNT_USED' });
    await expect(
      updateVoucher(db, voucherId, 1, { date: '2026-05-10', lines: receipt('5.00', []).lines, actorId: null }),
    ).rejects.toMatchObject({ code: 'ON_ACCOUNT_USED' });
  });
});

describe('listPendingBills', () => {
  it('lists oldest bills first with original and pending amounts', async () => {
    await bill('S-2', '200.00', '2026-05-01');
    const first = await bill('S-1', '100.00', '2026-04-01');
    await saveVoucher(db, receipt('40.00', [{ billId: first, amount: '40.00' }]));
    const rows = await listPendingBills(db, s.companyId, s.partyLedgerId);
    expect(rows.map((r) => [r.billNo, r.original, r.pending])).toEqual([
      ['S-1', '100.00', '60.00'],
      ['S-2', '200.00', '200.00'],
    ]);
  });
});
