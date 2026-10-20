import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { renderScreen } from '../testing/render';
import { BookScreen } from './BookScreen';

describe('BookScreen', () => {
  it('lists the books', async () => {
    renderScreen(<BookScreen />);
    const grid = await screen.findByRole('grid', { name: 'Books' });
    expect(grid).toHaveTextContent('Cash Book');
    expect(grid).toHaveTextContent('Journal');
  });

  it('creates a bank book with its ledger and refreshes the cache', async () => {
    const user = userEvent.setup();
    const bodies: any[] = [];
    let bookGets = 0;
    renderScreen(<BookScreen />, {
      routes: [
        { method: 'POST', path: '/api/companies/c1/books', reply: ({ body }) => (bodies.push(body), { id: 'b-new' }) },
        { method: 'GET', path: '/api/companies/c1/books', reply: () => (bookGets++, []) },
      ],
    });
    await screen.findByRole('grid', { name: 'Books' });
    const before = bookGets;
    await user.type(screen.getByLabelText('Code'), 'HDFC{Enter}HDFC Current{Enter}bank{Enter}cash{Enter}');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('status')).toHaveTextContent('Book "HDFC Current" created');
    expect(bodies[0]).toEqual({ code: 'HDFC', name: 'HDFC Current', type: 'bank', defaultLedgerId: 'l-cash' });
    await waitFor(() => expect(bookGets).toBeGreaterThan(before));
  });

  it('a journal book needs no ledger and the ledger box is then hidden', async () => {
    const user = userEvent.setup();
    const bodies: any[] = [];
    renderScreen(<BookScreen />, {
      routes: [{ method: 'POST', path: '/api/companies/c1/books', reply: ({ body }) => (bodies.push(body), { id: 'b2' }) }],
    });
    await screen.findByRole('grid', { name: 'Books' });
    await user.type(screen.getByLabelText('Code'), 'JV2{Enter}Journal 2{Enter}journal{Enter}');
    expect(screen.queryByRole('combobox', { name: 'Cash or bank ledger' })).toBeNull();
    await user.keyboard('{Control>}s{/Control}');
    await screen.findByRole('status');
    expect(bodies[0]).toEqual({ code: 'JV2', name: 'Journal 2', type: 'journal' });
  });

  it('a cash or bank book needs its ledger', async () => {
    const user = userEvent.setup();
    const { api } = renderScreen(<BookScreen />);
    await screen.findByRole('grid', { name: 'Books' });
    await user.type(screen.getByLabelText('Code'), 'X{Enter}X book{Enter}cash{Enter}');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose the cash or bank ledger of this book');
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('shows the server\'s message', async () => {
    const user = userEvent.setup();
    renderScreen(<BookScreen />, {
      routes: [{ method: 'POST', path: '/api/companies/c1/books', reply: () => { throw new ApiError(409, 'DUPLICATE', 'That name or number already exists'); } }],
    });
    await screen.findByRole('grid', { name: 'Books' });
    await user.type(screen.getByLabelText('Code'), 'CB{Enter}Again{Enter}journal{Enter}');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent('That name or number already exists');
  });
});
