import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import type { PendingBill, VoucherView } from '../api/types';
import type { FakeRoute } from '../testing/fakeClient';
import { renderScreen } from '../testing/render';
import { VoucherEntry } from './VoucherEntry';

const BILLS: PendingBill[] = [
  { id: 'b1', billNo: 'S-1', billDate: '2026-04-01', dueDate: null, side: 'Dr', original: '300.00', pending: '300.00' },
  { id: 'b2', billNo: 'S-2', billDate: '2026-05-01', dueDate: null, side: 'Dr', original: '400.00', pending: '400.00' },
];

function serverRoutes() {
  const saved: any[] = [];
  const routes: FakeRoute[] = [
    {
      method: 'POST',
      path: '/api/vouchers',
      reply: ({ body }) => {
        saved.push(body);
        return { voucherId: `v${saved.length}`, voucherNo: saved.length };
      },
    },
    { method: 'GET', path: '/api/companies/c1/ledgers/l-ramesh/pending-bills', reply: () => BILLS },
  ];
  return { saved, routes };
}

const account = (n: number) => screen.getByRole('combobox', { name: `Account line ${n}` });

/** Date, then Enter through Narration to the first account. */
async function fillDate(user: ReturnType<typeof userEvent.setup>, date = '12052026') {
  await screen.findByRole('combobox', { name: 'Book' });
  await user.keyboard(`${date}{Enter}{Enter}`); // the cursor starts on Date; Enter commits it, Enter skips the narration
}

describe('receipt', () => {
  it('can be entered and saved with the keyboard alone', async () => {
    const user = userEvent.setup();
    const { saved, routes } = serverRoutes();
    renderScreen(<VoucherEntry kind="receipt" />, { routes });
    await fillDate(user);
    await user.keyboard('ram{Enter}1000{Enter}{Enter}'); // account, amount, line narration -> a second (blank) line appears
    expect(account(2)).toHaveFocus();
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('status')).toHaveTextContent('Saved as voucher no. 1');
    expect(saved).toEqual([
      {
        companyId: 'c1',
        yearId: 'y1',
        bookId: 'b-cash',
        kind: 'receipt',
        date: '2026-05-12',
        lines: [{ ledgerId: 'l-ramesh', side: 'Cr', amount: '1000.00' }],
      },
    ]);
    // ready for the next voucher: lines cleared, book and date kept, cursor on the first account
    expect(account(1)).toHaveValue('');
    expect(account(1)).toHaveFocus();
    expect(screen.getByLabelText('Date')).toHaveValue('12-05-2026');
  });

  it('commits a date that is still being typed when Ctrl+S is pressed', async () => {
    const user = userEvent.setup();
    const { saved, routes } = serverRoutes();
    renderScreen(<VoucherEntry kind="receipt" />, { routes });
    await screen.findByRole('combobox', { name: 'Book' });
    await user.keyboard('13052026'); // not committed with Enter
    await user.keyboard('{Control>}s{/Control}'); // missing account, so nothing is saved ...
    expect(await screen.findByRole('alert')).toHaveTextContent('Add at least one line');
    expect(screen.getByLabelText('Date')).toHaveValue('13-05-2026'); // ... but the date was committed
    expect(saved).toHaveLength(0);
  });

  it('lists the problems and sends nothing when the form is not complete', async () => {
    const user = userEvent.setup();
    const { saved, routes } = serverRoutes();
    renderScreen(<VoucherEntry kind="receipt" />, { routes });
    await fillDate(user);
    await user.keyboard('ram{Enter}'); // account chosen, amount missing
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Line 1: enter an amount');
    expect(saved).toHaveLength(0);
  });

  it('shows the server\'s message when the save is refused', async () => {
    const user = userEvent.setup();
    const { routes } = serverRoutes();
    renderScreen(<VoucherEntry kind="receipt" />, {
      routes: [
        {
          method: 'POST',
          path: '/api/vouchers',
          reply: () => {
            throw new ApiError(422, 'PERIOD_FROZEN', 'Entries on or before 2026-06-30 are frozen');
          },
        },
        ...routes,
      ],
    });
    await fillDate(user);
    await user.keyboard('ram{Enter}50{Enter}');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Entries on or before 2026-06-30 are frozen');
  });

  it('Enter on a blank last line does not add another line', async () => {
    const user = userEvent.setup();
    renderScreen(<VoucherEntry kind="receipt" />, { routes: serverRoutes().routes });
    await fillDate(user);
    await screen.findByRole('combobox', { name: 'Account line 1' });
    await user.keyboard('{Enter}'); // nothing typed: Lookup with no text and no pick lets Enter through to the next field
    await user.keyboard('{Enter}{Enter}');
    expect(screen.queryByRole('combobox', { name: 'Account line 2' })).toBeNull();
  });

  it('Ctrl+Del removes the current line, and clears the only line instead of removing it', async () => {
    const user = userEvent.setup();
    renderScreen(<VoucherEntry kind="receipt" />, { routes: serverRoutes().routes });
    await fillDate(user);
    await user.keyboard('ram{Enter}10{Enter}{Enter}');
    await user.keyboard('suresh{Enter}20{Enter}'); // line 2 filled
    expect(account(2)).toHaveValue('Suresh Textiles');
    await user.keyboard('{Control>}{Delete}{/Control}');
    expect(screen.queryByRole('combobox', { name: 'Account line 2' })).toBeNull();
    await user.keyboard('{Control>}{Delete}{/Control}');
    expect(account(1)).toHaveValue('');
  });
});

