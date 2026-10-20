import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { renderScreen } from '../testing/render';
import { LedgerScreen } from './LedgerScreen';

describe('LedgerScreen', () => {
  it('lists the accounts and filters them as you type', async () => {
    const user = userEvent.setup();
    renderScreen(<LedgerScreen />);
    const grid = await screen.findByRole('grid', { name: 'Accounts' });
    expect(within(grid).getAllByRole('row')).toHaveLength(5); // header + 4
    await user.type(screen.getByLabelText('Find account'), 'sur');
    expect(within(grid).getAllByRole('row')).toHaveLength(3); // header + Ramesh (Surat) + Suresh
  });

  it('creates an account with the keyboard and refreshes the cache', async () => {
    const user = userEvent.setup();
    const bodies: any[] = [];
    let ledgerGets = 0;
    renderScreen(<LedgerScreen />, {
      routes: [
        { method: 'POST', path: '/api/companies/c1/ledgers', reply: ({ body }) => (bodies.push(body), { id: 'l-new' }) },
        { method: 'GET', path: '/api/companies/c1/ledgers', reply: () => (ledgerGets++, []) },
      ],
    });
    await screen.findByRole('grid', { name: 'Accounts' });
    const gets0 = ledgerGets;
    await user.click(screen.getByRole('combobox', { name: 'Group' }));
    await user.keyboard('debtors{Enter}Mahesh Fabrics{Enter}Surat{Enter}24AAAAA0000A1Z5{Enter}AAAAA0000A{Enter}45{Enter}');
    await user.type(screen.getByLabelText('Address'), 'Ring Road');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('status')).toHaveTextContent('Account "Mahesh Fabrics" created');
    expect(bodies[0]).toEqual({ groupCode: 42, name: 'Mahesh Fabrics', city: 'Surat', gstin: '24AAAAA0000A1Z5', pan: 'AAAAA0000A', creditDays: 45, address: 'Ring Road' });
    await waitFor(() => expect(ledgerGets).toBeGreaterThan(gets0));
    expect(screen.getByLabelText('Name')).toHaveValue('');
  });

  it('needs a group and a name', async () => {
    const user = userEvent.setup();
    const { api } = renderScreen(<LedgerScreen />);
    await screen.findByRole('grid', { name: 'Accounts' });
    await user.keyboard('{Control>}s{/Control}');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Choose the group');
    expect(alert).toHaveTextContent('Enter the account name');
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('only accepts whole numbers of credit days', async () => {
    const user = userEvent.setup();
    renderScreen(<LedgerScreen />);
    await screen.findByRole('grid', { name: 'Accounts' });
    await user.type(screen.getByLabelText('Credit days'), '4a5.');
    expect(screen.getByLabelText('Credit days')).toHaveValue('45');
  });

  it('shows the duplicate-name message from the server', async () => {
    const user = userEvent.setup();
    renderScreen(<LedgerScreen />, {
      routes: [{ method: 'POST', path: '/api/companies/c1/ledgers', reply: () => { throw new ApiError(409, 'DUPLICATE', 'That name or number already exists'); } }],
    });
    await screen.findByRole('grid', { name: 'Accounts' });
    await user.click(screen.getByRole('combobox', { name: 'Group' }));
    await user.keyboard('debtors{Enter}Ramesh Traders');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent('That name or number already exists');
  });

  it('Ctrl+N clears the form', async () => {
    const user = userEvent.setup();
    renderScreen(<LedgerScreen />);
    await screen.findByRole('grid', { name: 'Accounts' });
    await user.type(screen.getByLabelText('Name'), 'Half typed');
    await user.keyboard('{Control>}n{/Control}');
    expect(screen.getByLabelText('Name')).toHaveValue('');
  });
});
