import { fromPaise, toPaise, type Side } from '@sas/shared';
import type { Queryable } from '../db/types';
import { assertIsoDate } from './format';

export interface AgeingParams {
  companyId: string;
  asOn: string;
  side?: Side;
  ledgerId?: string;
  hiddenGroupIds?: string[];
  bucketDays?: number[];
}

export interface AgeingRow {
  ledgerId: string;
  ledgerName: string;
  side: Side;
  buckets: string[];
  total: string;
  onAccount: string;
  net: string;
}

export interface AgeingReport {
  bucketLabels: string[];
  rows: AgeingRow[];
  totals: { buckets: string[]; total: string; onAccount: string; net: string };
}

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);

/** [30, 60, 90] gives 0-30, 31-60, 61-90, 90+. */
function labels(cuts: number[]): string[] {
  const out = cuts.map((cut, i) => (i === 0 ? `0-${cut}` : `${cuts[i - 1]! + 1}-${cut}`));
  out.push(`${cuts[cuts.length - 1]}+`);
  return out;
}

export async function outstandingAgeing(q: Queryable, p: AgeingParams): Promise<AgeingReport> {
  assertIsoDate(p.asOn);
  const cuts = p.bucketDays ?? [30, 60, 90];
  const bucketLabels = labels(cuts);
  const hidden = new Set(p.hiddenGroupIds ?? []);

  const bills = await q.query<{
    ledger_id: string;
    name: string;
    group_id: string;
    side: Side;
    bill_date: string;
    pending: string;
  }>(
    `SELECT b.ledger_id, l.name, l.group_id, b.side, b.bill_date,
            b.original_amount - COALESCE(SUM(a.amount), 0) AS pending
     FROM outstanding_bills b
     JOIN ledgers l ON l.id = b.ledger_id
     LEFT JOIN bill_adjustments a ON a.bill_id = b.id
     WHERE b.company_id = $1 AND b.bill_date <= $2
       AND ($3::text IS NULL OR b.side = $3)
       AND ($4::uuid IS NULL OR b.ledger_id = $4)
     GROUP BY b.id, l.name, l.group_id
     HAVING b.original_amount - COALESCE(SUM(a.amount), 0) > 0`,
    [p.companyId, p.asOn, p.side ?? null, p.ledgerId ?? null],
  );

  const asOnDay = dayNumber(p.asOn);
  const rows = new Map<string, { row: AgeingRow; buckets: bigint[]; total: bigint }>();
  for (const b of bills) {
    if (hidden.has(b.group_id)) continue;
    const key = `${b.ledger_id}|${b.side}`;
    let entry = rows.get(key);
    if (!entry) {
      entry = {
        row: { ledgerId: b.ledger_id, ledgerName: b.name, side: b.side, buckets: [], total: '', onAccount: '', net: '' },
        buckets: bucketLabels.map(() => 0n),
        total: 0n,
      };
      rows.set(key, entry);
    }
    const age = asOnDay - dayNumber(b.bill_date);
    let idx = cuts.findIndex((cut) => age <= cut);
    if (idx === -1) idx = cuts.length;
    const amount = toPaise(b.pending);
    entry.buckets[idx]! += amount;
    entry.total += amount;
  }

  // Unmatched on-account money sits on the opposite side of the bills it could settle.
  const onAccount = await q.query<{ ledger_id: string; side: Side; remaining: string }>(
    `SELECT o.ledger_id, o.side, o.amount - COALESCE(SUM(a.amount), 0) AS remaining
     FROM on_account o LEFT JOIN bill_adjustments a ON a.on_account_id = o.id
     WHERE o.company_id = $1
     GROUP BY o.id
     HAVING o.amount - COALESCE(SUM(a.amount), 0) > 0`,
    [p.companyId],
  );
  const onAccountByKey = new Map<string, bigint>();
  for (const o of onAccount) {
    const billSide: Side = o.side === 'Cr' ? 'Dr' : 'Cr';
    const key = `${o.ledger_id}|${billSide}`;
    onAccountByKey.set(key, (onAccountByKey.get(key) ?? 0n) + toPaise(o.remaining));
  }

  const totalsBuckets = bucketLabels.map(() => 0n);
  let totalAll = 0n;
  let totalOnAccount = 0n;
  const out: AgeingRow[] = [];
  for (const [key, e] of [...rows.entries()].sort(([, a], [, b]) => a.row.ledgerName.localeCompare(b.row.ledgerName))) {
    const oa = onAccountByKey.get(key) ?? 0n;
    e.buckets.forEach((v, i) => (totalsBuckets[i]! += v));
    totalAll += e.total;
    totalOnAccount += oa;
    out.push({
      ...e.row,
      buckets: e.buckets.map(fromPaise),
      total: fromPaise(e.total),
      onAccount: fromPaise(oa),
      net: fromPaise(e.total - oa),
    });
  }

  return {
    bucketLabels,
    rows: out,
    totals: {
      buckets: totalsBuckets.map(fromPaise),
      total: fromPaise(totalAll),
      onAccount: fromPaise(totalOnAccount),
      net: fromPaise(totalAll - totalOnAccount),
    },
  };
}