describe('journal', () => {
  async function fillJournal(user: ReturnType<typeof userEvent.setup>) {
    await fillDate(user);
    await user.keyboard('ram{Enter}100{Enter}{Enter}'); // line 1: debit 100; then line narration; Enter moves to line 2
    await user.keyboard('cash{Enter}90'); // line 2: credit 90 (the credit box is the one in Enter-navigation for a credit line)
  }

  it('refuses an unbalanced journal, then saves once it balances', async () => {
    const user = userEvent.setup();
    const { saved, routes } = serverRoutes();
    renderScreen(<VoucherEntry kind="journal" />, { routes });
    await fillJournal(user);
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Debits 100.00 and credits 90.00 differ');
    expect(saved).toHaveLength(0);

    const credit = screen.getByLabelText('Credit line 2');
    await user.clear(credit);
    await user.type(credit, '100');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('status')).toHaveTextContent('Saved as voucher no. 1');
    expect(saved[0]).toMatchObject({
      kind: 'journal',
      bookId: 'b-jv',
      lines: [
        { ledgerId: 'l-ramesh', side: 'Dr', amount: '100.00' },
        { ledgerId: 'l-cash', side: 'Cr', amount: '100.00' },
      ],
    });
  });

  it('a new line is pre-filled with the amount and side that would balance the voucher', async () => {
    const user = userEvent.setup();
    renderScreen(<VoucherEntry kind="journal" />, { routes: serverRoutes().routes });
    await fillJournal(user);
    await user.keyboard('{Enter}{Enter}'); // credit 90 -> line narration -> last field: add a line
    expect(account(3)).toHaveFocus();
    expect(screen.getByLabelText('Credit line 3')).toHaveValue('10.00'); // debits 100, credits 90: 10 more credit balances it
  });

  it('typing in the other column switches the side of the line', async () => {
    const user = userEvent.setup();
    renderScreen(<VoucherEntry kind="journal" />, { routes: serverRoutes().routes });
    await fillDate(user);
    await user.keyboard('ram{Enter}');
    const debit = screen.getByLabelText('Debit line 1');
    const credit = screen.getByLabelText('Credit line 1');
    await user.type(debit, '40');
    expect(debit).toHaveValue('40');
    await user.type(credit, '7');
    expect(credit).toHaveValue('7');
    expect(debit).toHaveValue('');
  });
});

