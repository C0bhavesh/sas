import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from './api/client';
import { createFakeBridge } from './testing/fakeBridge';
import { renderApp, signIn, signInToHome } from './testing/render';
import { ME_CLERK } from './testing/sampleData';

describe('App start-up and login', () => {
  it('shows the login screen when the server answers', async () => {
    renderApp();
    expect(await screen.findByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument();
  });

  it('asks for both fields before calling the server', async () => {
    const user = userEvent.setup();
    const { api } = renderApp();
    await user.click(await screen.findByRole('button', { name: 'Login' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/enter your username and password/i);
    expect(api.calls.some((c) => c.path === '/api/login')).toBe(false);
  });

  it('shows the server\'s message for a wrong password and stays on the login screen', async () => {
    const user = userEvent.setup();
    renderApp();
    await signIn(user, 'boss', 'wrong');
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or password');
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
  });

  it('signs in with the keyboard and shows the company and year', async () => {
    const user = userEvent.setup();
    const { bridge } = renderApp();
    await signInToHome(user);
    const bar = within(await screen.findByRole('banner'));
    expect(bar.getByText('Test Textiles')).toBeInTheDocument();
    expect(bar.getByText('2026-27')).toBeInTheDocument(); // the open year is chosen
    await waitFor(() => expect(bridge.config.lastCompanyId).toBe('c1'));
    expect(bridge.config.lastYearId).toBe('y1');
  });

  it('opens the year it remembered, once chosen', async () => {
    const user = userEvent.setup();
    renderApp({ bridge: createFakeBridge({ lastCompanyId: 'c1', lastYearId: 'y0' }) });
    await signInToHome(user);
    expect(within(await screen.findByRole('banner')).getByText('2025-26')).toBeInTheDocument();
  });

  it('offers to fix the server address when the server cannot be reached', async () => {
    const user = userEvent.setup();
    let up = false;
    const bridge = createFakeBridge({}, { onSetConfig: () => (up = true) });
    renderApp({
      bridge,
      routes: [
        {
          method: 'GET',
          path: '/api/health',
          reply: () => {
            if (!up) throw new ApiError(0, 'NETWORK', 'Cannot reach the server.');
            return { ok: true };
          },
        },
      ],
    });
    expect(await screen.findByText('Cannot reach the server.')).toBeInTheDocument();
    // and it says what to check, in plain words
    expect(screen.getByText(/running on the office server computer/i)).toBeInTheDocument();
    expect(screen.getByText(/usually http:\/\/127\.0\.0\.1:4100/i)).toBeInTheDocument();
    const address = screen.getByLabelText('Server address');
    await user.clear(address);
    await user.type(address, 'http://192.168.1.10:4100{Enter}');
    expect(await screen.findByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(bridge.config.serverUrl).toBe('http://192.168.1.10:4100');
  });

  it('returns to the login screen with a notice when the session ends', async () => {
    const user = userEvent.setup();
    const { api } = renderApp();
    await signInToHome(user);
    act(() => api.onUnauthorized?.());
    expect(await screen.findByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(screen.getByText(/session has ended/i)).toBeInTheDocument();
  });

  it('logs out from the top bar', async () => {
    const user = userEvent.setup();
    const { api } = renderApp({ me: ME_CLERK });
    await signInToHome(user, 'clerk');
    await user.click(await screen.findByRole('button', { name: 'Logout' }));
    expect(await screen.findByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(api.calls.some((c) => c.path === '/api/logout')).toBe(true);
  });
});

describe('test mode (the server has sign-in switched off)', () => {
  const testModeRoutes = [{ method: 'GET' as const, path: '/api/health', reply: () => ({ ok: true, loginRequired: false }) }];

  it('still opens on the login page first', async () => {
    renderApp({ routes: testModeRoutes });
    expect(await screen.findByLabelText('Username')).toBeInTheDocument();
    expect(screen.queryByRole('banner')).toBeNull();
  });

  it('never calls the login endpoint when continuing as the administrator', async () => {
    const user = userEvent.setup();
    const { api } = renderApp({ routes: testModeRoutes });
    await user.click(await screen.findByRole('button', { name: /continue as administrator/i }));
    await screen.findByRole('heading', { name: 'Your companies' });
    expect(api.calls.some((c) => c.path === '/api/login')).toBe(false);
  });

  it('returns to the login page after Logout', async () => {
    const user = userEvent.setup();
    renderApp({ routes: testModeRoutes });
    await user.click(await screen.findByRole('button', { name: /continue as administrator/i }));
    await screen.findByRole('heading', { name: 'Your companies' });
    await user.click(screen.getByRole('button', { name: 'Logout' }));
    expect(await screen.findByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue as administrator/i })).toBeInTheDocument();
  });

  it('a normal server (login required) shows no test-mode notice', async () => {
    const user = userEvent.setup();
    renderApp();
    await signInToHome(user);
    const bar = within(await screen.findByRole('banner'));
    expect(bar.queryByText(/test mode/i)).toBeNull();
    expect(bar.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
  });
});
