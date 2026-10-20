import { screen, within } from '@testing-library/react';
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
  it('opens straight into the app as the administrator, with no sign-in screen', async () => {
    renderApp({ api: realClient(server.url), bridge: createFakeBridge() });
    const bar = within(await screen.findByRole('banner'));
    expect(await bar.findByText('Test Textiles')).toBeInTheDocument();
    expect(bar.getByText(/test mode/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
    // the administrator sees everything
    const menu = screen.getByRole('navigation', { name: 'Screens' });
    expect(within(menu).getByRole('button', { name: /Users & Rights/ })).toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: /Audit Log/ })).toBeInTheDocument();
  });

  it('can be used straight away: a screen works without ever signing in', async () => {
    const user = userEvent.setup();
    renderApp({ api: realClient(server.url), bridge: createFakeBridge() });
    await screen.findByRole('banner');
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
