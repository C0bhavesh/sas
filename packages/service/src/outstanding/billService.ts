import { randomUUID } from 'node:crypto';
import {
  ADJUSTMENT_KINDS,
  fromPaise,
  toPaise,
  VoucherError,
  type BillAdjustmentInput,
  type Side,
} from '@sas/shared';
import type { Db, Queryable } from '../db/types';

export interface NewBill {
  companyId: string;
  yearId: string;
  ledgerId: string;
  billNo: string;
  billDate: string;
  dueDate?: string;
  amount: string;
  side: Side;
}

export interface PendingBill {
  id: string;
  billNo: string;
  billDate: string;
  dueDate: string | null;
  side: Side;
  original: string;
  pending: string;
}

export interface LineAdjustmentParams {
  companyId: string;
  voucherId: string;
  lineId: string;
  ledgerId: string;
  side: Side;
  lineAmount: bigint;
  adjustments: BillAdjustmentInput[];
}

function positiveAmount(text: string): bigint {
  let amt: bigint;
  try {
    amt = toPaise(text);
  } catch {
    throw new VoucherError('ADJUSTMENT_INVALID', `Invalid adjustment amount "${text}"`);
  }
  if (amt <= 0n) throw new VoucherError('ADJUSTMENT_INVALID', 'Adjustment must be greater than zero');
  return amt;
}

export async function registerBill(q: Queryable, bill: NewBill): Promise<string> {
  const id = randomUUID();
  await q.query(
    `INSERT INTO outstanding_bills(id, company_id, year_id, ledger_id, bill_no, bill_date, due_date, original_amount, side)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      bill.companyId,
      bill.yearId,
      bill.ledgerId,
      bill.billNo,
      bill.billDate,
      bill.dueDate ?? null,
      fromPaise(toPaise(bill.amount)),
      bill.side,
    ],
  );
  return id;
}

export async function pendingOf(q: Queryable, billId: string): Promise<string> {
  const rows = await q.query<{ pending: string }>(
    `SELECT b.original_amount - COALESCE(SUM(a.amount), 0) AS pending
     FROM outstanding_bills b LEFT JOIN bill_adjustments a ON a.bill_id = b.id
     WHERE b.id = $1 GROUP BY b.id`,
    [billId],
  );
  if (!rows[0]) throw new VoucherError('ADJUSTMENT_INVALID', 'Bill not found');
  return rows[0].pending;
}

export async function listPendingBills(q: Queryable, companyId: string, ledgerId: string): Promise<PendingBill[]> {
  const rows = await q.query<{
    id: string;
    bill_no: string;
    bill_date: string;
    due_date: string | null;
    side: Side;
    original: string;
    pending: string;
  }>(
    `SELECT b.id, b.bill_no, b.bill_date, b.due_date, b.side,
            b.original_amount AS original,
            b.original_amount - COALESCE(SUM(a.amount), 0) AS pending
     FROM outstanding_bills b LEFT JOIN bill_adjustments a ON a.bill_id = b.id
     WHERE b.company_id = $1 AND b.ledger_id = $2
     GROUP BY b.id
     HAVING b.original_amount - COALESCE(SUM(a.amount), 0) > 0
     ORDER BY b.bill_date, b.bill_no`,
    [companyId, ledgerId],
  );
  return rows.map((r) => ({
    id: r.id,
    billNo: r.bill_no,
    billDate: r.bill_date,
    dueDate: r.due_date,
    side: r.side,
    original: r.original,
    pending: r.pending,
  }));
}

/** Settle bills from one voucher line. Returns the total adjusted, in paise. */
export async function applyLineAdjustments(tx: Queryable, p: LineAdjustmentParams): Promise<bigint> {
  let total = 0n;
  for (const a of p.adjustments) {
    if (!(ADJUSTMENT_KINDS as readonly string[]).includes(a.kind)) {
      throw new VoucherError('ADJUSTMENT_INVALID', `Unknown adjustment type "${a.kind}"`);
    }
    const amt = positiveAmount(a.amount);
    const bills = await tx.query<{ id: string; company_id: string; ledger_id: string; side: Side }>(
      'SELECT id, company_id, ledger_id, side FROM outstanding_bills WHERE id = $1 FOR UPDATE',
      [a.billId],
    );
    const bill = bills[0];
    if (!bill || bill.company_id !== p.companyId) throw new VoucherError('ADJUSTMENT_INVALID', 'Bill not found');
    if (bill.ledger_id !== p.ledgerId) {
      throw new VoucherError('ADJUSTMENT_INVALID', 'That bill belongs to a different account');
    }
    if (bill.side === p.side) {
      throw new VoucherError('ADJUSTMENT_INVALID', 'A line can only settle a bill from the opposite side');
    }
    const pending = toPaise(await pendingOf(tx, bill.id));
    if (amt > pending) {
      throw new VoucherError('ADJUSTMENT_INVALID', `Adjustment ${a.amount} is more than the pending ${fromPaise(pending)}`);
    }
    await tx.query(
      `INSERT INTO bill_adjustments(id, bill_id, voucher_id, voucher_line_id, amount, kind)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [randomUUID(), bill.id, p.voucherId, p.lineId, fromPaise(amt), a.kind],
    );
    total += amt;
  }
  if (total > p.lineAmount) {
    throw new VoucherError('ADJUSTMENT_EXCEEDS_LINE', 'Bill adjustments add up to more than the line amount');
  }
  return total;
}