describe('bills', () => {
  it('Ctrl+B opens the bills of the account; the adjustments go into the saved voucher', async () => {
    const user = userEvent.setup();
    const { saved, routes } = serverRoutes();
    renderScreen(<VoucherEntry kind="receipt" />, { routes });
    await fillDate(user);
    await user.keyboard('ram{Enter}500{Control>}b{/Control}');
    const panel = await screen.findByRole('dialog', { name: 'Bills of Ramesh Traders' });
    await within(panel).findByLabelText('Amount for bill S-1');
    await user.keyboard('{Alt>}a{/Alt}{Control>}{Enter}{/Control}');
    expect(screen.queryByRole('dialog', { name: /Bills of/ })).toBeNull();
    await user.keyboard('{Control>}s{/Control}');
    await screen.findByRole('status');
    expect(saved[0].lines[0].adjustments).toEqual([
      { billId: 'b1', amount: '300.00', kind: 'cash' },
      { billId: 'b2', amount: '200.00', kind: 'cash' },
    ]);
  });

  it('asks for the account and the amount first', async () => {
    const user = userEvent.setup();
    renderScreen(<VoucherEntry kind="receipt" />, { routes: serverRoutes().routes });
    await fillDate(user);
    await user.keyboard('{Control>}b{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent(/choose the account first/i);
    await user.keyboard('ram{Enter}');
    await user.keyboard('{Control>}b{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent(/enter the amount first/i);
  });

  it('changing the account of a line drops its bill adjustments', async () => {
    const user = userEvent.setup();
    const { saved, routes } = serverRoutes();
    renderScreen(<VoucherEntry kind="receipt" />, { routes });
    await fillDate(user);
    await user.keyboard('ram{Enter}300{Control>}b{/Control}');
    await screen.findByLabelText('Amount for bill S-1');
    await user.keyboard('{Alt>}a{/Alt}{Control>}{Enter}{/Control}');
    await user.click(account(1));
    await user.keyboard('suresh{Enter}');
    await user.keyboard('{Control>}s{/Control}');
    await screen.findByRole('status');
    expect(saved[0].lines[0]).toEqual({ ledgerId: 'l-suresh', side: 'Cr', amount: '300.00' });
  });
});

describe('editing an existing voucher', () => {
  const VIEW = (version: number, amount = '300.00'): VoucherView => ({
    id: 'v1',
    companyId: 'c1',
    yearId: 'y1',
    bookId: 'b-cash',
    kind: 'receipt',
    voucherNo: 12,
    date: '2026-05-10',
    narration: null,
    version,
    lines: [{ lineNo: 1, ledgerId: 'l-ramesh', ledgerName: 'Ramesh Traders', side: 'Cr', amount, narration: null, adjustments: [] }],
  });

  function editRoutes(opts: { putError?: ApiError } = {}) {
    let version = 3;
    let amount = '300.00';
    const puts: any[] = [];
    const deletes: string[] = [];
    const routes: FakeRoute[] = [
      { method: 'GET', path: '/api/vouchers/v1', reply: () => VIEW(version, amount) },
      {
        method: 'PUT',
        path: '/api/vouchers/v1',
        reply: ({ body }) => {
          if (opts.putError) throw opts.putError;
          puts.push(body);
          version += 1;
          amount = body.lines[0].amount;
          return { version };
        },
      },
      {
        method: 'DELETE',
        path: '/api/vouchers/v1',
        reply: ({ query }) => {
          deletes.push(query.get('version')!);
          return undefined;
        },
      },
    ];
    return { routes, puts, deletes };
  }

  it('loads the voucher, sends its version on save, and reloads the new one', async () => {
    const user = userEvent.setup();
    const { routes, puts } = editRoutes();
    renderScreen(<VoucherEntry kind="receipt" editId="v1" />, { routes });
    expect(await screen.findByRole('heading', { name: /Cash \/ Bank Receipt — no\. 12/ })).toBeInTheDocument();
    expect(account(1)).toHaveValue('Ramesh Traders');
    expect(screen.getByRole('combobox', { name: 'Book' })).toBeDisabled();
    const amount = screen.getByLabelText('Amount line 1');
    await user.clear(amount);
    await user.type(amount, '450');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('status')).toHaveTextContent('Voucher no. 12 updated');
    expect(puts).toEqual([{ version: 3, date: '2026-05-10', lines: [{ ledgerId: 'l-ramesh', side: 'Cr', amount: '450.00' }] }]);
    expect(screen.getByLabelText('Amount line 1')).toHaveValue('450.00');
  });

  it('offers to reload when someone else changed the voucher', async () => {
    const user = userEvent.setup();
    const { routes } = editRoutes({ putError: new ApiError(409, 'STALE_VERSION', 'This voucher was changed by someone else. Reload and try again.') });
    const { api } = renderScreen(<VoucherEntry kind="receipt" editId="v1" />, { routes });
    await screen.findByRole('heading', { name: /no\. 12/ });
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent('changed by someone else');
    const gets = () => api.calls.filter((c) => c.method === 'GET' && c.path === '/api/vouchers/v1').length;
    expect(gets()).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Reload voucher' }));
    await waitFor(() => expect(gets()).toBe(2));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Ctrl+D asks first; confirming deletes with the version and goes back', async () => {
    const user = userEvent.setup();
    const { routes, deletes } = editRoutes();
    const { navCalls } = renderScreen(<VoucherEntry kind="receipt" editId="v1" />, { routes });
    await screen.findByRole('heading', { name: /no\. 12/ });
    await user.keyboard('{Control>}d{/Control}');
    expect(await screen.findByRole('dialog', { name: 'Delete voucher' })).toBeInTheDocument();
    expect(deletes).toEqual([]);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(deletes).toEqual(['3']));
    await waitFor(() => expect(navCalls).toContain('back'));
  });

  it('Esc in the delete question keeps the voucher', async () => {
    const user = userEvent.setup();
    const { routes, deletes } = editRoutes();
    renderScreen(<VoucherEntry kind="receipt" editId="v1" />, { routes });
    await screen.findByRole('heading', { name: /no\. 12/ });
    await user.keyboard('{Control>}d{/Control}{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Delete voucher' })).toBeNull();
    expect(deletes).toEqual([]);
  });

  it('Ctrl+D does nothing on a new voucher; Ctrl+N on an existing one opens a fresh screen', async () => {
    const user = userEvent.setup();
    const { routes } = editRoutes();
    const fresh = renderScreen(<VoucherEntry kind="receipt" />, { routes });
    await screen.findByRole('combobox', { name: 'Book' });
    await user.keyboard('{Control>}d{/Control}');
    expect(screen.queryByRole('dialog', { name: 'Delete voucher' })).toBeNull();
    fresh.unmount();

    const edit = renderScreen(<VoucherEntry kind="receipt" editId="v1" />, { routes });
    await screen.findByRole('heading', { name: /no\. 12/ });
    await user.keyboard('{Control>}n{/Control}');
    expect(edit.navCalls).toContain('open:receipt');
  });

  it('shows a message when the voucher cannot be loaded', async () => {
    renderScreen(<VoucherEntry kind="receipt" editId="gone" />, {
      routes: [
        {
          method: 'GET',
          path: '/api/vouchers/gone',
          reply: () => {
            throw new ApiError(404, 'NOT_FOUND', 'Voucher not found');
          },
        },
      ],
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Voucher not found');
  });
});
