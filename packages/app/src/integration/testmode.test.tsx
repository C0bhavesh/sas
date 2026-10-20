import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createCompany, login } from '../renderer/api/endpoints';
import { createFakeBridge } from '../renderer/testing/fakeBridge';
import { renderApp } from '../renderer/testing/render';
import { realClient, startServer, type RunningServer } from './realServer';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

let server: RunningServer;

beforeAll(async () => {
  server = await startServer({ noLogin: true });
  // Set up a company directly (this also proves the test-mode server accepts calls without a token).
  await createCompany(realClient(server.url), {
    code: 'T1',
    name: 'Test Textiles',
    fyLabel: '2026-27',
    fyStart: '2026-04-01',
    fyEnd: '2027-03-31',
  });
});

afterAll(async () => {
  await server?.stop();
});

describe('test mode against the real service', () => {
  async function continueAsAdministrator(user: ReturnType<typeof userEvent.setup>) {
    renderApp({ api: realClient(server.url), bridge: createFakeBridge() });
    // the login page still comes first; the test button gets past it
    expect(await screen.findByLabelText('Username')).toBeInTheDocument();
    await user.keyboard('{F2}');
    await screen.findByRole('heading', { name: 'Your companies' });
    await user.keyboard('{Enter}');
    await screen.findByRole('heading', { name: 'Financial years' });
    await waitFor(() => expect(screen.getByRole('grid', { name: 'Years' })).toHaveFocus());
    await user.keyboard('{Enter}');
    await screen.findByRole('heading', { name: /Welcome/ });
    return within(screen.getByRole('banner'));
  }

  it('shows the login page first, then companies, years and Home as the administrator', async () => {
    const user = userEvent.setup();
    const bar = await continueAsAdministrator(user);
    expect(await bar.findByText(/Test Textiles/)).toBeInTheDocument();
    expect(bar.getByText('2026-27')).toBeInTheDocument();
    expect(bar.getByText(/test mode/i)).toBeInTheDocument();
    // the administrator sees everything
    const sections = within(screen.getByRole('tablist', { name: 'Sections' }));
    await user.hover(sections.getByRole('tab', { name: 'Admin' }));
    expect(await screen.findByRole('menuitem', { name: 'Users & Rights' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Audit Log' })).toBeInTheDocument();
  });

  it('shows real year summaries on the years page', async () => {
    const user = userEvent.setup();
    renderApp({ api: realClient(server.url), bridge: createFakeBridge() });
    await screen.findByLabelText('Username');
    await user.keyboard('{F2}');
    await screen.findByRole('heading', { name: 'Your companies' });
    expect(screen.getByRole('option', { name: /Test Textiles/ })).toHaveTextContent('1 financial year');
    await user.keyboard('{Enter}');
    const row = (await screen.findAllByRole('row'))[1]!;
    expect(row).toHaveTextContent('2026-27');
    expect(row).toHaveTextContent('Open');
    expect(row).toHaveTextContent('—'); // nothing entered yet
  });

  it('can be used straight away: a screen works without ever logging in', async () => {
    const user = userEvent.setup();
    await continueAsAdministrator(user);
    await user.keyboard('{F2}');
    await user.type(await screen.findByRole('combobox', { name: 'Go to screen' }), 'account master{Enter}');
    expect(await screen.findByRole('heading', { name: 'Account Master' })).toBeInTheDocument();
    expect(await screen.findByRole('grid', { name: 'Accounts' })).toBeInTheDocument();
  });

  it('the real sign-in endpoint still works (test mode only adds a shortcut)', async () => {
    const api = realClient(server.url);
    const { actor } = await login(api, 'admin', server.adminPassword);
    expect(actor.isAdmin).toBe(true);
  });
});
