import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp, signIn } from '../testing/render';
import { ME_CLERK, rightsFor, ADMIN } from '../testing/sampleData';

async function openShell(opts: Parameters<typeof renderApp>[0] = {}) {
  const user = userEvent.setup();
  const utils = renderApp(opts);
  await signIn(user, opts.me?.actor.username ?? 'boss');
  await screen.findByRole('navigation', { name: 'Screens' });
  return { user, ...utils };
}
const menu = () => within(screen.getByRole('navigation', { name: 'Screens' }));

describe('Shell menu', () => {
  it('shows an admin every screen, including the audit log', async () => {
    await openShell();
    expect(menu().getByRole('button', { name: /Trial Balance/ })).toBeInTheDocument();
    expect(menu().getByRole('button', { name: /Audit Log/ })).toBeInTheDocument();
    expect(menu().getByRole('button', { name: /Cash \/ Bank Receipt/ })).toHaveTextContent('F4');
  });

  it('shows a clerk only what their rights allow', async () => {
    await openShell({ me: ME_CLERK });
    expect(menu().getByRole('button', { name: /Cash \/ Bank Receipt/ })).toBeInTheDocument();
    expect(menu().queryByRole('button', { name: /Trial Balance/ })).toBeNull();
    expect(menu().queryByRole('button', { name: /Users & Rights/ })).toBeNull();
    expect(menu().queryByRole('button', { name: /Audit Log/ })).toBeNull();
  });

  it('marks the current screen', async () => {
    await openShell();
    expect(menu().getByRole('button', { name: /Home/ })).toHaveAttribute('aria-current', 'page');
  });
});

describe('Shell keyboard', () => {
  it('F1 opens Help and Esc goes back', async () => {
    const { user } = await openShell();
    await user.keyboard('{F1}');
    expect(await screen.findByRole('heading', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('heading', { name: /Welcome/ })).toBeInTheDocument();
  });

  it('F2 opens the screen palette; typing and Enter opens a screen; Esc closes the palette only', async () => {
    const { user } = await openShell();
    await user.keyboard('{F2}');
    const input = await screen.findByRole('combobox', { name: 'Go to screen' });
    await user.type(input, 'trial{Enter}');
    expect(await screen.findByRole('heading', { name: 'Trial Balance' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Go to screen' })).toBeNull();

    await user.keyboard('{F2}');
    await screen.findByRole('combobox', { name: 'Go to screen' });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('combobox', { name: 'Go to screen' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Trial Balance' })).toBeInTheDocument(); // still here
  });

  it('Ctrl+K opens the palette too', async () => {
    const { user } = await openShell();
    await user.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('combobox', { name: 'Go to screen' })).toBeInTheDocument();
  });

  it('opener hotkeys open their screen when the user may see it', async () => {
    const { user } = await openShell({ me: ME_CLERK });
    await user.keyboard('{F4}');
    expect(await screen.findByRole('heading', { name: 'Cash / Bank Receipt' })).toBeInTheDocument();
    await user.keyboard('{F6}'); // the journal is not allowed for this clerk
    expect(screen.getByRole('heading', { name: 'Cash / Bank Receipt' })).toBeInTheDocument();
  });

  it('Esc steps back through the screens one at a time and stops at Home', async () => {
    const { user } = await openShell();
    await user.keyboard('{F4}');
    await user.keyboard('{F5}');
    await screen.findByRole('heading', { name: 'Cash / Bank Payment' });
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('heading', { name: 'Cash / Bank Receipt' })).toBeInTheDocument();
    await user.keyboard('{Escape}{Escape}{Escape}');
    expect(await screen.findByRole('heading', { name: /Welcome/ })).toBeInTheDocument();
  });

  it('F9 switches the financial year', async () => {
    const { user } = await openShell();
    await user.keyboard('{F9}');
    const year = await screen.findByLabelText('Financial year');
    await user.selectOptions(year, 'y0');
    await user.keyboard('{Escape}');
    expect(within(await screen.findByRole('banner')).getByText('2025-26')).toBeInTheDocument();
  });
});

describe('Home', () => {
  it('invites an administrator to create the first company', async () => {
    const user = userEvent.setup();
    renderApp({ me: { actor: ADMIN, rights: rightsFor(), companies: [] } });
    await signIn(user);
    expect(await screen.findByText(/no company yet/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create a company' }));
    expect(await screen.findByRole('heading', { name: 'Company & Years' })).toBeInTheDocument();
  });
});
