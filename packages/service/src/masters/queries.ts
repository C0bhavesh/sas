import type { Queryable } from '../db/types';

export async function listYears(
  q: Queryable,
  companyId: string,
): Promise<{ id: string; label: string; startDate: string; endDate: string; status: string }[]> {
  const rows = await q.query<{ id: string; label: string; start_date: string; end_date: string; status: string }>(
    'SELECT id, label, start_date, end_date, status FROM financial_years WHERE company_id = $1 ORDER BY start_date',
    [companyId],
  );
  return rows.map((r) => ({ id: r.id, label: r.label, startDate: r.start_date, endDate: r.end_date, status: r.status }));
}

export async function listGroups(
  q: Queryable,
  companyId: string,
  hidden: string[] = [],
): Promise<{ id: string; code: number; name: string; nature: string; parentId: string | null }[]> {
  const rows = await q.query<{ id: string; code: number; name: string; nature: string; parent_id: string | null }>(
    `SELECT id, code, name, nature, parent_id FROM account_groups
     WHERE company_id = $1 AND NOT (id = ANY($2::uuid[])) ORDER BY code`,
    [companyId, hidden],
  );
  return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, nature: r.nature, parentId: r.parent_id }));
}

export async function listLedgers(
  q: Queryable,
  companyId: string,
  hidden: string[] = [],
): Promise<
  { id: string; name: string; groupId: string; groupCode: number; groupName: string; city: string | null; gstin: string | null; status: string }[]
> {
  const rows = await q.query<{
    id: string;
    name: string;
    group_id: string;
    group_code: number;
    group_name: string;
    city: string | null;
    gstin: string | null;
    status: string;
  }>(
    `SELECT l.id, l.name, l.group_id, g.code AS group_code, g.name AS group_name, l.city, l.gstin, l.status
     FROM ledgers l JOIN account_groups g ON g.id = l.group_id
     WHERE l.company_id = $1 AND NOT (l.group_id = ANY($2::uuid[]))
     ORDER BY lower(l.name)`,
    [companyId, hidden],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    groupId: r.group_id,
    groupCode: r.group_code,
    groupName: r.group_name,
    city: r.city,
    gstin: r.gstin,
    status: r.status,
  }));
}

export async function listBooks(
  q: Queryable,
  companyId: string,
): Promise<{ id: string; code: string; name: string; type: string; defaultLedgerId: string | null }[]> {
  const rows = await q.query<{ id: string; code: string; name: string; type: string; default_ledger_id: string | null }>(
    'SELECT id, code, name, type, default_ledger_id FROM books WHERE company_id = $1 ORDER BY code',
    [companyId],
  );
  return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, type: r.type, defaultLedgerId: r.default_ledger_id }));
}
export async function listOpenings(
  q: Queryable,
  companyId: string,
  yearId: string,
  hidden: string[] = [],
): Promise<{ ledgerId: string; ledgerName: string; groupName: string; amount: string; side: 'Dr' | 'Cr' }[]> {
  const rows = await q.query<{ ledger_id: string; ledger_name: string; group_name: string; amount: string; side: 'Dr' | 'Cr' }>(
    `SELECT l.id AS ledger_id, l.name AS ledger_name, g.name AS group_name, o.amount, o.side
     FROM ledger_openings o
     JOIN ledgers l ON l.id = o.ledger_id
     JOIN account_groups g ON g.id = l.group_id
     WHERE l.company_id = $1 AND o.year_id = $2 AND NOT (l.group_id = ANY($3::uuid[]))
     ORDER BY lower(l.name)`,
    [companyId, yearId, hidden],
  );
  return rows.map((r) => ({ ledgerId: r.ledger_id, ledgerName: r.ledger_name, groupName: r.group_name, amount: r.amount, side: r.side }));
}

export interface YearSummary {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: string;
  voucherCount: number;
  accountCount: number;
  lastEntryDate: string | null;
}

/** Every year of a company, newest first, with what has been entered in it. One query, not one per year. */
export async function listYearSummaries(q: Queryable, companyId: string): Promise<YearSummary[]> {
  return q.query<YearSummary>(
    `SELECT y.id, y.label, y.start_date AS "startDate", y.end_date AS "endDate", y.status,
            COALESCE(v.cnt, 0)::int AS "voucherCount",
            COALESCE(a.cnt, 0)::int AS "accountCount",
            v.last_date AS "lastEntryDate"
       FROM financial_years y
       LEFT JOIN (SELECT year_id, COUNT(*) AS cnt, MAX(voucher_date) AS last_date FROM vouchers WHERE company_id = $1 GROUP BY year_id) v ON v.year_id = y.id
       LEFT JOIN (SELECT year_id, COUNT(DISTINCT ledger_id) AS cnt FROM ledger_entries WHERE company_id = $1 GROUP BY year_id) a ON a.year_id = y.id
      WHERE y.company_id = $1
      ORDER BY y.start_date DESC`,
    [companyId],
  );
}
