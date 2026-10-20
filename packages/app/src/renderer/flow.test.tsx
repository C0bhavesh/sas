import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { CompanyLite } from './api/types';
import { createFakeBridge } from './testing/fakeBridge';
import { renderApp, signIn } from './testing/render';
import { ADMIN, COMPANY, ME_ADMIN, ME_CLERK, rightsFor, YEAR_2025 } from './testing/sampleData';

const SECOND: CompanyLite = { id: 'c2', code: 'C2', name: 'Laxmi Silk Mills', gstin: null, yearCount: 1, latestYearStatus: 'closed' };
const testModeRoutes = [{ method: 'GET' as const, path: '/api/health', reply: () => ({ ok: true, loginRequired: false }) }];

describe('Login page', () => {
  it('puts the cursor in Username straight away', async () => {
    renderApp();
    expect(await screen.findByLabelText('Username')).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument();
  });

  it('is typed quickly: username, Enter, password, Enter', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.type(await screen.findByLabelText('Username'), 'boss{Enter}');
    expect(screen.getByLabelText('Password')).toHaveFocus();
    await user.type(screen.getByLabelText('Password'), 'secret{Enter}');
    expect(await screen.findByRole('heading', { name: 'Your companies' })).toBeInTheDocument();
  });

  it('does not print instructions about Enter', async () => {
    renderApp();
    await screen.findByLabelText('Username');
    expect(screen.queryByText(/moves on/i)).toBeNull();
  });

  it('keeps the password field ready after a wrong password', async () => {
    const user = userEvent.setup();
    renderApp();
    await signIn(user, 'boss', 'wrong');
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or password');
    await waitFor(() => expect(screen.getByLabelText('Password')).toHaveFocus());
  });

  it('has no test button when sign-in is required', async () => {
    renderApp();
    await screen.findByLabelText('Username');
    expect(screen.queryByRole('button', { name: /continue as administrator/i })).toBeNull();
  });

  it('in test mode still shows the login page, with a test button on F2 that goes on to the companies', async () => {
    const user = userEvent.setup();
    renderApp({ routes: testModeRoutes });
    expect(await screen.findByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue as administrator/i })).toHaveTextContent('F2');
    await user.keyboard('{F2}');
    expect(await screen.findByRole('heading', { name: 'Your companies' })).toBeInTheDocument();
  });

  it('in test mode, clicking the test button works too', async () => {
    const user = userEvent.setup();
    const { api } = renderApp({ routes: testModeRoutes });
    await user.click(await screen.findByRole('button', { name: /continue as administrator/i }));
    expect(await screen.findByRole('heading', { name: 'Your companies' })).toBeInTheDocument();
    expect(api.calls.some((c) => c.path === '/api/login')).toBe(false);
  });
});