/** Undo everything a voucher did to bills and on-account money. Refuses if its on-account money was used. */
export async function removeVoucherBillLinks(tx: Queryable, voucherId: string): Promise<void> {
  const used = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM bill_adjustments a
     JOIN on_account o ON o.id = a.on_account_id WHERE o.voucher_id = $1`,
    [voucherId],
  );
  if ((used[0]?.n ?? 0) > 0) {
    throw new VoucherError(
      'ON_ACCOUNT_USED',
      'Money from this voucher was already adjusted against bills. Undo that first.',
    );
  }
  await tx.query('DELETE FROM bill_adjustments WHERE voucher_id = $1', [voucherId]);
  await tx.query('DELETE FROM on_account WHERE voucher_id = $1', [voucherId]);
}

export async function listOnAccount(
  q: Queryable,
  companyId: string,
  ledgerId: string,
): Promise<{ id: string; side: Side; amount: string; remaining: string }[]> {
  return q.query(
    `SELECT o.id, o.side, o.amount, o.amount - COALESCE(SUM(a.amount), 0) AS remaining
     FROM on_account o LEFT JOIN bill_adjustments a ON a.on_account_id = o.id
     WHERE o.company_id = $1 AND o.ledger_id = $2
     GROUP BY o.id
     HAVING o.amount - COALESCE(SUM(a.amount), 0) > 0
     ORDER BY o.id`,
    [companyId, ledgerId],
  );
}

/** Match part or all of an on-account amount to a bill of the same account on the opposite side. */
export async function applyOnAccount(db: Db, onAccountId: string, billId: string, amount: string): Promise<void> {
  const amt = positiveAmount(amount);
  await db.transaction(async (tx) => {
    const oas = await tx.query<{ id: string; company_id: string; ledger_id: string; side: Side; amount: string }>(
      'SELECT id, company_id, ledger_id, side, amount FROM on_account WHERE id = $1 FOR UPDATE',
      [onAccountId],
    );
    const oa = oas[0];
    if (!oa) throw new VoucherError('ADJUSTMENT_INVALID', 'On-account entry not found');
    const bills = await tx.query<{ id: string; company_id: string; ledger_id: string; side: Side }>(
      'SELECT id, company_id, ledger_id, side FROM outstanding_bills WHERE id = $1 FOR UPDATE',
      [billId],
    );
    const bill = bills[0];
    if (!bill || bill.company_id !== oa.company_id) throw new VoucherError('ADJUSTMENT_INVALID', 'Bill not found');
    if (bill.ledger_id !== oa.ledger_id) {
      throw new VoucherError('ADJUSTMENT_INVALID', 'That bill belongs to a different account');
    }
    if (bill.side === oa.side) {
      throw new VoucherError('ADJUSTMENT_INVALID', 'On-account money can only settle a bill from the opposite side');
    }
    const used = await tx.query<{ used: string }>(
      'SELECT COALESCE(SUM(amount), 0) AS used FROM bill_adjustments WHERE on_account_id = $1',
      [onAccountId],
    );
    const remaining = toPaise(oa.amount) - toPaise(used[0]!.used);
    if (amt > remaining) {
      throw new VoucherError('ADJUSTMENT_INVALID', `Only ${fromPaise(remaining)} is left on account`);
    }
    const pending = toPaise(await pendingOf(tx, bill.id));
    if (amt > pending) {
      throw new VoucherError('ADJUSTMENT_INVALID', `Adjustment ${amount} is more than the pending ${fromPaise(pending)}`);
    }
    await tx.query(
      `INSERT INTO bill_adjustments(id, bill_id, on_account_id, amount, kind) VALUES ($1,$2,$3,$4,'cash')`,
      [randomUUID(), bill.id, onAccountId, fromPaise(amt)],
    );
  });
}
