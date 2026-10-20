import { randomUUID } from 'node:crypto';
import type { Side } from '@sas/shared';
import { AppError, toPaise, fromPaise } from '@sas/shared';
import type { Queryable } from '../db/types';

export interface NewLedger {
  companyId: string;
  groupCode: number;
  name: string;
  code?: string;
  address?: string;
  city?: string;
  stateCode?: string;
  gstin?: string;
  pan?: string;
  creditDays?: number;
}

export async function createLedger(q: Queryable, input: NewLedger): Promise<string> {
  const groups = await q.query<{ id: string }>('SELECT id FROM account_groups WHERE company_id = $1 AND code = $2', [
    input.companyId,
    input.groupCode,
  ]);
  const group = groups[0];
  if (!group) throw new AppError('INVALID_INPUT', `Unknown account group ${input.groupCode}`);
  const id = randomUUID();
  await q.query(
    `INSERT INTO ledgers(id, company_id, group_id, code, name, address, city, state_code, gstin, pan, credit_days)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      id,
      input.companyId,
      group.id,
      input.code ?? null,
      input.name,
      input.address ?? null,
      input.city ?? null,
      input.stateCode ?? null,
      input.gstin ?? null,
      input.pan ?? null,
      input.creditDays ?? null,
    ],
  );
  return id;
}

/** Set (or replace) the opening balance of a ledger for a financial year. */
export async function setOpening(
  q: Queryable,
  ledgerId: string,
  yearId: string,
  amount: string,
  side: Side,
): Promise<void> {
  const normalized = fromPaise(toPaise(amount)); // validates and normalizes to two decimals
  await q.query(
    `INSERT INTO ledger_openings(id, ledger_id, year_id, amount, side) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (ledger_id, year_id) DO UPDATE SET amount = EXCLUDED.amount, side = EXCLUDED.side`,
    [randomUUID(), ledgerId, yearId, normalized, side],
  );
}
