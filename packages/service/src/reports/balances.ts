import { toPaise } from '@sas/shared';
import type { Queryable } from '../db/types';
import { assertIsoDate } from './format';

export type Nature = 'asset' | 'liability' | 'income' | 'expense';

export interface BalanceRow {
  ledgerId: string;
  ledgerName: string;
  groupId: string;
  groupCode: number;
  groupName: string;
  nature: Nature;
  opening: bigint;
  debit: bigint;
  credit: bigint;
  /** opening + debit - credit; positive is a debit balance. */
  balance: bigint;
}

export interface BalanceParams {
  companyId: string;
  yearId: string;
  asOn: string;
  hiddenGroupIds?: string[];
}

/** Every ledger's balance as on a date: the year's opening balance plus the year's entries up to that date. */
export async function ledgerBalances(q: Queryable, p: BalanceParams): Promise<BalanceRow[]> {
  assertIsoDate(p.asOn);
  const rows = await q.query<{
    ledger_id: string;
    ledger_name: string;
    group_id: string;
    group_code: number;
    group_name: string;
    nature: Nature;
    opening: string;
    dr: string;
    cr: string;
  }>(
    `SELECT l.id AS ledger_id, l.name AS ledger_name,
            g.id AS group_id, g.code AS group_code, g.name AS group_name, g.nature,
            COALESCE(CASE WHEN o.side = 'Dr' THEN o.amount ELSE -o.amount END, 0) AS opening,
            COALESCE(e.dr, 0) AS dr, COALESCE(e.cr, 0) AS cr
     FROM ledgers l
     JOIN account_groups g ON g.id = l.group_id
     LEFT JOIN ledger_openings o ON o.ledger_id = l.id AND o.year_id = $2
     LEFT JOIN (
       SELECT ledger_id, SUM(debit) AS dr, SUM(credit) AS cr
       FROM ledger_entries
       WHERE company_id = $1 AND year_id = $2 AND entry_date <= $3
       GROUP BY ledger_id
     ) e ON e.ledger_id = l.id
     WHERE l.company_id = $1
     ORDER BY g.code, l.name`,
    [p.companyId, p.yearId, p.asOn],
  );
  const hidden = new Set(p.hiddenGroupIds ?? []);
  return rows
    .filter((r) => !hidden.has(r.group_id))
    .map((r) => {
      const opening = toPaise(r.opening);
      const debit = toPaise(r.dr);
      const credit = toPaise(r.cr);
      return {
        ledgerId: r.ledger_id,
        ledgerName: r.ledger_name,
        groupId: r.group_id,
        groupCode: r.group_code,
        groupName: r.group_name,
        nature: r.nature,
        opening,
        debit,
        credit,
        balance: opening + debit - credit,
      };
    });
}
