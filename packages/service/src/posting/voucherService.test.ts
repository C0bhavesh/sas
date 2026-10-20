import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/types';
import { seedCompany, type SeededCompany } from '../testing/fixtures';
import { createTestDb } from '../testing/testDb';
import { deleteVoucher, saveVoucher, updateVoucher } from './voucherService';

let db: Db;
let s: SeededCompany;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedCompany(db);
});
afterEach(async () => {
  await db.close();
});

function receipt(amount: string, date = '2026-05-10') {
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

async function entries(voucherId: string) {
  return db.query<{ ledger_id: string; debit: string; credit: string }>(
    'SELECT ledger_id, debit, credit FROM ledger_entries WHERE voucher_id = $1 ORDER BY debit DESC, credit DESC',
    [voucherId],
  );
}

describe('saveVoucher', () => {
  it('posts a receipt as balanced double entry and numbers it from 1', async () => {
    const { voucherId, voucherNo } = await saveVoucher(db, receipt('1000.00'));
    expect(voucherNo).toBe(1);
    expect(await entries(voucherId)).toEqual([
      { ledger_id: s.cashLedgerId, debit: '1000.00', credit: '0.00' },
      { ledger_id: s.partyLedgerId, debit: '0.00', credit: '1000.00' },
    ]);
    const second = await saveVoucher(db, receipt('5.00'));
    expect(second.voucherNo).toBe(2);
  });

  it('rejects an unbalanced journal and does not consume a number', async () => {
    const bad = {
      companyId: s.companyId,
      yearId: s.yearId,
      bookId: s.journalBookId,
      kind: 'journal' as const,
      date: '2026-05-10',
      lines: [
        { ledgerId: s.partyLedgerId, side: 'Dr' as const, amount: '100.00' },
        { ledgerId: s.discountLedgerId, side: 'Cr' as const, amount: '99.00' },
      ],
      actorId: null,
    };
    await expect(saveVoucher(db, bad)).rejects.toMatchObject({ code: 'NOT_BALANCED' });
    const count = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM vouchers');
    expect(count[0]?.n).toBe(0);
    const ok = await saveVoucher(db, { ...bad, lines: [bad.lines[0]!, { ...bad.lines[1]!, amount: '100.00' }] });
    expect(ok.voucherNo).toBe(1);
  });

  it('rejects a date outside the financial year', async () => {
    await expect(saveVoucher(db, receipt('10', '2027-04-01'))).rejects.toMatchObject({ code: 'DATE_OUT_OF_YEAR' });
    await expect(saveVoucher(db, receipt('10', '2026-03-31'))).rejects.toMatchObject({ code: 'DATE_OUT_OF_YEAR' });
  });

  it('rejects a malformed date', async () => {
    await expect(saveVoucher(db, receipt('10', '10-05-2026'))).rejects.toMatchObject({ code: 'BAD_DATE' });
  });

  it('rejects a date on or before the company freeze date', async () => {
    await db.query(`UPDATE companies SET freeze_date = '2026-06-30' WHERE id = $1`, [s.companyId]);
    await expect(saveVoucher(db, receipt('10', '2026-06-30'))).rejects.toMatchObject({ code: 'PERIOD_FROZEN' });
    await expect(saveVoucher(db, receipt('10', '2026-07-01'))).resolves.toBeTruthy();
  });

  it('rejects a closed year', async () => {
    await db.query(`UPDATE financial_years SET status = 'closed' WHERE id = $1`, [s.yearId]);
    await expect(saveVoucher(db, receipt('10'))).rejects.toMatchObject({ code: 'YEAR_LOCKED' });
  });

  it('rejects a receipt on a journal book and a journal on a cash book', async () => {
    await expect(saveVoucher(db, { ...receipt('10'), bookId: s.journalBookId })).rejects.toMatchObject({
      code: 'BOOK_KIND_MISMATCH',
    });
  });

  it('rejects a blocked ledger', async () => {
    await db.query(`UPDATE ledgers SET status = 'blocked' WHERE id = $1`, [s.partyLedgerId]);
    await expect(saveVoucher(db, receipt('10'))).rejects.toMatchObject({ code: 'LEDGER_INVALID' });
  });
});

describe('updateVoucher', () => {
  it('replaces lines and entries, bumps the version, and keeps the number', async () => {
    const { voucherId } = await saveVoucher(db, receipt('1000.00'));
    const r = await updateVoucher(db, voucherId, 1, {
      date: '2026-05-11',
      lines: [{ ledgerId: s.partyLedgerId, side: 'Cr', amount: '400.00' }],
      actorId: null,
    });
    expect(r.version).toBe(2);
    expect(await entries(voucherId)).toEqual([
      { ledger_id: s.cashLedgerId, debit: '400.00', credit: '0.00' },
      { ledger_id: s.partyLedgerId, debit: '0.00', credit: '400.00' },
    ]);
    const v = await db.query<{ voucher_no: number; voucher_date: string }>(
      'SELECT voucher_no, voucher_date FROM vouchers WHERE id = $1',
      [voucherId],
    );
    expect(v[0]).toEqual({ voucher_no: 1, voucher_date: '2026-05-11' });
  });

  it('refuses a stale version', async () => {
    const { voucherId } = await saveVoucher(db, receipt('1000.00'));
    await updateVoucher(db, voucherId, 1, {
      date: '2026-05-10',
      lines: [{ ledgerId: s.partyLedgerId, side: 'Cr', amount: '1.00' }],
      actorId: null,
    });
    await expect(
      updateVoucher(db, voucherId, 1, {
        date: '2026-05-10',
        lines: [{ ledgerId: s.partyLedgerId, side: 'Cr', amount: '2.00' }],
        actorId: null,
      }),
    ).rejects.toMatchObject({ code: 'STALE_VERSION' });
  });

  it('refuses to edit a voucher that sits in a frozen period', async () => {
    const { voucherId } = await saveVoucher(db, receipt('1000.00', '2026-05-10'));
    await db.query(`UPDATE companies SET freeze_date = '2026-05-31' WHERE id = $1`, [s.companyId]);
    await expect(
      updateVoucher(db, voucherId, 1, {
        date: '2026-06-15',
        lines: [{ ledgerId: s.partyLedgerId, side: 'Cr', amount: '1.00' }],
        actorId: null,
      }),
    ).rejects.toMatchObject({ code: 'PERIOD_FROZEN' });
  });

  it('a failed update leaves the original untouched', async () => {
    const { voucherId } = await saveVoucher(db, receipt('1000.00'));
    await expect(
      updateVoucher(db, voucherId, 1, {
        date: '2026-05-10',
        lines: [{ ledgerId: s.partyLedgerId, side: 'Dr', amount: '5.00' }], // wrong side for a receipt
        actorId: null,
      }),
    ).rejects.toMatchObject({ code: 'WRONG_SIDE' });
    expect(await entries(voucherId)).toHaveLength(2);
    const v = await db.query<{ version: number }>('SELECT version FROM vouchers WHERE id = $1', [voucherId]);
    expect(v[0]?.version).toBe(1);
  });
});

describe('deleteVoucher', () => {
  it('removes the voucher, its lines and its entries', async () => {
    const { voucherId } = await saveVoucher(db, receipt('1000.00'));
    await deleteVoucher(db, voucherId, 1, null);
    for (const table of ['vouchers', 'voucher_lines', 'ledger_entries']) {
      const col = table === 'vouchers' ? 'id' : 'voucher_id';
      const n = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE ${col} = $1`, [voucherId]);
      expect(n[0]?.n).toBe(0);
    }
  });

  it('refuses a stale version and an unknown voucher', async () => {
    const { voucherId } = await saveVoucher(db, receipt('1.00'));
    await expect(deleteVoucher(db, voucherId, 7, null)).rejects.toMatchObject({ code: 'STALE_VERSION' });
    await expect(
      deleteVoucher(db, '00000000-0000-4000-8000-000000000000', 1, null),
    ).rejects.toMatchObject({ code: 'VOUCHER_NOT_FOUND' });
  });
});

describe('ledger always balances', () => {
  it('total debits equal total credits after a mix of saves, edits and deletes', async () => {
    const a = await saveVoucher(db, receipt('100.00'));
    const b = await saveVoucher(db, receipt('250.75'));
    await updateVoucher(db, a.voucherId, 1, {
      date: '2026-05-12',
      lines: [{ ledgerId: s.partyLedgerId, side: 'Cr', amount: '120.10' }],
      actorId: null,
    });
    await deleteVoucher(db, b.voucherId, 1, null);
    const t = await db.query<{ dr: string; cr: string }>(
      'SELECT COALESCE(SUM(debit),0) AS dr, COALESCE(SUM(credit),0) AS cr FROM ledger_entries',
    );
    expect(t[0]?.dr).toBe(t[0]?.cr);
    expect(t[0]?.dr).toBe('120.10');
  });
});
