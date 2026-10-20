import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { BalanceSheetDto, ProfitLossDto, SectionDto, TrialBalanceDto } from '../api/endpoints';
import { renderScreen } from '../testing/render';
import { BalanceSheetReport, ProfitLossReport, TrialBalanceReport } from './FinancialReports';

const TB: TrialBalanceDto = {
  rows: [
    { ledgerId: 'l1', ledgerName: 'Cash', groupCode: 16, groupName: 'Cash-in-Hand', debit: '1060000.00', credit: '0.00' },
    { ledgerId: 'l2', ledgerName: 'Capital', groupCode: 5, groupName: 'Capital Account', debit: '0.00', credit: '1000000.00' },
  ],
  groups: [
    { code: 5, name: 'Capital Account', nature: 'liability', debit: '0.00', credit: '1000000.00' },
    { code: 16, name: 'Cash-in-Hand', nature: 'asset', debit: '1060000.00', credit: '0.00' },
  ],
  totalDebit: '1060000.00',
  totalCredit: '1000000.00',
  difference: '60000.00',
};

describe('TrialBalanceReport', () => {
  it('runs on open for the as-on date and shows ledgers with Indian formatting and the totals', async () => {
    const { api } = renderScreen(<TrialBalanceReport />, { routes: [{ method: 'GET', path: '/api/reports/trial-balance', reply: () => TB }] });
    const grid = await screen.findByRole('grid', { name: 'Trial balance' });
    expect(within(grid).getByRole('row', { name: /Cash/ })).toHaveTextContent('10,60,000.00');
    expect(within(grid).getByText('Total').closest('tr')).toHaveTextContent('10,00,000.00');
    expect(api.calls.find((c) => c.path.startsWith('/api/reports/trial-balance'))!.path).toMatch(/^\/api\/reports\/trial-balance\?companyId=c1&yearId=y1&asOn=\d{4}-\d{2}-\d{2}$/);
  });

  it('warns loudly when debit and credit totals differ', async () => {
    renderScreen(<TrialBalanceReport />, { routes: [{ method: 'GET', path: '/api/reports/trial-balance', reply: () => TB }] });
    expect(await screen.findByText(/does not tally.*60,000\.00/i)).toBeInTheDocument();
  });

  it('shows no warning when it tallies', async () => {
    renderScreen(<TrialBalanceReport />, {
      routes: [{ method: 'GET', path: '/api/reports/trial-balance', reply: () => ({ ...TB, totalCredit: '1060000.00', difference: '0.00' }) }],
    });
    await screen.findByRole('grid', { name: 'Trial balance' });
    expect(screen.queryByText(/does not tally/i)).toBeNull();
  });

  it('can be viewed group-wise', async () => {
    const user = userEvent.setup();
    renderScreen(<TrialBalanceReport />, { routes: [{ method: 'GET', path: '/api/reports/trial-balance', reply: () => TB }] });
    await screen.findByRole('grid', { name: 'Trial balance' });
    await user.click(screen.getByRole('combobox', { name: 'View' }));
    await user.keyboard('group{Enter}');
    const grid = await screen.findByRole('grid', { name: 'Trial balance by group' });
    expect(within(grid).getByText('Capital Account')).toBeInTheDocument();
    expect(within(grid).queryByText('Cash')).toBeNull();
  });

  it('exports a CSV of what is on screen', async () => {
    const user = userEvent.setup();
    const { bridge } = renderScreen(<TrialBalanceReport />, { routes: [{ method: 'GET', path: '/api/reports/trial-balance', reply: () => TB }] });
    await screen.findByRole('grid', { name: 'Trial balance' });
    await user.keyboard('{Control>}e{/Control}');
    await screen.findByText('CSV saved');
    expect(bridge.saved[0]!.suggestedName).toBe('trial-balance.csv');
    expect(bridge.saved[0]!.data).toContain('Cash,Cash-in-Hand,1060000.00,0.00');
  });
});

const section = (name: string, ledger: string, amount: string): SectionDto => ({
  groups: [{ code: 1, name, amount, ledgers: [{ ledgerId: 'x', name: ledger, amount }] }],
  total: amount,
});

describe('ProfitLossReport', () => {
  const PL: ProfitLossDto = { income: section('Trading Income', 'Sales', '300000.00'), expense: section('Profit & Loss Expense', 'Rent', '40000.00'), netProfit: '260000.00' };
  it('shows expenses on the left, income on the right, and the net profit that balances the sides', async () => {
    renderScreen(<ProfitLossReport />, { routes: [{ method: 'GET', path: '/api/reports/profit-loss', reply: () => PL }] });
    const grid = await screen.findByRole('grid', { name: 'Profit and loss' });
    expect(within(grid).getByText('Net Profit').closest('tr')).toHaveTextContent('2,60,000.00');
    expect(within(grid).getByText('Rent')).toBeInTheDocument();
    expect(within(grid).getByText('Sales')).toBeInTheDocument();
    expect(within(grid).getAllByText('3,00,000.00').length).toBeGreaterThan(0); // both side totals
  });
});

describe('BalanceSheetReport', () => {
  const BS: BalanceSheetDto = {
    assets: section('Cash-in-Hand', 'Cash', '1260000.00'),
    liabilities: section('Capital Account', 'Capital', '1000000.00'),
    netProfit: '260000.00',
    totalAssets: '1260000.00',
    totalLiabilities: '1260000.00',
    difference: '0.00',
  };
  it('shows liabilities (with the profit) on the left and assets on the right', async () => {
    renderScreen(<BalanceSheetReport />, { routes: [{ method: 'GET', path: '/api/reports/balance-sheet', reply: () => BS }] });
    const grid = await screen.findByRole('grid', { name: 'Balance sheet' });
    expect(within(grid).getByText('Capital')).toBeInTheDocument();
    expect(within(grid).getByText('Net Profit')).toBeInTheDocument();
    expect(within(grid).getByText('Cash')).toBeInTheDocument();
    expect(screen.queryByText(/does not tally/i)).toBeNull();
  });
  it('warns when the sheet does not balance', async () => {
    renderScreen(<BalanceSheetReport />, {
      routes: [{ method: 'GET', path: '/api/reports/balance-sheet', reply: () => ({ ...BS, totalAssets: '1270000.00', difference: '10000.00' }) }],
    });
    expect(await screen.findByText(/does not balance.*10,000\.00/i)).toBeInTheDocument();
  });
});
