import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { CashBookDayDto } from '../api/endpoints';
import { renderScreen } from '../testing/render';
import { CashBookReport } from './CashBookReport';

const DAYS: CashBookDayDto[] = [
  { date: '2026-05-10', opening: { amount: '1000.00', side: 'Dr' }, receipts: '800.00', payments: '0.00', closing: { amount: '1800.00', side: 'Dr' } },
  { date: '2026-05-12', opening: { amount: '1800.00', side: 'Dr' }, receipts: '0.00', payments: '200.00', closing: { amount: '1600.00', side: 'Dr' } },
];

describe('CashBookReport', () => {
  it('shows one line per day with opening, receipts, payments and closing', async () => {
    const user = userEvent.setup();
    const { api } = renderScreen(<CashBookReport />, { routes: [{ method: 'GET', path: '/api/reports/cash-book', reply: () => DAYS }] });
    await screen.findByRole('combobox', { name: 'Book' });
    await user.click(screen.getByRole('combobox', { name: 'Book' }));
    await user.keyboard('cash{Enter}');
    await user.keyboard('{Control>}{Enter}{/Control}');
    const row = await screen.findByRole('row', { name: /^10-05-2026/ });
    expect(row).toHaveTextContent('1,000.00 Dr');
    expect(row).toHaveTextContent('800.00');
    expect(row).toHaveTextContent('1,800.00 Dr');
    expect(api.calls.find((c) => c.path.startsWith('/api/reports/cash-book'))!.path).toMatch(/bookId=b-cash/);
  });

  it('only offers cash and bank books', async () => {
    const user = userEvent.setup();
    renderScreen(<CashBookReport />);
    await user.click(await screen.findByRole('combobox', { name: 'Book' }));
    await user.keyboard('{ArrowDown}');
    const options = screen.getAllByRole('option').map((o) => o.textContent ?? '');
    expect(options.some((o) => o.includes('Cash Book'))).toBe(true);
    expect(options.some((o) => o.includes('Journal'))).toBe(false);
  });

  it('asks for the book first', async () => {
    const user = userEvent.setup();
    renderScreen(<CashBookReport />);
    await screen.findByRole('combobox', { name: 'Book' });
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose the book');
  });
});
