import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createBook, createCompany, createLedger, createUser, listYears, login, me, setOpening, setUserRights } from '../renderer/api/endpoints';
import type { ApiClient } from '../renderer/api/client';
import { createFakeBridge } from '../renderer/testing/fakeBridge';
import { renderApp, signInToHome } from '../renderer/testing/render';
import { rightsFor } from '../renderer/testing/sampleData';
import { realClient, startServer, type RunningServer } from './realServer';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

let server: RunningServer;
let admin: ApiClient;

beforeAll(async () => {
  server = await startServer();
  admin = realClient(server.url);
  admin.setToken((await login(admin, 'admin', server.adminPassword)).token);

  // A company with a cash book, a journal book, two accounts (one in Gujarati) and an opening balance.
  const { companyId, yearId } = await createCompany(admin, {
    code: 'T1', name: 'Test Textiles', fyLabel: '2026-27', fyStart: '2026-04-01', fyEnd: '2027-03-31',
  });
  const cash = (await createLedger(admin, companyId, { groupCode: 16, name: 'Cash' })).id;
  const party = (await createLedger(admin, companyId, { groupCode: 42, name: 'રમેશ ટ્રેડર્સ', city: 'સુરત' })).id;
  await createLedger(admin, companyId, { groupCode: 42, name: 'Suresh Textiles', city: 'Surat' });
  await createBook(admin, companyId, { code: 'CB', name: 'Cash Book', type: 'cash', defaultLedgerId: cash });
  await createBook(admin, companyId, { code: 'JV', name: 'Journal', type: 'journal' });
  await setOpening(admin, cash, { yearId, amount: '1000', side: 'Dr' });
  void party;
});

afterAll(async () => {
  await server?.stop();
});

const bridge = () => createFakeBridge();

describe('the desktop app against the real service', () => {
  it('signs in, enters a receipt with Gujarati account name, finds it, edits it and sees it in the ledger', async () => {
    const user = userEvent.setup();
    renderApp({ api: realClient(server.url), bridge: bridge() });
    await signInToHome(user, 'admin', server.adminPassword);
    await screen.findByRole('banner');

    // Receipt: F4, date, account, amount
    await user.keyboard('{F4}');
    await screen.findByRole('combobox', { name: 'Book' });
    await user.keyboard('12052026{Enter}{Enter}');
    await user.keyboard('રમેશ{Enter}2500{Enter}');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('status')).toHaveTextContent('Saved as voucher no. 1');

    // Find it: F7
    await user.keyboard('{F7}');
    const found = await screen.findByRole('row', { name: /Receipt/ });
    expect(found).toHaveTextContent('2,500.00');
    screen.getByRole('grid', { name: 'Vouchers' }).focus();
    await user.keyboard('{Enter}');

    // Edit: change the amount
    expect(await screen.findByRole('heading', { name: /no\. 1/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Account line 1' })).toHaveValue('રમેશ ટ્રેડર્સ');
    const amount = screen.getByLabelText('Amount line 1');
    await user.clear(amount);
    await user.type(amount, '3000');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('status')).toHaveTextContent('Voucher no. 1 updated');

    // Close the edit and find tabs, then open the ledger report
    await user.keyboard('{Control>}w{/Control}{Control>}w{/Control}');
    // Ledger report of the cash account: opening 1,000 + receipt 3,000
    await user.keyboard('{F8}');
    await user.click(await screen.findByRole('combobox', { name: 'Account' }));
    await user.keyboard('cash{Enter}');
    const to = screen.getByLabelText('To');
    await user.clear(to);
    await user.type(to, '31052026');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(await screen.findByText(/Opening balance/)).toHaveTextContent('1,000.00 Dr');
    const grid = await screen.findByRole('grid', { name: 'Ledger' });
    expect(within(grid).getByText('Total').closest('tr')).toHaveTextContent('4,000.00 Dr');
  });

  it('refuses an unbalanced journal on the screen before anything is sent', async () => {
    const user = userEvent.setup();
    renderApp({ api: realClient(server.url), bridge: bridge() });
    await signInToHome(user, 'admin', server.adminPassword);
    await screen.findByRole('banner');
    await user.keyboard('{F6}');
    await screen.findByRole('combobox', { name: 'Book' });
    await user.keyboard('12052026{Enter}{Enter}');
    await user.keyboard('suresh{Enter}100{Enter}{Enter}cash{Enter}90');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Debits 100.00 and credits 90.00 differ');
  });

  it('shows a restricted user only what their rights allow, and the server enforces it', async () => {
    const user = userEvent.setup();
    // an operator who may only enter cash vouchers
    const { id } = await createUser(admin, { username: 'operator', password: 'operator1' });
    await setUserRights(admin, id, rightsFor({ cash_book: { show: true, find: true, add: true }, reports: {} }));

    renderApp({ api: realClient(server.url), bridge: bridge() });
    await signInToHome(user, 'operator', 'operator1');
    const sections = within(await screen.findByRole('tablist', { name: 'Sections' }));
    expect(sections.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Home', 'Vouchers', 'Help']);
    await user.hover(sections.getByRole('tab', { name: 'Vouchers' }));
    expect(await screen.findByRole('menuitem', { name: 'Cash / Bank Receipt' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Journal Voucher' })).toBeNull();

    // the server, not just the menu, says no
    const operator = realClient(server.url);
    operator.setToken((await login(operator, 'operator', 'operator1')).token);
    const myCompany = (await me(operator)).companies[0]!;
    const myYear = (await listYears(operator, myCompany.id))[0]!;
    await expect(
      operator.request('GET', `/api/reports/trial-balance?companyId=${myCompany.id}&yearId=${myYear.id}&asOn=2027-03-31`),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('goes back to the sign-in screen when the server forgets the session', async () => {
    const user = userEvent.setup();
    const api = realClient(server.url);
    renderApp({ api, bridge: bridge() });
    await signInToHome(user, 'admin', server.adminPassword);
    await screen.findByRole('banner');
    api.setToken('a-token-the-server-does-not-know');
    await user.keyboard('{F7}'); // any call now fails with 401
    expect(await screen.findByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(screen.getByText(/session has ended/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('tablist', { name: 'Sections' })).toBeNull());
  });
});
