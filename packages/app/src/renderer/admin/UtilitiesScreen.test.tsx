import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import type { BackupFile } from '../api/endpoints';
import type { FakeRoute } from '../testing/fakeClient';
import { renderScreen } from '../testing/render';
import { COMPANY, YEAR_2025, YEAR_2026 } from '../testing/sampleData';
import { UtilitiesScreen } from './UtilitiesScreen';

const BACKUPS: BackupFile[] = [
  { name: 'sas-20261003-010000.dump', path: 'D:/b/sas-20261003-010000.dump', size: 58973, modified: '2026-10-03T01:00:00.000Z' },
  { name: 'sas-20261001-010000.dump', path: 'D:/b/sas-20261001-010000.dump', size: 58000, modified: '2026-10-01T01:00:00.000Z' },
];

function setup(opts: { session?: object; backups?: BackupFile[] | 'unset'; extra?: FakeRoute[] } = {}) {
  const calls: { path: string; body: any }[] = [];
  const record = (path: string, body: any) => void calls.push({ path, body });
  const routes: FakeRoute[] = [
    ...(opts.extra ?? []),
    {
      method: 'GET',
      path: '/api/backups',
      reply: () => {
        if (opts.backups === 'unset') throw new ApiError(501, 'NOT_CONFIGURED', 'Backup is not configured on this server');
        return opts.backups ?? BACKUPS;
      },
    },
    { method: 'POST', path: '/api/backup', reply: () => (record('/api/backup', {}), { file: 'D:/b/sas-20261020-120000.dump', removed: [] }) },
    { method: 'POST', path: '/api/restore', reply: ({ body }) => record('/api/restore', body) },
    { method: 'POST', path: /^\/api\/companies\/c1\/freeze$/, reply: ({ body }) => record('freeze', body) },
    { method: 'POST', path: /^\/api\/years\/[^/]+\/close$/, reply: ({ path, body }) => (record(path, body), { nextYearId: 'y2', netProfit: '260000.00', carriedLedgers: 4, carriedBills: 7 }) },
    { method: 'POST', path: /^\/api\/years\/[^/]+\/(reopen|lock)$/, reply: ({ path, body }) => record(path, body) },
  ];
  let reloaded = 0;
  let refreshed = 0;
  let loggedOut = 0;
  const utils = renderScreen(<UtilitiesScreen />, {
    routes,
    session: { reloadYears: async () => void reloaded++, refreshCompanies: async () => void refreshed++, logout: () => void loggedOut++, ...(opts.session ?? {}) },
  });
  return { calls, counts: { reloaded: () => reloaded, refreshed: () => refreshed, loggedOut: () => loggedOut }, ...utils };
}

describe('freeze date', () => {
  it('shows the current freeze date and sets a new one', async () => {
    const user = userEvent.setup();
    const { calls, counts } = setup({ session: { company: { ...COMPANY, freezeDate: '2026-06-30' } } });
    expect(await screen.findByText(/entries up to 30-06-2026 are frozen/i)).toBeInTheDocument();
    const date = screen.getByLabelText('Freeze entries up to');
    await user.clear(date);
    await user.type(date, '31072026');
    await user.click(screen.getByRole('button', { name: 'Set freeze date' }));
    await waitFor(() => expect(calls).toContainEqual({ path: 'freeze', body: { date: '2026-07-31' } }));
    expect(counts.refreshed()).toBe(1);
  });

  it('removes the freeze', async () => {
    const user = userEvent.setup();
    const { calls } = setup({ session: { company: { ...COMPANY, freezeDate: '2026-06-30' } } });
    await user.click(await screen.findByRole('button', { name: 'Remove freeze' }));
    await waitFor(() => expect(calls).toContainEqual({ path: 'freeze', body: { date: null } }));
  });
});