describe('Companies page', () => {
  async function toCompanies(opts: Parameters<typeof renderApp>[0] = {}) {
    const user = userEvent.setup();
    const utils = renderApp(opts);
    await signIn(user, opts.me?.actor.username ?? 'boss');
    await screen.findByRole('heading', { name: 'Your companies' });
    return { user, ...utils };
  }

  it('is shown after login, not Home, and lists each company with its details', async () => {
    await toCompanies();
    expect(screen.queryByRole('heading', { name: /Welcome/ })).toBeNull();
    const card = screen.getByRole('option', { name: /Test Textiles/ });
    expect(card).toHaveTextContent('C1');
    expect(card).toHaveTextContent('24AAAPL1234C1Z5');
    expect(card).toHaveTextContent('2 financial years');
    expect(card).toHaveTextContent('Open');
  });

  it('opens the highlighted company with Enter', async () => {
    const { user } = await toCompanies();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'Financial years' })).toBeInTheDocument();
  });

  it('moves with the arrow keys and opens the chosen company', async () => {
    const me = { ...ME_ADMIN, companies: [COMPANY, SECOND] };
    const { user, api } = await toCompanies({ me, routes: [
        { method: 'GET', path: '/api/companies/c2/years', reply: () => [] },
        { method: 'GET', path: '/api/companies/c2/year-summaries', reply: () => [] },
      ],
    });
    expect(screen.getByRole('option', { name: /Test Textiles/ })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('option', { name: /Laxmi Silk Mills/ })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'Financial years' })).toBeInTheDocument();
    expect(api.calls.some((c) => c.path === '/api/companies/c2/year-summaries')).toBe(true);
  });

  it('highlights the company used last time', async () => {
    const me = { ...ME_ADMIN, companies: [COMPANY, SECOND] };
    await toCompanies({ me, bridge: createFakeBridge({ lastCompanyId: 'c2' }) });
    expect(screen.getByRole('option', { name: /Laxmi Silk Mills/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('clicking a card opens it', async () => {
    const { user } = await toCompanies();
    await user.click(screen.getByRole('option', { name: /Test Textiles/ }));
    expect(await screen.findByRole('heading', { name: 'Financial years' })).toBeInTheDocument();
  });

  it('N opens the new-company form, and creating one returns to the list with it highlighted', async () => {
    const created: unknown[] = [];
    const me = { ...ME_ADMIN, companies: [COMPANY] };
    const { user } = await toCompanies({
      me,
      routes: [
        {
          method: 'POST',
          path: '/api/companies',
          reply: ({ body }) => {
            created.push(body);
            me.companies = [COMPANY, { id: 'c9', code: 'NEW', name: 'New Mills', gstin: null, yearCount: 1, latestYearStatus: 'open' }];
            return { companyId: 'c9', yearId: 'y9' };
          },
        },
      ],
    });
    await user.keyboard('n');
    const code = await screen.findByLabelText('Code');
    expect(code).toHaveFocus();
    await user.type(code, 'NEW{Enter}New Mills');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('heading', { name: 'Your companies' })).toBeInTheDocument();
    expect(created).toHaveLength(1);
    expect(await screen.findByRole('option', { name: /New Mills/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('Esc leaves the new-company form without creating anything', async () => {
    const { user, api } = await toCompanies();
    await user.keyboard('n');
    await screen.findByLabelText('Code');
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('heading', { name: 'Your companies' })).toBeInTheDocument();
    expect(api.calls.some((c) => c.path === '/api/companies' && c.method === 'POST')).toBe(false);
  });

  it('hides the create option from someone who may not create companies', async () => {
    await toCompanies({ me: ME_CLERK });
    expect(screen.queryByRole('button', { name: /create company/i })).toBeNull();
  });

  it('says what to do when there is nothing to open', async () => {
    await toCompanies({ me: { actor: ADMIN, rights: rightsFor(), companies: [] } });
    expect(screen.getByRole('button', { name: /create company/i })).toBeInTheDocument();
  });

  it('tells a user with no companies and no right to create one to ask the administrator', async () => {
    await toCompanies({ me: { ...ME_CLERK, companies: [] } });
    expect(screen.getByText(/ask the administrator/i)).toBeInTheDocument();
  });

  it('logs out from the page', async () => {
    const { user, api } = await toCompanies();
    await user.click(screen.getByRole('button', { name: 'Logout' }));
    expect(await screen.findByLabelText('Username')).toBeInTheDocument();
    expect(api.calls.some((c) => c.path === '/api/logout')).toBe(true);
  });
});

describe('Years page', () => {
  async function toYears(opts: Parameters<typeof renderApp>[0] = {}) {
    const user = userEvent.setup();
    const utils = renderApp(opts);
    await signIn(user);
    await screen.findByRole('heading', { name: 'Your companies' });
    await user.keyboard('{Enter}');
    await screen.findByRole('heading', { name: 'Financial years' });
    return { user, ...utils };
  }

  it('lists every year of the company with what is in it, newest first', async () => {
    await toYears();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('2026-27');
    expect(rows[0]).toHaveTextContent('1,284');
    expect(rows[0]).toHaveTextContent('142');
    expect(rows[0]).toHaveTextContent('20-10-2026');
    expect(rows[0]).toHaveTextContent('Open');
    expect(rows[1]).toHaveTextContent('2025-26');
    expect(rows[1]).toHaveTextContent('3,906');
    expect(rows[1]).toHaveTextContent('Closed');
  });

  it('shows the company name and a dash for a year with no entries', async () => {
    await toYears({
      routes: [{ method: 'GET', path: '/api/companies/c1/year-summaries', reply: () => [{ ...YEAR_2025, voucherCount: 0, accountCount: 0, lastEntryDate: null }] }],
    });
    expect(screen.getByRole('banner')).toHaveTextContent('Test Textiles');
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('—');
  });

  it('opens Home for the chosen year and remembers the choice', async () => {
    const { user, bridge } = await toYears();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(await screen.findByRole('heading', { name: /Welcome/ })).toBeInTheDocument();
    const bar = within(screen.getByRole('banner'));
    expect(bar.getByText('Test Textiles')).toBeInTheDocument();
    expect(bar.getByText('2025-26')).toBeInTheDocument();
    await waitFor(() => expect(bridge.config).toMatchObject({ lastCompanyId: 'c1', lastYearId: 'y0' }));
  });

  it('highlights the year used last time', async () => {
    await toYears({ bridge: createFakeBridge({ lastCompanyId: 'c1', lastYearId: 'y0' }) });
    expect(screen.getAllByRole('row')[2]).toHaveAttribute('aria-selected', 'true');
  });

  it('Esc goes back to the companies', async () => {
    const { user } = await toYears();
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('heading', { name: 'Your companies' })).toBeInTheDocument();
  });
});

describe('Home and going back', () => {
  async function toHome() {
    const user = userEvent.setup();
    const utils = renderApp({ routes: testModeRoutes });
    await user.click(await screen.findByRole('button', { name: /continue as administrator/i }));
    await screen.findByRole('heading', { name: 'Your companies' });
    await user.keyboard('{Enter}');
    await screen.findByRole('heading', { name: 'Financial years' });
    await user.keyboard('{Enter}');
    await screen.findByRole('heading', { name: /Welcome/ });
    return { user, ...utils };
  }

  it('shows the test-mode badge on Home', async () => {
    await toHome();
    expect(within(screen.getByRole('banner')).getByText(/test mode/i)).toBeInTheDocument();
  });

  it('the company name in the top bar goes back to the companies', async () => {
    const { user } = await toHome();
    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: /Test Textiles/ }));
    expect(await screen.findByRole('heading', { name: 'Your companies' })).toBeInTheDocument();
  });

  it('the year in the top bar goes back to the years', async () => {
    const { user } = await toHome();
    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: /2026-27/ }));
    expect(await screen.findByRole('heading', { name: 'Financial years' })).toBeInTheDocument();
  });

  it('F9 goes back to the companies', async () => {
    const { user } = await toHome();
    await user.keyboard('{F9}');
    expect(await screen.findByRole('heading', { name: 'Your companies' })).toBeInTheDocument();
  });

  it('a lost session returns to the login page from any page', async () => {
    const user = userEvent.setup();
    const { api } = renderApp();
    await signIn(user);
    await screen.findByRole('heading', { name: 'Your companies' });
    act(() => api.onUnauthorized?.());
    expect(await screen.findByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByText(/session has ended/i)).toBeInTheDocument();
  });
});
