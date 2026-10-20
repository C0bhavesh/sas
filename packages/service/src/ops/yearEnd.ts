import { randomUUID } from 'node:crypto';
import { AppError, fromPaise, type Actor } from '@sas/shared';
import type { Db, Queryable } from '../db/types';
import { createLedger, setOpening } from '../masters/ledgers';
import { ledgerBalances } from '../reports/balances';
import { assertIsoDate } from '../reports/format';
import { writeAudit } from '../security/audit';
import { assertRight } from '../security/rights';

export const PL_LEDGER_NAME = 'Profit & Loss A/c';

export interface CloseYearParams {
  companyId: string;
  yearId: string;
  next: { label: string; start: string; end: string };
}

export interface CloseYearResult {
  nextYearId: string;
  netProfit: string;
  carriedLedgers: number;
  carriedBills: number;
}

interface YearRow {
  status: string;
  start_date: string;
  end_date: string;
}

async function lockYearRow(tx: Queryable, companyId: string, yearId: string): Promise<YearRow> {
  const rows = await tx.query<YearRow>(
    'SELECT status, start_date, end_date FROM financial_years WHERE id = $1 AND company_id = $2 FOR UPDATE',
    [yearId, companyId],
  );
  if (!rows[0]) throw new AppError('NOT_FOUND', 'Financial year not found');
  return rows[0];
}

export async function closeYear(db: Db, actor: Actor, p: CloseYearParams): Promise<CloseYearResult> {
  assertIsoDate(p.next.start);
  assertIsoDate(p.next.end);
  return db.transaction(async (tx) => {
    await assertRight(tx, actor, 'utilities', 'edit');
    const year = await lockYearRow(tx, p.companyId, p.yearId);
    if (year.status === 'locked') throw new AppError('YEAR_BAD_STATE', 'This year is locked');
    if (p.next.start <= year.end_date) {
      throw new AppError('INVALID_INPUT', 'The next year must start after this year ends');
    }
    if (p.next.end <= p.next.start) throw new AppError('INVALID_INPUT', 'The next year must end after it starts');

    // Reuse the next year if it exists and is still open; otherwise create it.
    const existing = await tx.query<{ id: string; status: string; start_date: string; end_date: string }>(
      'SELECT id, status, start_date, end_date FROM financial_years WHERE company_id = $1 AND label = $2 FOR UPDATE',
      [p.companyId, p.next.label],
    );
    let nextYearId: string;
    if (existing[0]) {
      if (existing[0].status !== 'open') throw new AppError('YEAR_BAD_STATE', 'The next year is already closed');
      if (existing[0].start_date !== p.next.start || existing[0].end_date !== p.next.end) {
        throw new AppError('INVALID_INPUT', `Year ${p.next.label} already exists with different dates`);
      }
      nextYearId = existing[0].id;
    } else {
      nextYearId = randomUUID();
      await tx.query(
        `INSERT INTO financial_years(id, company_id, label, start_date, end_date, status) VALUES ($1,$2,$3,$4,$5,'open')`,
        [nextYearId, p.companyId, p.next.label, p.next.start, p.next.end],
      );
    }

    // The ledger that receives the year's profit or loss.
    const found = await tx.query<{ id: string }>(
      'SELECT id FROM ledgers WHERE company_id = $1 AND lower(name) = lower($2)',
      [p.companyId, PL_LEDGER_NAME],
    );
    const carryId = found[0]?.id ?? (await createLedger(tx, { companyId: p.companyId, groupCode: 22, name: PL_LEDGER_NAME }));

    const balances = await ledgerBalances(tx, { companyId: p.companyId, yearId: p.yearId, asOn: year.end_date });
    const netDebit = balances
      .filter((r) => r.nature === 'income' || r.nature === 'expense')
      .reduce((sum, r) => sum + r.balance, 0n); // debit-positive; a profit makes this negative
    const closing = new Map<string, bigint>();
    for (const r of balances) {
      if (r.nature === 'asset' || r.nature === 'liability') closing.set(r.ledgerId, r.balance);
    }
    closing.set(carryId, (closing.get(carryId) ?? 0n) + netDebit);

    // The next year's openings are fully derived: rewrite them from scratch.
    await tx.query(
      `DELETE FROM ledger_openings WHERE year_id = $1 AND ledger_id IN (SELECT id FROM ledgers WHERE company_id = $2)`,
      [nextYearId, p.companyId],
    );
    let carriedLedgers = 0;
    for (const [ledgerId, balance] of closing) {
      if (balance === 0n) continue;
      await setOpening(tx, ledgerId, nextYearId, fromPaise(balance < 0n ? -balance : balance), balance < 0n ? 'Cr' : 'Dr');
      carriedLedgers++;
    }

    await tx.query(`UPDATE financial_years SET status = 'closed' WHERE id = $1`, [p.yearId]);

    const bills = await tx.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM (
         SELECT b.id FROM outstanding_bills b LEFT JOIN bill_adjustments a ON a.bill_id = b.id
         WHERE b.company_id = $1
         GROUP BY b.id HAVING b.original_amount - COALESCE(SUM(a.amount), 0) > 0
       ) pending`,
      [p.companyId],
    );
    const result: CloseYearResult = {
      nextYearId,
      netProfit: fromPaise(-netDebit),
      carriedLedgers,
      carriedBills: bills[0]?.n ?? 0,
    };
    await writeAudit(tx, {
      userId: actor.userId,
      companyId: p.companyId,
      entity: 'financial_year',
      entityId: p.yearId,
      action: 'close_year',
      oldValues: { status: year.status },
      newValues: result,
    });
    return result;
  });
}

export async function reopenYear(db: Db, actor: Actor, companyId: string, yearId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await assertRight(tx, actor, 'utilities', 'edit');
    const year = await lockYearRow(tx, companyId, yearId);
    if (year.status !== 'closed') throw new AppError('YEAR_BAD_STATE', 'Only a closed year can be reopened');
    const later = await tx.query<{ status: string }>(
      `SELECT status FROM financial_years WHERE company_id = $1 AND start_date > $2 AND status <> 'open'`,
      [companyId, year.start_date],
    );
    if (later.length > 0) {
      throw new AppError('YEAR_BAD_STATE', 'A later year is already closed. Reopen that one first.');
    }
    await tx.query(`UPDATE financial_years SET status = 'open' WHERE id = $1`, [yearId]);
    await writeAudit(tx, {
      userId: actor.userId,
      companyId,
      entity: 'financial_year',
      entityId: yearId,
      action: 'reopen_year',
      oldValues: { status: 'closed' },
      newValues: { status: 'open' },
    });
  });
}

export async function lockYear(db: Db, actor: Actor, companyId: string, yearId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await assertRight(tx, actor, 'utilities', 'edit');
    const year = await lockYearRow(tx, companyId, yearId);
    if (year.status !== 'closed') throw new AppError('YEAR_BAD_STATE', 'Only a closed year can be locked');
    await tx.query(`UPDATE financial_years SET status = 'locked' WHERE id = $1`, [yearId]);
    await writeAudit(tx, {
      userId: actor.userId,
      companyId,
      entity: 'financial_year',
      entityId: yearId,
      action: 'lock_year',
      oldValues: { status: 'closed' },
      newValues: { status: 'locked' },
    });
  });
}
