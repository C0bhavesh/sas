import { randomUUID } from 'node:crypto';
import {
  buildEntries,
  fromPaise,
  toPaise,
  VoucherError,
  type VoucherKind,
  type VoucherLineInput,
} from '@sas/shared';
import type { Db, Queryable } from '../db/types';
import { applyLineAdjustments, removeVoucherBillLinks } from '../outstanding/billService';
import { writeAudit } from '../security/audit';
import { nextNumber } from './numbering';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface SaveVoucherInput {
  companyId: string;
  yearId: string;
  bookId: string;
  kind: VoucherKind;
  date: string;
  narration?: string;
  lines: VoucherLineInput[];
  actorId: string | null;
}

export interface UpdateVoucherPatch {
  date: string;
  narration?: string;
  lines: VoucherLineInput[];
  actorId: string | null;
}

interface VoucherRow {
  id: string;
  company_id: string;
  year_id: string;
  book_id: string;
  kind: VoucherKind;
  voucher_date: string;
  version: number;
}

/** The year must be open, the date inside it, and after the company's freeze date. */
async function assertPostable(tx: Queryable, companyId: string, yearId: string, date: string): Promise<void> {
  if (!DATE_RE.test(date)) throw new VoucherError('BAD_DATE', `Invalid date "${date}"`);
  const years = await tx.query<{ status: string; start_date: string; end_date: string }>(
    'SELECT status, start_date, end_date FROM financial_years WHERE id = $1 AND company_id = $2',
    [yearId, companyId],
  );
  const year = years[0];
  if (!year) throw new VoucherError('YEAR_NOT_FOUND', 'Financial year not found');
  if (year.status !== 'open') throw new VoucherError('YEAR_LOCKED', 'This financial year is not open');
  if (date < year.start_date || date > year.end_date) {
    throw new VoucherError('DATE_OUT_OF_YEAR', `${date} is outside ${year.start_date} to ${year.end_date}`);
  }
  const companies = await tx.query<{ freeze_date: string | null }>('SELECT freeze_date FROM companies WHERE id = $1', [
    companyId,
  ]);
  const freeze = companies[0]?.freeze_date;
  if (freeze && date <= freeze) throw new VoucherError('PERIOD_FROZEN', `Entries on or before ${freeze} are frozen`);
}

async function loadBookLedger(
  tx: Queryable,
  companyId: string,
  bookId: string,
  kind: VoucherKind,
): Promise<string | null> {
  const rows = await tx.query<{ type: string; default_ledger_id: string | null }>(
    'SELECT type, default_ledger_id FROM books WHERE id = $1 AND company_id = $2',
    [bookId, companyId],
  );
  const book = rows[0];
  if (!book) throw new VoucherError('BOOK_NOT_FOUND', 'Book not found');
  const allowed = kind === 'journal' ? ['journal'] : ['cash', 'bank'];
  if (!allowed.includes(book.type)) {
    throw new VoucherError('BOOK_KIND_MISMATCH', `A ${kind} cannot be entered in a ${book.type} book`);
  }
  return book.default_ledger_id;
}

interface Body {
  voucherId: string;
  companyId: string;
  yearId: string;
  date: string;
  kind: VoucherKind;
  bookLedgerId: string | null;
  lines: VoucherLineInput[];
}

