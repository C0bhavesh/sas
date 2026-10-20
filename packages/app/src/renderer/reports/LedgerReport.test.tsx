import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import type { LedgerReportDto } from '../api/endpoints';
import { renderScreen } from '../testing/render';
import { LedgerReport } from './LedgerReport';

const DTO: LedgerReportDto = {
  ledgerName: 'Cash',
  opening: { amount: '1000.00', side: 'Dr' },
  rows: [
    { date: '2026-05-10', voucherNo: 1, bookCode: 'CB', narration: 'Ramesh Traders', debit: '1234567.50', credit: '0.00', balance: { amount: '1235567.50', side: 'Dr' } },
    { date: '2026-05-12', voucherNo: 2, bookCode: 'CB', narration: null, debit: '0.00', credit: '200.00', balance: { amount: '1235367.50', side: 'Dr' } },
  ],
  totalDebit: '1234567.50',
  totalCredit: '200.00',
  closing: { amount: '1235367.50', side: 'Dr' },
};

function setup(reply: () => unknown = () => DTO) {
  return renderScreen(<LedgerReport />, { routes: [{ method: 'GET', path: '/api/reports/ledger', reply }] });
}

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('combobox', { name: 'Account' }));
  await user.keyboard('cash{Enter}');
  const from = screen.getByLabelText('From');
  await user.clear(from);
  await user.type(from, '01042026{Enter}');
  await user.type(screen.getByLabelText('To'), '{Control>}a{/Control}31052026');
}

describe('LedgerReport', () => {
  it('asks for the account before calling the server', async () => {
    const user = userEvent.setup();
    const { api } = setup();
    await screen.findByRole('combobox', { name: 'Account' });
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose the account');
    expect(api.calls.some((c) => c.path.startsWith('/api/reports'))).toBe(false);
  });

  it('shows the opening balance, the rows in Indian format with Dr/Cr, the totals and the closing balance', async () => {
    const user = userEvent.setup();
    const { api } = setup();
    await fill(user);
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(await screen.findByText(/Opening balance/)).toHaveTextContent('1,000.00 Dr');
    const grid = screen.getByRole('grid', { name: 'Ledger' });
    expect(within(grid).getByRole('row', { name: /^10-05-2026 1 CB Ramesh Traders/ })).toHaveTextContent('12,34,567.50');
    expect(within(grid).getByRole('row', { name: /^10-05-2026/ })).toHaveTextContent('12,35,567.50 Dr');
    expect(within(grid).getByText('Total').closest('tr')).toHaveTextContent('12,35,367.50 Dr');
    expect(api.calls.find((c) => c.path.startsWith('/api/reports/ledger'))!.path).toBe(
      '/api/reports/ledger?companyId=c1&yearId=y1&ledgerId=l-cash&from=2026-04-01&to=2026-05-31',
    );
  });

  it('exports a CSV with raw amounts and a title block', async () => {
    const user = userEvent.setup();
    const { bridge } = setup();
    await fill(user);
    await user.keyboard('{Control>}{Enter}{/Control}');
    await screen.findByText(/Opening balance/);
    await user.keyboard('{Control>}e{/Control}');
    await screen.findByText('CSV saved');
    expect(bridge.saved[0]!.mime).toBe('text/csv');
    expect(bridge.saved[0]!.suggestedName).toBe('ledger-cash.csv');
    expect(bridge.saved[0]!.data).toContain('Test Textiles\r\n2026-27\r\nLedger: Cash');
    expect(bridge.saved[0]!.data).toContain('10-05-2026,1,CB,Ramesh Traders,1234567.50,0.00,1235567.50 Dr');
  });

  it('refuses an end date before the start date', async () => {
    const user = userEvent.setup();
    setup();
    await fill(user);
    const to = screen.getByLabelText('To');
    await user.clear(to);
    await user.type(to, '01032026');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent(/end date is before the start date/i);
  });

  it('shows the server\'s message', async () => {
    const user = userEvent.setup();
    setup(() => {
      throw new ApiError(403, 'FORBIDDEN', 'You do not have access to one of these accounts');
    });
    await fill(user);
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have access to one of these accounts');
  });
});