describe('year-end', () => {
  it('closes an open year after confirmation, with the next year prefilled', async () => {
    const user = userEvent.setup();
    const { calls, counts } = setup();
    expect(await screen.findByLabelText('Next year name')).toHaveValue('2027-28');
    expect(screen.getByLabelText('Next year first day')).toHaveValue('01-04-2027');
    expect(screen.getByLabelText('Next year last day')).toHaveValue('31-03-2028');
    await user.click(screen.getByRole('button', { name: 'Close year 2026-27' }));
    const confirm = await screen.findByRole('dialog', { name: 'Close year 2026-27' });
    expect(calls.some((c) => c.path.endsWith('/close'))).toBe(false);
    await user.click(within(confirm).getByRole('button', { name: 'Close year' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Net profit 2,60,000.00');
    expect(screen.getByRole('status')).toHaveTextContent('4 balances and 7 pending bills');
    expect(calls).toContainEqual({ path: '/api/years/y1/close', body: { companyId: 'c1', next: { label: '2027-28', start: '2027-04-01', end: '2028-03-31' } } });
    expect(counts.reloaded()).toBe(1);
  });

  it('Esc in the confirmation leaves the year open', async () => {
    const user = userEvent.setup();
    const { calls } = setup();
    await user.click(await screen.findByRole('button', { name: 'Close year 2026-27' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Close year 2026-27' })).toBeNull();
    expect(calls.some((c) => c.path.endsWith('/close'))).toBe(false);
  });

  it('a closed year can be reopened or locked for good (after asking)', async () => {
    const user = userEvent.setup();
    const closed = { ...YEAR_2026, status: 'closed' };
    const { calls } = setup({ session: { year: closed, years: [YEAR_2025, closed] } });
    await user.click(await screen.findByRole('button', { name: 'Reopen year 2026-27' }));
    await waitFor(() => expect(calls).toContainEqual({ path: '/api/years/y1/reopen', body: { companyId: 'c1' } }));
    await user.click(screen.getByRole('button', { name: 'Lock year 2026-27 permanently' }));
    const confirm = await screen.findByRole('dialog', { name: 'Lock year 2026-27' });
    expect(confirm).toHaveTextContent(/cannot be undone/i);
    await user.click(within(confirm).getByRole('button', { name: 'Lock year' }));
    await waitFor(() => expect(calls).toContainEqual({ path: '/api/years/y1/lock', body: { companyId: 'c1' } }));
  });

  it('a locked year has no actions', async () => {
    const locked = { ...YEAR_2026, status: 'locked' };
    setup({ session: { year: locked, years: [locked] } });
    expect(await screen.findByText(/year 2026-27 is locked/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reopen year/ })).toBeNull();
  });

  it('shows the server\'s message when closing fails', async () => {
    const user = userEvent.setup();
    setup({ extra: [{ method: 'POST', path: /\/close$/, reply: () => { throw new ApiError(422, 'YEAR_BAD_STATE', 'The next year is already closed'); } }] });
    await user.click(await screen.findByRole('button', { name: 'Close year 2026-27' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Close year 2026-27' })).getByRole('button', { name: 'Close year' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The next year is already closed');
  });
});

describe('backup and restore', () => {
  it('lists the backups and backs up now', async () => {
    const user = userEvent.setup();
    const { calls } = setup();
    const grid = await screen.findByRole('grid', { name: 'Backups' });
    expect(within(grid).getByText('sas-20261003-010000.dump')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back up now' }));
    expect(await screen.findByText(/backup saved: .*sas-20261020-120000\.dump/i)).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/api/backup')).toBe(true);
  });

  it('restores only after the password is typed and the warning confirmed, then signs out', async () => {
    const user = userEvent.setup();
    const { calls, counts } = setup();
    await screen.findByRole('grid', { name: 'Backups' });
    await user.click(screen.getByRole('combobox', { name: 'Backup file' }));
    await user.keyboard('1003{Enter}'); // sas-20261003-010000.dump
    await user.click(screen.getByRole('button', { name: 'Restore…' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/enter your password/i);
    await user.type(screen.getByLabelText('Your password'), 'adminpass1');
    await user.click(screen.getByRole('button', { name: 'Restore…' }));
    const confirm = await screen.findByRole('dialog', { name: 'Restore backup' });
    expect(confirm).toHaveTextContent(/replaces all current data/i);
    expect(calls.some((c) => c.path === '/api/restore')).toBe(false);
    await user.click(within(confirm).getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(calls).toContainEqual({ path: '/api/restore', body: { file: 'D:/b/sas-20261003-010000.dump', adminPassword: 'adminpass1' } }));
    await waitFor(() => expect(counts.loggedOut()).toBe(1));
  });

  it('shows the server\'s message for a wrong password and does not sign out', async () => {
    const user = userEvent.setup();
    const { counts } = setup({ extra: [{ method: 'POST', path: '/api/restore', reply: () => { throw new ApiError(403, 'FORBIDDEN', 'Wrong administrator password'); } }] });
    await screen.findByRole('grid', { name: 'Backups' });
    await user.click(screen.getByRole('combobox', { name: 'Backup file' }));
    await user.keyboard('1003{Enter}');
    await user.type(screen.getByLabelText('Your password'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Restore…' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Restore backup' })).getByRole('button', { name: 'Restore' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong administrator password');
    expect(counts.loggedOut()).toBe(0);
  });

  it('says so when backups are not set up on the server', async () => {
    setup({ backups: 'unset' });
    expect(await screen.findByText(/backup is not set up on this server/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back up now' })).toBeNull();
  });
});