/** Write voucher lines, bill adjustments, on-account leftovers and the ledger entries. */
async function writeBody(tx: Queryable, v: Body): Promise<void> {
  const entries = buildEntries(v.kind, v.bookLedgerId, v.lines);

  const ledgerIds = [...new Set(entries.map((e) => e.ledgerId))];
  const ok = await tx.query<{ id: string }>(
    `SELECT id FROM ledgers WHERE company_id = $1 AND status = 'active' AND id = ANY($2::uuid[])`,
    [v.companyId, ledgerIds],
  );
  if (ok.length !== ledgerIds.length) {
    throw new VoucherError('LEDGER_INVALID', 'A ledger is missing, blocked, or belongs to another company');
  }

  for (const [i, line] of v.lines.entries()) {
    const amt = toPaise(line.amount);
    const lineId = randomUUID();
    await tx.query(
      `INSERT INTO voucher_lines(id, voucher_id, line_no, ledger_id, debit, credit, narration)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        lineId,
        v.voucherId,
        i + 1,
        line.ledgerId,
        line.side === 'Dr' ? fromPaise(amt) : '0.00',
        line.side === 'Cr' ? fromPaise(amt) : '0.00',
        line.narration ?? null,
      ],
    );
    const adjusted = await applyLineAdjustments(tx, {
      companyId: v.companyId,
      voucherId: v.voucherId,
      lineId,
      ledgerId: line.ledgerId,
      side: line.side,
      lineAmount: amt,
      adjustments: line.adjustments ?? [],
    });
    if (v.kind !== 'journal' && amt - adjusted > 0n) {
      await tx.query(
        `INSERT INTO on_account(id, company_id, year_id, voucher_id, ledger_id, side, amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [randomUUID(), v.companyId, v.yearId, v.voucherId, line.ledgerId, line.side, fromPaise(amt - adjusted)],
      );
    }
  }

  for (const e of entries) {
    await tx.query(
      `INSERT INTO ledger_entries(id, company_id, year_id, voucher_id, ledger_id, entry_date, debit, credit)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [randomUUID(), v.companyId, v.yearId, v.voucherId, e.ledgerId, v.date, fromPaise(e.debit), fromPaise(e.credit)],
    );
  }
}

async function clearBody(tx: Queryable, voucherId: string): Promise<void> {
  await removeVoucherBillLinks(tx, voucherId);
  await tx.query('DELETE FROM ledger_entries WHERE voucher_id = $1', [voucherId]);
  await tx.query('DELETE FROM voucher_lines WHERE voucher_id = $1', [voucherId]);
}

async function lockVoucher(tx: Queryable, voucherId: string, expectedVersion: number): Promise<VoucherRow> {
  const rows = await tx.query<VoucherRow>(
    `SELECT id, company_id, year_id, book_id, kind, voucher_date, version
     FROM vouchers WHERE id = $1 FOR UPDATE`,
    [voucherId],
  );
  const v = rows[0];
  if (!v) throw new VoucherError('VOUCHER_NOT_FOUND', 'Voucher not found');
  if (v.version !== expectedVersion) {
    throw new VoucherError('STALE_VERSION', 'This voucher was changed by someone else. Reload and try again.');
  }
  return v;
}

/** The voucher as the audit log stores it. */
async function snapshot(tx: Queryable, voucherId: string) {
  const header = (
    await tx.query<{ voucher_no: number; voucher_date: string; kind: string; narration: string | null }>(
      'SELECT voucher_no, voucher_date, kind, narration FROM vouchers WHERE id = $1',
      [voucherId],
    )
  )[0]!;
  const lines = await tx.query<{ ledger_id: string; debit: string; credit: string }>(
    'SELECT ledger_id, debit, credit FROM voucher_lines WHERE voucher_id = $1 ORDER BY line_no',
    [voucherId],
  );
  return {
    voucherNo: header.voucher_no,
    date: header.voucher_date,
    kind: header.kind,
    narration: header.narration,
    lines: lines.map((l) => ({ ledgerId: l.ledger_id, debit: l.debit, credit: l.credit })),
  };
}

export async function saveVoucher(db: Db, input: SaveVoucherInput): Promise<{ voucherId: string; voucherNo: number }> {
  return db.transaction(async (tx) => {
    await assertPostable(tx, input.companyId, input.yearId, input.date);
    const bookLedgerId = await loadBookLedger(tx, input.companyId, input.bookId, input.kind);
    const voucherNo = await nextNumber(tx, input.companyId, input.yearId, input.bookId);
    const voucherId = randomUUID();
    await tx.query(
      `INSERT INTO vouchers(id, company_id, year_id, book_id, kind, voucher_no, voucher_date, narration, created_by, modified_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,
      [
        voucherId,
        input.companyId,
        input.yearId,
        input.bookId,
        input.kind,
        voucherNo,
        input.date,
        input.narration ?? null,
        input.actorId,
      ],
    );
    await writeBody(tx, {
      voucherId,
      companyId: input.companyId,
      yearId: input.yearId,
      date: input.date,
      kind: input.kind,
      bookLedgerId,
      lines: input.lines,
    });
    await writeAudit(tx, {
      userId: input.actorId,
      companyId: input.companyId,
      entity: 'voucher',
      entityId: voucherId,
      action: 'add',
      newValues: await snapshot(tx, voucherId),
    });
    return { voucherId, voucherNo };
  });
}

export async function updateVoucher(
  db: Db,
  voucherId: string,
  expectedVersion: number,
  patch: UpdateVoucherPatch,
): Promise<{ version: number }> {
  return db.transaction(async (tx) => {
    const v = await lockVoucher(tx, voucherId, expectedVersion);
    await assertPostable(tx, v.company_id, v.year_id, v.voucher_date);
    await assertPostable(tx, v.company_id, v.year_id, patch.date);
    const bookLedgerId = await loadBookLedger(tx, v.company_id, v.book_id, v.kind);
    const before = await snapshot(tx, voucherId);
    await clearBody(tx, voucherId);
    await writeBody(tx, {
      voucherId,
      companyId: v.company_id,
      yearId: v.year_id,
      date: patch.date,
      kind: v.kind,
      bookLedgerId,
      lines: patch.lines,
    });
    await tx.query(
      `UPDATE vouchers SET voucher_date = $2, narration = $3, version = version + 1,
         modified_by = $4, modified_at = now() WHERE id = $1`,
      [voucherId, patch.date, patch.narration ?? null, patch.actorId],
    );
    await writeAudit(tx, {
      userId: patch.actorId,
      companyId: v.company_id,
      entity: 'voucher',
      entityId: voucherId,
      action: 'edit',
      oldValues: before,
      newValues: await snapshot(tx, voucherId),
    });
    return { version: expectedVersion + 1 };
  });
}

export async function deleteVoucher(
  db: Db,
  voucherId: string,
  expectedVersion: number,
  actorId: string | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    const v = await lockVoucher(tx, voucherId, expectedVersion);
    await assertPostable(tx, v.company_id, v.year_id, v.voucher_date);
    const before = await snapshot(tx, voucherId);
    await clearBody(tx, voucherId);
    await tx.query('DELETE FROM vouchers WHERE id = $1', [voucherId]);
    await writeAudit(tx, {
      userId: actorId,
      companyId: v.company_id,
      entity: 'voucher',
      entityId: voucherId,
      action: 'delete',
      oldValues: before,
    });
  });
}
