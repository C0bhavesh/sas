import { fromPaise, toPaise } from '@sas/shared';
import type { BalanceSheetDto, ProfitLossDto, SectionDto } from '../api/endpoints';

export interface Line {
  label: string;
  amount: string;
  level: 0 | 1;
}
export interface SideRow {
  left: Line | null;
  right: Line | null;
}

export function flattenSection(section: SectionDto): Line[] {
  return section.groups.flatMap((g) => [
    { label: g.name, amount: g.amount, level: 0 as const },
    ...g.ledgers.map((l) => ({ label: l.name, amount: l.amount, level: 1 as const })),
  ]);
}

export function sideBySide(left: Line[], right: Line[]): SideRow[] {
  const rows: SideRow[] = [];
  for (let i = 0; i < Math.max(left.length, right.length); i++) rows.push({ left: left[i] ?? null, right: right[i] ?? null });
  return rows;
}

const total = (...amounts: string[]) => fromPaise(amounts.reduce((sum, a) => sum + toPaise(a), 0n));
const abs = (amount: string) => fromPaise(toPaise(amount) < 0n ? -toPaise(amount) : toPaise(amount));

interface Sides {
  left: Line[];
  right: Line[];
  leftTotal: string;
  rightTotal: string;
}

/** Indian T-format: expenses (debit side) on the left, income on the right; the result goes on the lighter side. */
export function profitLossSides(dto: ProfitLossDto): Sides {
  const left = flattenSection(dto.expense);
  const right = flattenSection(dto.income);
  const profit = toPaise(dto.netProfit);
  if (profit > 0n) left.push({ label: 'Net Profit', amount: dto.netProfit, level: 0 });
  else if (profit < 0n) right.push({ label: 'Net Loss', amount: abs(dto.netProfit), level: 0 });
  return {
    left,
    right,
    leftTotal: total(dto.expense.total, profit > 0n ? dto.netProfit : '0'),
    rightTotal: total(dto.income.total, profit < 0n ? abs(dto.netProfit) : '0'),
  };
}

/** Liabilities (with a profit) on the left, assets (with a loss) on the right. */
export function balanceSheetSides(dto: BalanceSheetDto): Sides {
  const left = flattenSection(dto.liabilities);
  const right = flattenSection(dto.assets);
  const profit = toPaise(dto.netProfit);
  if (profit > 0n) left.push({ label: 'Net Profit', amount: dto.netProfit, level: 0 });
  else if (profit < 0n) right.push({ label: 'Net Loss', amount: abs(dto.netProfit), level: 0 });
  return { left, right, leftTotal: dto.totalLiabilities, rightTotal: dto.totalAssets };
}
