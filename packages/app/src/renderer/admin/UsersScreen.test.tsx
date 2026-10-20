import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MODULES, NO_RIGHTS } from '@sas/shared';
import { ApiError } from '../api/client';
import type { RightsMap, UserRow } from '../api/endpoints';
import type { FakeRoute } from '../testing/fakeClient';
import { renderScreen } from '../testing/render';
import { rightsFor } from '../testing/sampleData';
import { mergeBlocked, UsersScreen } from './UsersScreen';

const USERS: UserRow[] = [
  { id: 'u-boss', username: 'boss', isAdmin: true, status: 'active', email: null },
  { id: 'u-asha', username: 'asha', isAdmin: false, status: 'active', email: 'a@x.in' },
];

function setup(opts: { access?: { blockedGroupIds: string[]; hiddenCompanyIds: string[] }; rights?: RightsMap; extra?: FakeRoute[] } = {}) {
  const puts: { path: string; body: any }[] = [];
  const posts: { path: string; body: any }[] = [];
  const routes: FakeRoute[] = [
    ...(opts.extra ?? []),
    { method: 'GET', path: '/api/users', reply: () => USERS },
    { method: 'GET', path: '/api/users/u-asha/rights', reply: () => opts.rights ?? rightsFor({ cash_book: { show: true, find: true } }) },
    { method: 'GET', path: '/api/users/u-boss/rights', reply: () => rightsFor() },
    { method: 'GET', path: /^\/api\/users\/[^/]+\/access$/, reply: () => opts.access ?? { blockedGroupIds: [], hiddenCompanyIds: [] } },
    { method: 'PUT', path: /^\/api\/users\/[^/]+\/(rights|blocked-groups|hidden-companies|status)$/, reply: ({ path, body }) => void puts.push({ path, body }) },
    { method: 'POST', path: '/api/users', reply: ({ body }) => (posts.push({ path: '/api/users', body }), { id: 'u-new' }) },
  ];
  return { puts, posts, ...renderScreen(<UsersScreen />, { routes, session: { actor: { userId: 'u-boss', username: 'boss', isAdmin: true } } }) };
}

async function selectUser(user: ReturnType<typeof userEvent.setup>, name: string) {
  const grid = await screen.findByRole('grid', { name: 'Users' });
  await user.click(within(grid).getByRole('row', { name: new RegExp(name) }));
  grid.focus();
  await user.keyboard('{Enter}');
}

describe('mergeBlocked', () => {
  it('keeps blocks for other companies and replaces the current company\'s', () => {
    expect(mergeBlocked(['other-1', 'mine-1', 'mine-2'], ['mine-1', 'mine-2', 'mine-3'], ['mine-3'])).toEqual(['other-1', 'mine-3']);
    expect(mergeBlocked([], ['a'], [])).toEqual([]);
    expect(mergeBlocked(['x'], [], ['y'])).toEqual(['x', 'y']);
  });
});

describe('UsersScreen', () => {
  it('lists the users with their role and status', async () => {
    setup();
    const grid = await screen.findByRole('grid', { name: 'Users' });
    expect(within(grid).getByRole('row', { name: /boss/ })).toHaveTextContent('Administrator');
    expect(within(grid).getByRole('row', { name: /asha/ })).toHaveTextContent('active');
  });

  it('Enter on a user loads their rights, hidden groups and hidden companies', async () => {
    const user = userEvent.setup();
    setup({ access: { blockedGroupIds: ['g42'], hiddenCompanyIds: [] } });
    await selectUser(user, 'asha');
    expect(await screen.findByRole('checkbox', { name: 'Cash / bank vouchers: View' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Cash / bank vouchers: Add' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Hide group Sundry Debtors' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Hide group Cash-in-Hand' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Hide company Test Textiles' })).not.toBeChecked();
  });

  it('Ctrl+S saves the whole rights map, the merged hidden groups and the hidden companies', async () => {
    const user = userEvent.setup();
    const { puts } = setup({ access: { blockedGroupIds: ['g-other-company', 'g42'], hiddenCompanyIds: [] } });
    await selectUser(user, 'asha');
    await user.click(await screen.findByRole('checkbox', { name: 'Cash / bank vouchers: Add' }));
    await user.click(screen.getByRole('checkbox', { name: 'Hide group Sundry Debtors' })); // un-hide
    await user.click(screen.getByRole('checkbox', { name: 'Hide group Cash-in-Hand' })); // hide
    await user.click(screen.getByRole('checkbox', { name: 'Hide company Test Textiles' }));
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('status')).toHaveTextContent('Saved asha');
    const rights = puts.find((p) => p.path.endsWith('/rights'))!.body.rights as RightsMap;
    expect(Object.keys(rights).sort()).toEqual([...MODULES].sort());
    expect(rights.cash_book).toEqual({ ...NO_RIGHTS, show: true, find: true, add: true });
    expect(rights.journal).toEqual(NO_RIGHTS);
    expect(puts.find((p) => p.path.endsWith('/blocked-groups'))!.body).toEqual({ groupIds: ['g-other-company', 'g16'] });
    expect(puts.find((p) => p.path.endsWith('/hidden-companies'))!.body).toEqual({ companyIds: ['c1'] });
  });

  it('shows an administrator\'s rights as read-only with an explanation', async () => {
    const user = userEvent.setup();
    setup();
    await selectUser(user, 'boss');
    expect(await screen.findByText(/administrators can do everything/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Cash / bank vouchers: Add' })).toBeDisabled();
  });

  it('blocks and unblocks a user, but not yourself', async () => {
    const user = userEvent.setup();
    const { puts } = setup();
    await selectUser(user, 'asha');
    await user.click(await screen.findByRole('button', { name: 'Block this user' }));
    await waitFor(() => expect(puts).toContainEqual({ path: '/api/users/u-asha/status', body: { status: 'blocked' } }));
    await selectUser(user, 'boss');
    expect(await screen.findByRole('button', { name: 'Block this user' })).toBeDisabled();
  });

  it('Ctrl+N opens the new-user form; Ctrl+S creates the user and selects them', async () => {
    const user = userEvent.setup();
    const { posts } = setup();
    await screen.findByRole('grid', { name: 'Users' });
    await user.keyboard('{Control>}n{/Control}');
    await user.type(await screen.findByLabelText('Username'), 'ravi{Enter}secret12{Enter}ravi@x.in');
    await user.click(screen.getByRole('checkbox', { name: 'Administrator' }));
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('status')).toHaveTextContent('User ravi created');
    expect(posts[0]!.body).toEqual({ username: 'ravi', password: 'secret12', email: 'ravi@x.in', isAdmin: true });
  });

  it('shows the server\'s message, for example a short password', async () => {
    const user = userEvent.setup();
    setup({ extra: [{ method: 'POST', path: '/api/users', reply: () => { throw new ApiError(422, 'INVALID_INPUT', 'Password must be at least 6 characters'); } }] });
    await screen.findByRole('grid', { name: 'Users' });
    await user.keyboard('{Control>}n{/Control}');
    await user.type(await screen.findByLabelText('Username'), 'ravi{Enter}123{Enter}');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Password must be at least 6 characters');
  });
});
