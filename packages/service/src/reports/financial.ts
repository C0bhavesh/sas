import { fromPaise } from '@sas/shared';
import type { Queryable } from '../db/types';
import { ledgerBalances, type BalanceParams, type BalanceRow } from './balances';

export interface SectionGroup {
  code: number;
  name: string;
  amount: string;
  ledgers: { ledgerId: string; name: string; amount: string }[];
}
export interface Section {
  groups: SectionGroup[];
  total: string;
}

/** Group ledger rows by their own group; `sign` turns a debit-positive balance into the natural amount. */
function section(rows: BalanceRow[], sign: 1n | -1n): { section: Section; total: bigint } {
  const groups = new Map<number, { name: string; total: bigint; ledgers: SectionGroup['ledgers'] }>();
  let total = 0n;
  for (const r of rows) {
    const amount = sign * r.balance;
    if (amount === 0n) continue;
    total += amount;
    const g = groups.get(r.groupCode) ?? { name: r.groupName, total: 0n, ledgers: [] };
    g.total += amount;
    g.ledgers.push({ ledgerId: r.ledgerId, name: r.ledgerName, amount: fromPaise(amount) });
    groups.set(r.groupCode, g);
  }
  return {
    section: {
      groups: [...groups.entries()]
        .sort(([a], [b]) => a - b)
        .map(([code, g]) => ({ code, name: g.name, amount: fromPaise(g.total), ledgers: g.ledgers })),
      total: fromPaise(total),
    },
    total,
  };
}

export interface TrialBalance {
  rows: { ledgerId: string; ledgerName: string; groupCode: number; groupName: string; debit: string; credit: string }[];
  groups: { code: number; name: string; nature: string; debit: string; credit: string }[];
  totalDebit: string;
  totalCredit: string;
  difference: string;
}

export async function trialBalance(q: Queryable, p: BalanceParams): Promise<TrialBalance> {
  const balances = (await ledgerBalances(q, p)).filter((r) => r.balance !== 0n);

  const groupRows = await q.query<{ id: string; code: number; name: string; nature: string; parent_id: string | null }>(
    'SELECT id, code, name, nature, parent_id FROM account_groups WHERE company_id = $1',
    [p.companyId],
  );
  const byId = new Map(groupRows.map((g) => [g.id, g]));
  const topOf = (id: string) => {
    let cur = byId.get(id)!;
    while (cur.parent_id) cur = byId.get(cur.parent_id)!;
    return cur;
  };

  let totalDebit = 0n;
  let totalCredit = 0n;
  const top = new Map<number, { name: string; nature: string; net: bigint }>();
  const rows = balances.map((r) => {
    const debit = r.balance > 0n ? r.balance : 0n;
    const credit = r.balance < 0n ? -r.balance : 0n;
    totalDebit += debit;
    totalCredit += credit;
    const t = topOf(r.groupId);
    const agg = top.get(t.code) ?? { name: t.name, nature: t.nature, net: 0n };
    agg.net += r.balance;
    top.set(t.code, agg);
    return {
      ledgerId: r.ledgerId,
      ledgerName: r.ledgerName,
      groupCode: r.groupCode,
      groupName: r.groupName,
      debit: fromPaise(debit),
      credit: fromPaise(credit),
    };
  });

  return {
    rows,
    groups: [...top.entries()]
      .sort(([a], [b]) => a - b)
      .map(([code, g]) => ({
        code,
        name: g.name,
        nature: g.nature,
        debit: fromPaise(g.net > 0n ? g.net : 0n),
        credit: fromPaise(g.net < 0n ? -g.net : 0n),
      })),
    totalDebit: fromPaise(totalDebit),
    totalCredit: fromPaise(totalCredit),
    difference: fromPaise(totalDebit - totalCredit),
  };
}

export interface ProfitAndLoss {
  income: Section;
  expense: Section;
  netProfit: string;
}

export async function profitAndLoss(q: Queryable, p: BalanceParams): Promise<ProfitAndLoss> {
  const balances = await ledgerBalances(q, p);
  const income = section(
    balances.filter((r) => r.nature === 'income'),
    -1n,
  );
  const expense = section(
    balances.filter((r) => r.nature === 'expense'),
    1n,
  );
  return { income: income.section, expense: expense.section, netProfit: fromPaise(income.total - expense.total) };
}

export interface BalanceSheet {
  assets: Section;
  liabilities: Section;
  netProfit: string;
  totalAssets: string;
  totalLiabilities: string;
  difference: string;
}

export async function balanceSheet(q: Queryable, p: BalanceParams): Promise<BalanceSheet> {
  const balances = await ledgerBalances(q, p);
  const sheet = balances.filter((r) => r.nature === 'asset' || r.nature === 'liability');
  const assets = section(
    sheet.filter((r) => r.balance > 0n),
    1n,
  );
  const liabilities = section(
    sheet.filter((r) => r.balance < 0n),
    -1n,
  );
  const profit =
    section(
      balances.filter((r) => r.nature === 'income'),
      -1n,
    ).total -
    section(
      balances.filter((r) => r.nature === 'expense'),
      1n,
    ).total;
  const totalAssets = assets.total + (profit < 0n ? -profit : 0n);
  const totalLiabilities = liabilities.total + (profit > 0n ? profit : 0n);
  return {
    assets: assets.section,
    liabilities: liabilities.section,
    netProfit: fromPaise(profit),
    totalAssets: fromPaise(totalAssets),
    totalLiabilities: fromPaise(totalLiabilities),
    difference: fromPaise(totalAssets - totalLiabilities),
  };
}
