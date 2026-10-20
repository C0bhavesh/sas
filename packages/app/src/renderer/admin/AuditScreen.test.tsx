import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import type { AuditRow } from '../api/endpoints';
import { renderScreen } from '../testing/render';
import { AuditScreen } from './AuditScreen';

const ROWS: AuditRow[] = [
  {
    at: '2026-10-20T09:30:00.000Z',
    userId: 'u1',
    username: 'asha',
    entity: 'voucher',
    entityId: 'v1',
    action: 'add',
    oldValues: null,
    newValues: { voucherNo: 12, date: '2026-05-10', kind: 'receipt', narration: null, lines: [{ ledgerId: 'l1', debit: '0.00', credit: '1000.00' }] },
  },
  { at: '2026-10-20T09:35:00.000Z', userId: 'u1', username: 'asha', entity: 'company', entityId: 'c1', action: 'freeze', oldValues: { freezeDate: null }, newValues: { freezeDate: '2026-06-30' } },
];

describe('AuditScreen', () => {
  it('loads the log for the company and shows who did what, with a readable summary', async () => {
    const { api } = renderScreen(<AuditScreen />, { routes: [{ method: 'GET', path: '/api/audit', reply: () => ROWS }] });
    const grid = await screen.findByRole('grid', { name: 'Audit log' });
    const voucher = within(grid).getByRole('row', { name: /voucher/ });
    expect(voucher).toHaveTextContent('asha');
    expect(voucher).toHaveTextContent('add');
    expect(voucher).toHaveTextContent('Voucher no. 12');
    expect(within(grid).getByRole('row', { name: /freeze/ })).toHaveTextContent('freezeDate');
    expect(api.calls.find((c) => c.path.startsWith('/api/audit'))!.path).toMatch(/^\/api\/audit\?companyId=c1&from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/);
  });

  it('shows the time in dd-mm-yyyy hh:mm form', async () => {
    renderScreen(<AuditScreen />, { routes: [{ method: 'GET', path: '/api/audit', reply: () => ROWS }] });
    const grid = await screen.findByRole('grid', { name: 'Audit log' });
    expect(within(grid).getAllByRole('row')[1]!.textContent).toMatch(/\d{2}-\d{2}-\d{4} \d{2}:\d{2}/);
  });

  it('filters by entity', async () => {
    const user = userEvent.setup();
    const { api } = renderScreen(<AuditScreen />, { routes: [{ method: 'GET', path: '/api/audit', reply: () => ROWS }] });
    await screen.findByRole('grid', { name: 'Audit log' });
    await user.click(screen.getByRole('combobox', { name: 'What' }));
    await user.keyboard('vouch{Enter}');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await screen.findByRole('grid', { name: 'Audit log' });
    expect(api.calls.filter((c) => c.path.startsWith('/api/audit')).at(-1)!.path).toContain('entity=voucher');
  });

  it('Ctrl+E exports the full log as CSV', async () => {
    const user = userEvent.setup();
    const { bridge } = renderScreen(<AuditScreen />, { routes: [{ method: 'GET', path: '/api/audit', reply: () => ROWS }] });
    await screen.findByRole('grid', { name: 'Audit log' });
    await user.keyboard('{Control>}e{/Control}');
    await screen.findByText('CSV saved');
    expect(bridge.saved[0]!.suggestedName).toBe('audit-log.csv');
    expect(bridge.saved[0]!.data).toContain('"{""voucherNo"":12');
  });

  it('explains when the user may not read the log', async () => {
    renderScreen(<AuditScreen />, {
      routes: [{ method: 'GET', path: '/api/audit', reply: () => { throw new ApiError(403, 'FORBIDDEN', 'You may not export the audit log'); } }],
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('You may not export the audit log');
  });
});
