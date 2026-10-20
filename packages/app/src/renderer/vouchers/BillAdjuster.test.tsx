import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PendingBill } from '../api/types';
import { renderScreen } from '../testing/render';
import { BillAdjuster } from './BillAdjuster';

const bill = (id: string, billNo: string, billDate: string, pending: string, side: 'Dr' | 'Cr' = 'Dr'): PendingBill => ({
  id,
  billNo,
  billDate,
  dueDate: null,
  side,
  original: pending,
  pending,
});
const BILLS = [bill('b2', 'S-2', '2026-05-01', '400.00'), bill('b1', 'S-1', '2026-04-01', '300.00'), bill('bx', 'P-1', '2026-04-15', '999.00', 'Cr')];

function setup(props: Partial<React.ComponentProps<typeof BillAdjuster>> = {}) {
  const onDone = vi.fn();
  const onCancel = vi.fn();
  const utils = renderScreen(
    <BillAdjuster
      companyId="c1"
      ledgerId="l-ramesh"
      ledgerName="Ramesh Traders"
      lineSide="Cr"
      lineAmount="500.00"
      current={[]}
      onDone={onDone}
      onCancel={onCancel}
      {...props}
    />,
    { routes: [{ method: 'GET', path: '/api/companies/c1/ledgers/l-ramesh/pending-bills', reply: () => BILLS }] },
  );
  return { onDone, onCancel, ...utils };
}

describe('BillAdjuster', () => {
  it('lists only the bills this line can settle (opposite side), oldest first', async () => {
    setup();
    expect(await screen.findByRole('dialog', { name: 'Bills of Ramesh Traders' })).toBeInTheDocument();
    await screen.findByLabelText('Amount for bill S-1');
    expect(screen.queryByLabelText('Amount for bill P-1')).toBeNull(); // a credit bill cannot be settled by a credit line
    const inputs = screen.getAllByLabelText(/^Amount for bill/).map((i) => i.getAttribute('aria-label'));
    expect(inputs).toEqual(['Amount for bill S-1', 'Amount for bill S-2']);
  });

  it('starts from the adjustments already chosen', async () => {
    setup({ current: [{ billId: 'b2', amount: '120.00', kind: 'discount' }] });
    expect(await screen.findByLabelText('Amount for bill S-2')).toHaveValue('120.00');
    expect(screen.getByLabelText('Type for bill S-2')).toHaveValue('discount');
  });

  it('Alt+A fills the amounts from the oldest bill and shows the rest as on account', async () => {
    const user = userEvent.setup();
    setup({ lineAmount: '500.00' });
    await screen.findByLabelText('Amount for bill S-1');
    await user.keyboard('{Alt>}a{/Alt}');
    expect(screen.getByLabelText('Amount for bill S-1')).toHaveValue('300.00');
    expect(screen.getByLabelText('Amount for bill S-2')).toHaveValue('200.00');
    expect(screen.getByText(/On account 0\.00/)).toBeInTheDocument();
  });

  it('Ctrl+Enter accepts the amounts, with their types', async () => {
    const user = userEvent.setup();
    const { onDone } = setup({ lineAmount: '500.00' });
    await screen.findByLabelText('Amount for bill S-1');
    await user.keyboard('{Alt>}a{/Alt}');
    await user.selectOptions(screen.getByLabelText('Type for bill S-2'), 'discount');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(onDone).toHaveBeenCalledWith([
      { billId: 'b1', amount: '300.00', kind: 'cash' },
      { billId: 'b2', amount: '200.00', kind: 'discount' },
    ]);
  });

  it('Enter on the last bill accepts too', async () => {
    const user = userEvent.setup();
    const { onDone } = setup({ lineAmount: '500.00' });
    await user.type(await screen.findByLabelText('Amount for bill S-1'), '100{Enter}');
    await user.keyboard('50{Enter}');
    expect(onDone).toHaveBeenCalledWith([
      { billId: 'b1', amount: '100.00', kind: 'cash' },
      { billId: 'b2', amount: '50.00', kind: 'cash' },
    ]);
  });

  it('refuses more than a bill\'s pending amount', async () => {
    const user = userEvent.setup();
    const { onDone } = setup({ lineAmount: '900.00' });
    await user.type(await screen.findByLabelText('Amount for bill S-1'), '400');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(screen.getByRole('alert')).toHaveTextContent('Bill S-1: more than the pending 300.00');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('refuses a total above the line amount', async () => {
    const user = userEvent.setup();
    const { onDone } = setup({ lineAmount: '100.00' });
    await user.type(await screen.findByLabelText('Amount for bill S-1'), '300');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(screen.getByRole('alert')).toHaveTextContent(/more than the line amount/i);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('Esc cancels without changing anything', async () => {
    const user = userEvent.setup();
    const { onCancel, onDone } = setup();
    await screen.findByLabelText('Amount for bill S-1');
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('shows the credit bill to a debit line, and not the debit bills', async () => {
    setup({ lineSide: 'Dr' });
    expect(await screen.findByLabelText('Amount for bill P-1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Amount for bill S-1')).toBeNull();
  });

  it('says so when the account has no bills to settle', async () => {
    renderScreen(
      <BillAdjuster companyId="c1" ledgerId="l-ramesh" ledgerName="Ramesh Traders" lineSide="Cr" lineAmount="10.00" current={[]} onDone={() => {}} onCancel={() => {}} />,
      { routes: [{ method: 'GET', path: '/api/companies/c1/ledgers/l-ramesh/pending-bills', reply: () => [] }] },
    );
    expect(await screen.findByText(/no pending bills/i)).toBeInTheDocument();
  });
});
