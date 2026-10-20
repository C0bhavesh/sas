import { AppError, fromPaise, toPaise } from '@sas/shared';
import type { Queryable } from '../db/types';
import { assertIsoDate, fromDrCr, toDrCr, type DrCr } from './format';

export interface LedgerReportRow {
  date: string;
  voucherNo: number;
  bookCode: string;
  narration: string | null;
  debit: string;
  credit: string;
  balance: DrCr;
}

export interface LedgerReport {
  ledgerName: string;
  opening: DrCr;
  rows: LedgerReportRow[];
  totalDebit: string;
  totalCredit: string;
  closing: DrCr;
}

export interface LedgerReportParams {
  companyId: string;
  yearId: string;
  ledgerId: string;
  from: string;
  to: string;
}

export async function ledgerReport(q: Queryable, p: LedgerReportParams): Promise<LedgerReport> {
  assertIsoDate(p.from);
  assertIsoDate(p.to);
  const ledgers = await q.query<{ name: string }>('SELECT name FROM ledgers WHERE id = $1 AND company_id = $2', [
    p.ledgerId,
    p.companyId,
  ]);
  if (!ledgers[0]) throw new AppError('NOT_FOUND', 'Ledger not found');

  const opening = await q.query<{ signed: string }>(
    `SELECT COALESCE(SUM(CASE WHEN side = 'Dr' THEN amount ELSE -amount END), 0) AS signed
     FROM ledger_openings WHERE ledger_id = $1 AND year_id = $2`,
    [p.ledgerId, p.yearId],
  );
  const prior = await q.query<{ net: string }>(
    `SELECT COALESCE(SUM(debit - credit), 0) AS net FROM ledger_entries
     WHERE company_id = $1 AND year_id = $2 AND ledger_id = $3 AND entry_date < $4`,
    [p.companyId, p.yearId, p.ledgerId, p.from],
  );
  let running = toPaise(opening[0]!.signed) + toPaise(prior[0]!.net);
  const openingBalance = toDrCr(running);

  const entries = await q.query<{
    entry_date: string;
    voucher_no: number;
    book_code: string;
    narration: string | null;
    debit: string;
    credit: string;
  }>(
    `SELECT e.entry_date, v.voucher_no, b.code AS book_code, v.narration, e.debit, e.credit
     FROM ledger_entries e
     JOIN vouchers v ON v.id = e.voucher_id
     JOIN books b ON b.id = v.book_id
     WHERE e.company_id = $1 AND e.year_id = $2 AND e.ledger_id = $3 AND e.entry_date BETWEEN $4 AND $5
     ORDER BY e.entry_date, v.voucher_no, e.debit DESC, e.id`,
    [p.companyId, p.yearId, p.ledgerId, p.from, p.to],
  );

  let totalDebit = 0n;
  let totalCredit = 0n;
  const rows: LedgerReportRow[] = entries.map((e) => {
    const debit = toPaise(e.debit);
    const credit = toPaise(e.credit);
    totalDebit += debit;
    totalCredit += credit;
    running += debit - credit;
    return {
      date: e.entry_date,
      voucherNo: e.voucher_no,
      bookCode: e.book_code,
      narration: e.narration,
      debit: fromPaise(debit),
      credit: fromPaise(credit),
      balance: toDrCr(running),
    };
  });

  return {
    ledgerName: ledgers[0].name,
    opening: openingBalance,
    rows,
    totalDebit: fromPaise(totalDebit),
    totalCredit: fromPaise(totalCredit),
    closing: toDrCr(running),
  };
}

export interface CashBookDay {
  date: string;
  opening: DrCr;
  receipts: string;
  payments: string;
  closing: DrCr;
}

/** Rojmel: one line per day that has entries, for a cash or bank book. */
export async function cashBookDaily(
  q: Queryable,
  p: { companyId: string; yearId: string; bookId: string; from: string; to: string },
): Promise<CashBookDay[]> {
  const books = await q.query<{ default_ledger_id: string | null }>(
    'SELECT default_ledger_id FROM books WHERE id = $1 AND company_id = $2',
    [p.bookId, p.companyId],
  );
  if (!books[0]) throw new AppError('NOT_FOUND', 'Book not found');
  const ledgerId = books[0].default_ledger_id;
  if (!ledgerId) throw new AppError('INVALID_INPUT', 'This book has no cash or bank ledger');

  const report = await ledgerReport(q, { companyId: p.companyId, yearId: p.yearId, ledgerId, from: p.from, to: p.to });
  const days: CashBookDay[] = [];
  let running = fromDrCr(report.opening);
  for (const row of report.rows) {
    let day = days[days.length - 1];
    if (!day || day.date !== row.date) {
      day = { date: row.date, opening: toDrCr(running), receipts: '0.00', payments: '0.00', closing: toDrCr(running) };
      days.push(day);
    }
    const debit = toPaise(row.debit);
    const credit = toPaise(row.credit);
    running += debit - credit;
    day.receipts = fromPaise(toPaise(day.receipts) + debit);
    day.payments = fromPaise(toPaise(day.payments) + credit);
    day.closing = toDrCr(running);
  }
  return days;
}
