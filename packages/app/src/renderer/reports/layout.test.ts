import { describe, expect, it } from 'vitest';
import type { BalanceSheetDto, ProfitLossDto, SectionDto } from '../api/endpoints';
import { balanceSheetSides, flattenSection, profitLossSides, sideBySide } from './layout';

const section = (groups: { code: number; name: string; amount: string; ledgers: [string, string][] }[], total: string): SectionDto => ({
  groups: groups.map((g) => ({ code: g.code, name: g.name, amount: g.amount, ledgers: g.ledgers.map(([name, amount], i) => ({ ledgerId: `${g.code}-${i}`, name, amount })) })),
  total,
});

describe('flattenSection', () => {
  it('lists each group and then its ledgers, indented', () => {
    const lines = flattenSection(section([{ code: 29, name: 'Trading Income', amount: '3000.00', ledgers: [['Sales', '3000.00']] }], '3000.00'));
    expect(lines).toEqual([
      { label: 'Trading Income', amount: '3000.00', level: 0 },
      { label: 'Sales', amount: '3000.00', level: 1 },
    ]);
  });
  it('is empty for an empty section', () => {
    expect(flattenSection({ groups: [], total: '0.00' })).toEqual([]);
  });
});

describe('sideBySide', () => {
  it('pairs lines up and pads the shorter side', () => {
    const a = [{ label: 'a1', amount: '1', level: 0 as const }, { label: 'a2', amount: '2', level: 0 as const }];
    const b = [{ label: 'b1', amount: '3', level: 0 as const }];
    expect(sideBySide(a, b)).toEqual([
      { left: a[0], right: b[0] },
      { left: a[1], right: null },
    ]);
    expect(sideBySide([], [])).toEqual([]);
  });
});

const PL: ProfitLossDto = {
  income: section([{ code: 29, name: 'Trading Income', amount: '3000.00', ledgers: [['Sales', '3000.00']] }], '3000.00'),
  expense: section([{ code: 32, name: 'Profit & Loss Expense', amount: '400.00', ledgers: [['Rent', '400.00']] }], '400.00'),
  netProfit: '2600.00',
};

describe('profitLossSides', () => {
  it('puts expenses on the left and income on the right, and adds a profit to the left so both sides total the same', () => {
    const s = profitLossSides(PL);
    expect(s.left.map((l) => l.label)).toEqual(['Profit & Loss Expense', 'Rent', 'Net Profit']);
    expect(s.left.at(-1)).toEqual({ label: 'Net Profit', amount: '2600.00', level: 0 });
    expect(s.right.map((l) => l.label)).toEqual(['Trading Income', 'Sales']);
    expect(s.leftTotal).toBe('3000.00');
    expect(s.rightTotal).toBe('3000.00');
  });
  it('adds a loss to the right', () => {
    const s = profitLossSides({ ...PL, income: section([], '0.00'), netProfit: '-400.00' });
    expect(s.right.at(-1)).toEqual({ label: 'Net Loss', amount: '400.00', level: 0 });
    expect(s.leftTotal).toBe('400.00');
    expect(s.rightTotal).toBe('400.00');
  });
});

const BS: BalanceSheetDto = {
  assets: section(
    [
      { code: 16, name: 'Cash-in-Hand', amount: '10600.00', ledgers: [['Cash', '10600.00']] },
      { code: 42, name: 'Sundry Debtors', amount: '2000.00', ledgers: [['Ramesh Traders', '2000.00']] },
    ],
    '12600.00',
  ),
  liabilities: section([{ code: 5, name: 'Capital Account', amount: '10000.00', ledgers: [['Capital', '10000.00']] }], '10000.00'),
  netProfit: '2600.00',
  totalAssets: '12600.00',
  totalLiabilities: '12600.00',
  difference: '0.00',
};

describe('balanceSheetSides', () => {
  it('puts liabilities and a profit on the left and assets on the right', () => {
    const s = balanceSheetSides(BS);
    expect(s.left.map((l) => l.label)).toEqual(['Capital Account', 'Capital', 'Net Profit']);
    expect(s.right.map((l) => l.label)).toEqual(['Cash-in-Hand', 'Cash', 'Sundry Debtors', 'Ramesh Traders']);
    expect(s.leftTotal).toBe('12600.00');
    expect(s.rightTotal).toBe('12600.00');
  });
  it('puts a loss on the right', () => {
    const s = balanceSheetSides({ ...BS, netProfit: '-500.00', totalAssets: '13100.00', totalLiabilities: '13100.00' });
    expect(s.right.at(-1)).toEqual({ label: 'Net Loss', amount: '500.00', level: 0 });
    expect(s.left.some((l) => l.label === 'Net Profit')).toBe(false);
    expect(s.leftTotal).toBe('13100.00');
    expect(s.rightTotal).toBe('13100.00');
  });
});
