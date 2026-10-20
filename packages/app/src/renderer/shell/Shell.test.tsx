import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp, signInToHome } from '../testing/render';
import { ME_CLERK } from '../testing/sampleData';

async function openShell(opts: Parameters<typeof renderApp>[0] = {}) {
  const user = userEvent.setup();
  const utils = renderApp(opts);
  await signInToHome(user, opts.me?.actor.username ?? 'boss');
  await screen.findByRole('tablist', { name: 'Sections' });
  return { user, ...utils };
}

const sections = () => within(screen.getByRole('tablist', { name: 'Sections' }));
const openTabs = () => screen.queryByRole('tablist', { name: 'Open screens' });
const openTabNames = () => within(openTabs()!).getAllByRole('tab').map((t) => t.textContent?.replace('×', '').trim());

/** Hover a section tab and click an item in its drop-down. */
async function pick(user: ReturnType<typeof userEvent.setup>, section: string, item: RegExp | string) {
  await user.hover(sections().getByRole('tab', { name: section }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

async function openByPalette(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.keyboard('{F2}');
  await user.type(await screen.findByRole('combobox', { name: 'Go to screen' }), `${text}{Enter}`);
}

describe('the fixed row of section tabs', () => {
  it('shows an admin every section and Help', async () => {
    await openShell();
    const names = sections().getAllByRole('tab').map((t) => t.textContent);
    expect(names).toEqual(['Home', 'Vouchers', 'Masters', 'Reports', 'Admin', 'Help']);
  });

  it('shows a clerk only the sections their rights allow', async () => {
    await openShell({ me: ME_CLERK });
    const names = sections().getAllByRole('tab').map((t) => t.textContent);
    expect(names).toEqual(['Home', 'Vouchers', 'Help']);
  });

  it('opens a drop-down of screens when the pointer is over a tab, and closes it when it leaves', async () => {
    const { user } = await openShell();
    expect(screen.queryByRole('menu')).toBeNull();
    await user.hover(sections().getByRole('tab', { name: 'Reports' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'Ledger',
      'Cash / Bank Book',
      'Trial Balance',
      'Profit & Loss',
      'Balance Sheet',
      'Outstanding Ageing',
    ]);
    await user.unhover(sections().getByRole('tab', { name: 'Reports' }));
    await user.hover(document.body);
    await vi_waitForNoMenu();
  });

  it('a clerk\'s drop-down lists only the screens they may use', async () => {
    const { user } = await openShell({ me: ME_CLERK });
    await user.hover(sections().getByRole('tab', { name: 'Vouchers' }));
    const items = within(await screen.findByRole('menu')).getAllByRole('menuitem').map((m) => m.textContent);
    expect(items).toContain('Cash / Bank Receipt');
    expect(items).not.toContain('Journal Voucher');
  });

  it('keyboard users can open a drop-down with Enter and pick with the arrow keys', async () => {
    const { user } = await openShell();
    sections().getByRole('tab', { name: 'Reports' }).focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(await screen.findByRole('heading', { name: 'Cash / Bank Book' })).toBeInTheDocument();
  });
});

async function vi_waitForNoMenu() {
  const { waitFor } = await import('@testing-library/react');
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
}

describe('the row of open screens', () => {
  it('is empty on Home, and picking a screen opens it as a tab', async () => {
    const { user } = await openShell();
    expect(openTabs()).toBeNull();
    expect(screen.getByRole('heading', { name: /Welcome/ })).toBeInTheDocument();
    await pick(user, 'Reports', 'Trial Balance');
    expect(await screen.findByRole('heading', { name: 'Trial Balance' })).toBeInTheDocument();
    expect(openTabNames()).toEqual(['Trial Balance']);
    expect(within(openTabs()!).getByRole('tab', { name: /Trial Balance/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps earlier screens as tabs and switches between them', async () => {
    const { user } = await openShell();
    await pick(user, 'Reports', 'Trial Balance');
    await pick(user, 'Reports', 'Ledger');
    expect(openTabNames()).toEqual(['Trial Balance', 'Ledger']);
    await user.click(within(openTabs()!).getByRole('tab', { name: /Trial Balance/ }));
    expect(screen.getByRole('heading', { name: 'Trial Balance' })).toBeVisible();
  });

  it('opening a screen that is already open switches to it instead of adding a second tab', async () => {
    const { user } = await openShell();
    await pick(user, 'Reports', 'Trial Balance');
    await pick(user, 'Reports', 'Ledger');
    await pick(user, 'Reports', 'Trial Balance');
    expect(openTabNames()).toEqual(['Trial Balance', 'Ledger']);
    expect(within(openTabs()!).getByRole('tab', { name: /Trial Balance/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps what was typed in a tab while you work in another', async () => {
    const { user } = await openShell();
    await user.keyboard('{F4}');
    const narration = await screen.findByLabelText('Narration');
    await user.type(narration, 'half done');
    await pick(user, 'Reports', 'Trial Balance');
    await user.click(within(openTabs()!).getByRole('tab', { name: /Cash \/ Bank Receipt/ }));
    expect(screen.getByLabelText('Narration')).toHaveValue('half done');
  });

  it('a screen in a background tab does not react to keyboard shortcuts', async () => {
    const { user, api } = await openShell();
    await user.keyboard('{F4}');
    await screen.findByRole('combobox', { name: 'Book' });
    await pick(user, 'Reports', 'Trial Balance');
    await user.keyboard('{Control>}s{/Control}');
    expect(api.calls.some((c) => c.method === 'POST' && c.path === '/api/vouchers')).toBe(false);
  });

  it('× closes a tab and shows the one before it, or Home when none is left', async () => {
    const { user } = await openShell();
    await pick(user, 'Reports', 'Trial Balance');
    await pick(user, 'Reports', 'Ledger');
    await user.click(screen.getByRole('button', { name: 'Close Ledger' }));
    expect(openTabNames()).toEqual(['Trial Balance']);
    expect(await screen.findByRole('heading', { name: 'Trial Balance' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Close Trial Balance' }));
    expect(openTabs()).toBeNull();
    expect(screen.getByRole('heading', { name: /Welcome/ })).toBeVisible();
  });

  it('Ctrl+W closes the current tab; Ctrl+Tab moves to the next one', async () => {
    const { user } = await openShell();
    await pick(user, 'Reports', 'Trial Balance');
    await pick(user, 'Reports', 'Ledger');
    await user.keyboard('{Control>}{Tab}{/Control}');
    expect(within(openTabs()!).getByRole('tab', { name: /Trial Balance/ })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Control>}w{/Control}');
    expect(openTabNames()).toEqual(['Ledger']);
  });

  it('allows ten open screens and tells you to close one for the eleventh', async () => {
    const { user } = await openShell();
    for (const name of ['receipt', 'payment', 'journal', 'find voucher', 'ledger', 'cash / bank book', 'trial', 'profit', 'balance sheet', 'ageing']) {
      await openByPalette(user, name);
    }
    expect(openTabNames()).toHaveLength(10);
    await openByPalette(user, 'account master');
    expect(await screen.findByText(/10 screens are open/i)).toBeInTheDocument();
    expect(openTabNames()).toHaveLength(10);
    // closing one makes room
    await user.click(screen.getByRole('button', { name: 'Close Outstanding Ageing' }));
    await openByPalette(user, 'account master');
    expect(await screen.findByRole('heading', { name: 'Account Master' })).toBeInTheDocument();
  });

  it('opening an already-open screen still works when ten are open', async () => {
    const { user } = await openShell();
    for (const name of ['receipt', 'payment', 'journal', 'find voucher', 'ledger', 'cash / bank book', 'trial', 'profit', 'balance sheet', 'ageing']) {
      await openByPalette(user, name);
    }
    await openByPalette(user, 'trial');
    expect(screen.queryByText(/10 screens are open/i)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Trial Balance' })).toBeVisible();
  });

  it('Esc does not close a tab', async () => {
    const { user } = await openShell();
    await pick(user, 'Reports', 'Trial Balance');
    await user.keyboard('{Escape}{Escape}');
    expect(openTabNames()).toEqual(['Trial Balance']);
  });
});

describe('keyboard and Help', () => {
  it('F1 opens Help as a tab', async () => {
    const { user } = await openShell();
    await user.keyboard('{F1}');
    expect(await screen.findByRole('heading', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    expect(openTabNames()).toEqual(['Help']);
  });

  it('the Help tab in the fixed row opens it too', async () => {
    const { user } = await openShell();
    await user.click(sections().getByRole('tab', { name: 'Help' }));
    expect(await screen.findByRole('heading', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });

  it('shows no shortcut keys anywhere except Help', async () => {
    const { user } = await openShell();
    expect(document.querySelectorAll('kbd')).toHaveLength(0);
    await pick(user, 'Vouchers', 'Cash / Bank Receipt');
    await pick(user, 'Reports', 'Trial Balance');
    await user.hover(sections().getByRole('tab', { name: 'Reports' }));
    await screen.findByRole('menu');
    expect(document.querySelectorAll('kbd')).toHaveLength(0);
    await user.keyboard('{F2}');
    await screen.findByRole('combobox', { name: 'Go to screen' });
    expect(document.querySelectorAll('kbd')).toHaveLength(0);
    await user.keyboard('{Escape}');
    await user.keyboard('{F1}');
    await screen.findByRole('heading', { name: 'Keyboard shortcuts' });
    expect(document.querySelectorAll('kbd').length).toBeGreaterThan(0);
  });

  it('F2 opens the screen palette; typing and Enter opens a screen; Esc closes the palette only', async () => {
    const { user } = await openShell();
    await openByPalette(user, 'trial');
    expect(await screen.findByRole('heading', { name: 'Trial Balance' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Go to screen' })).toBeNull();
    await user.keyboard('{F2}');
    await screen.findByRole('combobox', { name: 'Go to screen' });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('combobox', { name: 'Go to screen' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Trial Balance' })).toBeInTheDocument();
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
    expect(openTabNames()).toEqual(['Cash / Bank Receipt']);
  });
});
