import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AgeingDto } from '../api/endpoints';
import { renderScreen } from '../testing/render';
import { AgeingReport } from './AgeingReport';

const DTO: AgeingDto = {
  bucketLabels: ['0-30', '31-60', '61-90', '90+'],
  rows: [{ ledgerId: 'l-ramesh', ledgerName: 'Ramesh Traders', side: 'Dr', buckets: ['100000.00', '200.00', '0.00', '400.00'], total: '100600.00', onAccount: '500.00', net: '100100.00' }],
  totals: { buckets: ['100000.00', '200.00', '0.00', '400.00'], total: '100600.00', onAccount: '500.00', net: '100100.00' },
};

describe('AgeingReport', () => {
  it('runs on open and shows one column per age bucket', async () => {
    const { api } = renderScreen(<AgeingReport />, { routes: [{ method: 'GET', path: '/api/reports/ageing', reply: () => DTO }] });
    const grid = await screen.findByRole('grid', { name: 'Outstanding ageing' });
    for (const label of ['0-30', '31-60', '61-90', '90+']) expect(within(grid).getByRole('columnheader', { name: label })).toBeInTheDocument();
    const row = within(grid).getByRole('row', { name: /Ramesh Traders/ });
    expect(row).toHaveTextContent('1,00,000.00');
    expect(row).toHaveTextContent('1,00,600.00');
    expect(row).toHaveTextContent('500.00');
    expect(grid.querySelector('tfoot')).toHaveTextContent('1,00,100.00'); // the Total column header would also match getByText('Total')
    expect(api.calls.find((c) => c.path.startsWith('/api/reports/ageing'))!.path).toMatch(/^\/api\/reports\/ageing\?companyId=c1&asOn=\d{4}-\d{2}-\d{2}$/);
  });

  it('filters by debtors or creditors', async () => {
    const user = userEvent.setup();
    const { api } = renderScreen(<AgeingReport />, { routes: [{ method: 'GET', path: '/api/reports/ageing', reply: () => DTO }] });
    await screen.findByRole('grid', { name: 'Outstanding ageing' });
    await user.click(screen.getByRole('combobox', { name: 'Show' }));
    await user.keyboard('debtors{Enter}');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await screen.findByRole('grid', { name: 'Outstanding ageing' });
    const last = api.calls.filter((c) => c.path.startsWith('/api/reports/ageing')).at(-1)!;
    expect(last.path).toContain('side=Dr');
  });

  it('exports a CSV with one column per bucket', async () => {
    const user = userEvent.setup();
    const { bridge } = renderScreen(<AgeingReport />, { routes: [{ method: 'GET', path: '/api/reports/ageing', reply: () => DTO }] });
    await screen.findByRole('grid', { name: 'Outstanding ageing' });
    await user.keyboard('{Control>}e{/Control}');
    await screen.findByText('CSV saved');
    expect(bridge.saved[0]!.data).toContain('Account,Side,0-30,31-60,61-90,90+,Total,On account,Net');
    expect(bridge.saved[0]!.data).toContain('Ramesh Traders,Dr,100000.00,200.00,0.00,400.00,100600.00,500.00,100100.00');
  });
});
