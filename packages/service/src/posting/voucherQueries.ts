import { AppError, toPaise, type AdjustmentKind, type Side, type VoucherKind } from '@sas/shared';
import type { Queryable } from '../db/types';

export interface VoucherView {
  id: string;
  companyId: string;
  yearId: string;
  bookId: string;
  kind: VoucherKind;
  voucherNo: number;
  date: string;
  narration: string | null;
  version: number;
  lines: {
    lineNo: number;
    ledgerId: string;
    ledgerName: string;
    side: Side;
    amount: string;
    narration: string | null;
    adjustments: { billId: string; amount: string; kind: AdjustmentKind }[];
  }[];
}

export async function getVoucher(q: Queryable, voucherId: string): Promise<VoucherView> {
  const headers = await q.query<{
    id: string;
    company_id: string;
    year_id: string;
    book_id: string;
    kind: VoucherKind;
    voucher_no: number;
    voucher_date: string;
    narration: string | null;
    version: number;
  }>(
    `SELECT id, company_id, year_id, book_id, kind, voucher_no, voucher_date, narration, version
     FROM vouchers WHERE id = $1`,
    [voucherId],
  );
  const v = headers[0];
  if (!v) throw new AppError('NOT_FOUND', 'Voucher not found');

  const lines = await q.query<{
    id: string;
    line_no: number;
    ledger_id: string;
    ledger_name: string;
    debit: string;
    credit: string;
    narration: string | null;
  }>(
    `SELECT vl.id, vl.line_no, vl.ledger_id, l.name AS ledger_name, vl.debit, vl.credit, vl.narration
     FROM voucher_lines vl JOIN ledgers l ON l.id = vl.ledger_id
     WHERE vl.voucher_id = $1 ORDER BY vl.line_no`,
    [voucherId],
  );
  const adjustments = await q.query<{ voucher_line_id: string; bill_id: string; amount: string; kind: AdjustmentKind }>(
    'SELECT voucher_line_id, bill_id, amount, kind FROM bill_adjustments WHERE voucher_id = $1',
    [voucherId],
  );

  return {
    id: v.id,
    companyId: v.company_id,
    yearId: v.year_id,
    bookId: v.book_id,
    kind: v.kind,
    voucherNo: v.voucher_no,
    date: v.voucher_date,
    narration: v.narration,
    version: v.version,
    lines: lines.map((l) => {
      const isDebit = toPaise(l.debit) > 0n;
      return {
        lineNo: l.line_no,
        ledgerId: l.ledger_id,
        ledgerName: l.ledger_name,
        side: isDebit ? 'Dr' : 'Cr',
        amount: isDebit ? l.debit : l.credit,
        narration: l.narration,
        adjustments: adjustments
          .filter((a) => a.voucher_line_id === l.id)
          .map((a) => ({ billId: a.bill_id, amount: a.amount, kind: a.kind })),
      };
    }),
  };
}

export interface VoucherSummary {
  id: string;
  voucherNo: number;
  date: string;
  kind: VoucherKind;
  bookCode: string;
  narration: string | null;
  total: string;
}

export async function listVouchers(
  q: Queryable,
  p: {
    companyId: string;
    yearId: string;
    bookId?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
    hiddenGroupIds?: string[];
  },
): Promise<VoucherSummary[]> {
  const rows = await q.query<{
    id: string;
    voucher_no: number;
    voucher_date: string;
    kind: VoucherKind;
    book_code: string;
    narration: string | null;
    total: string;
  }>(
    `SELECT v.id, v.voucher_no, v.voucher_date, v.kind, b.code AS book_code, v.narration,
            (SELECT COALESCE(SUM(e.debit), 0) FROM ledger_entries e WHERE e.voucher_id = v.id) AS total
     FROM vouchers v JOIN books b ON b.id = v.book_id
     WHERE v.company_id = $1 AND v.year_id = $2
       AND ($3::uuid IS NULL OR v.book_id = $3)
       AND ($4::date IS NULL OR v.voucher_date >= $4)
       AND ($5::date IS NULL OR v.voucher_date <= $5)
       AND NOT EXISTS (
         SELECT 1 FROM voucher_lines vl JOIN ledgers l ON l.id = vl.ledger_id
         WHERE vl.voucher_id = v.id AND l.group_id = ANY($8::uuid[]))
     ORDER BY v.voucher_date DESC, v.voucher_no DESC
     LIMIT $6 OFFSET $7`,
    [
      p.companyId,
      p.yearId,
      p.bookId ?? null,
      p.from ?? null,
      p.to ?? null,
      Math.min(p.limit ?? 50, 500),
      p.offset ?? 0,
      p.hiddenGroupIds ?? [],
    ],
  );
  return rows.map((r) => ({
    id: r.id,
    voucherNo: r.voucher_no,
    date: r.voucher_date,
    kind: r.kind,
    bookCode: r.book_code,
    narration: r.narration,
    total: r.total,
  }));
}
