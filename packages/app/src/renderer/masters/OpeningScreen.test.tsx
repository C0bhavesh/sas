import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { OpeningRow } from '../api/endpoints';
import type { SessionValue } from '../session/Session';
import type { FakeRoute } from '../testing/fakeClient';
import { renderScreen } from '../testing/render';
import { YEAR_2025 } from '../testing/sampleData';
import { OpeningScreen } from './OpeningScreen';

const OPENINGS: OpeningRow[] = [
  { ledgerId: 'l-cash', ledgerName: 'Cash', groupName: 'Cash-in-Hand', amount: '10000.00', side: 'Dr' },
  { ledgerId: 'l-ramesh', ledgerName: 'Ramesh Traders', groupName: 'Sundry Debtors', amount: '2500.50', side: 'Cr' },
];

function setup(opts: { openings?: OpeningRow[]; session?: Partial<SessionValue> } = {}) {
  const posts: { path: string; body: any }[] = [];
  const routes: FakeRoute[] = [
    { method: 'GET', path: '/api/companies/c1/openings', reply: () => opts.openings ?? OPENINGS },
    { method: 'POST', path: /^\/api\/ledgers\/[^/]+\/opening$/, reply: ({ path, body }) => void posts.push({ path, body }) },
  ];
  return { posts, ...renderScreen(<OpeningScreen />, { routes, session: opts.session }) };
}

describe('OpeningScreen', () => {
  it('lists the openings of the current year with Dr and Cr totals and the difference', async () => {
    const { api } = setup();
    const grid = await screen.findByRole('grid', { name: 'Opening balances' });
    expect(within(grid).getByRole('row', { name: /Cash/ })).toHaveTextContent('10,000.00');
    expect(within(grid).getByRole('row', { name: /Ramesh Traders/ })).toHaveTextContent('2,500.50');
    expect(screen.getByText(/Difference 7,499\.50 Dr/)).toBeInTheDocument();
    expect(api.calls.find((c) => c.path.includes('/openings'))!.path).toBe('/api/companies/c1/openings?yearId=y1');
  });

  it('says the openings balance when Dr equals Cr', async () => {
    setup({ openings: [{ ...OPENINGS[0]!, amount: '100.00' }, { ...OPENINGS[1]!, amount: '100.00' }] });
    expect(await screen.findByText('The opening balances balance.')).toBeInTheDocument();
  });

  it('saves an opening balance with the keyboard and reloads the list', async () => {
    const user = userEvent.setup();
    const { posts, api } = setup();
    await screen.findByRole('grid', { name: 'Opening balances' });
    await user.click(screen.getByRole('combobox', { name: 'Account' }));
    await user.keyboard('suresh{Enter}1500{Enter}cr{Enter}');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('status')).toHaveTextContent('Opening balance saved for Suresh Textiles');
    expect(posts).toEqual([{ path: '/api/ledgers/l-suresh/opening', body: { yearId: 'y1', amount: '1500.00', side: 'Cr' } }]);
    expect(api.calls.filter((c) => c.path.includes('/openings')).length).toBe(2);
  });

  it('needs an account, an amount and a side', async () => {
    const user = userEvent.setup();
    const { posts } = setup();
    await screen.findByRole('grid', { name: 'Opening balances' });
    await user.keyboard('{Control>}s{/Control}');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Choose the account');
    expect(alert).toHaveTextContent('Enter the amount');
    expect(alert).toHaveTextContent('Choose Dr or Cr');
    expect(posts).toHaveLength(0);
  });

  it('is read-only when the year is not open', async () => {
    setup({ session: { year: YEAR_2025 } });
    expect(await screen.findByText(/year 2025-26 is closed/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Account' })).toBeNull();
  });
});
