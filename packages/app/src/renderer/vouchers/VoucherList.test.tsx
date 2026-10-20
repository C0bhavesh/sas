import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import type { VoucherSummary } from '../api/types';
import type { FakeRoute } from '../testing/fakeClient';
import { renderScreen } from '../testing/render';
import { VoucherList } from './VoucherList';

const ROWS: VoucherSummary[] = [
  { id: 'v2', voucherNo: 2, date: '2026-05-12', kind: 'payment', bookCode: 'CB', narration: 'rent', total: '25000.00' },
  { id: 'v1', voucherNo: 1, date: '2026-05-10', kind: 'receipt', bookCode: 'CB', narration: null, total: '1234567.50' },
];

function routes(rows = ROWS) {
  const seen: string[] = [];
  const list: FakeRoute = {
    method: 'GET',
    path: '/api/companies/c1/vouchers',
    reply: ({ query }) => {
      seen.push(query.toString());
      return rows;
    },
  };
  return { seen, routes: [list] };
}

describe('VoucherList', () => {
  it('loads the whole year on open and shows Indian-formatted amounts', async () => {
    const { seen, routes: r } = routes();
    renderScreen(<VoucherList />, { routes: r });
    expect(await screen.findByRole('row', { name: /rent/ })).toHaveTextContent('25,000.00');
    expect(screen.getByRole('row', { name: /^1 10-05-2026 Receipt/ })).toHaveTextContent('12,34,567.50');
    expect(seen[0]).toBe('yearId=y1&from=2026-04-01&to=2027-03-31&limit=200');
  });

  it('Enter on a row opens the voucher in its own screen', async () => {
    const user = userEvent.setup();
    const { routes: r } = routes();
    const { navCalls } = renderScreen(<VoucherList />, { routes: r });
    await screen.findByRole('row', { name: /rent/ });
    screen.getByRole('grid').focus();
    await user.keyboard('{Enter}');
    expect(navCalls).toEqual(['open:payment {"editId":"v2"}']);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(navCalls[1]).toBe('open:receipt {"editId":"v1"}');
  });

  it('Enter on the To date reloads with the new dates and moves into the table', async () => {
    const user = userEvent.setup();
    const { seen, routes: r } = routes();
    renderScreen(<VoucherList />, { routes: r });
    await screen.findByRole('row', { name: /rent/ });
    const from = screen.getByLabelText('From');
    await user.clear(from);
    await user.type(from, '01052026{Enter}');
    const to = screen.getByLabelText('To');
    expect(to).toHaveFocus(); // From -> To
    await user.clear(to);
    await user.type(to, '31052026{Enter}');
    await waitFor(() => expect(seen).toHaveLength(2));
    expect(seen[1]).toBe('yearId=y1&from=2026-05-01&to=2026-05-31&limit=200');
    await waitFor(() => expect(screen.getByRole('grid')).toHaveFocus());
  });

  it('Ctrl+Enter reloads', async () => {
    const user = userEvent.setup();
    const { seen, routes: r } = routes();
    renderScreen(<VoucherList />, { routes: r });
    await screen.findByRole('row', { name: /rent/ });
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(seen).toHaveLength(2));
  });

  it('filters by book', async () => {
    const user = userEvent.setup();
    const { seen, routes: r } = routes();
    renderScreen(<VoucherList />, { routes: r });
    await screen.findByRole('row', { name: /rent/ });
    await user.type(screen.getByRole('combobox', { name: 'Book' }), 'journal{Enter}');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(seen.at(-1)).toContain('bookId=b-jv'));
  });

  it('says when nothing was found, and warns when the list is cut at 200', async () => {
    const empty = routes([]);
    const first = renderScreen(<VoucherList />, { routes: empty.routes });
    expect(await screen.findByText(/no vouchers found/i)).toBeInTheDocument();
    first.unmount();
    const many = Array.from({ length: 200 }, (_, i): VoucherSummary => ({ ...ROWS[0]!, id: `v${i}`, voucherNo: i + 1 }));
    renderScreen(<VoucherList />, { routes: routes(many).routes });
    expect(await screen.findByText(/showing the newest 200/i)).toBeInTheDocument();
  });

  it('shows the server\'s message when loading fails', async () => {
    renderScreen(<VoucherList />, {
      routes: [
        {
          method: 'GET',
          path: '/api/companies/c1/vouchers',
          reply: () => {
            throw new ApiError(403, 'FORBIDDEN', 'You do not have find rights on cash book');
          },
        },
      ],
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have find rights on cash book');
  });
});
