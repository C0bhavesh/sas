import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SCREEN_BY_ID } from './screens';
import { Palette } from './Palette';

const screens = [SCREEN_BY_ID.home, SCREEN_BY_ID.receipt, SCREEN_BY_ID.rTrial, SCREEN_BY_ID.rPL, SCREEN_BY_ID.ledgers];

describe('Palette', () => {
  it('lists the screens, focuses the search box and filters as you type', async () => {
    const user = userEvent.setup();
    render(<Palette screens={screens} onPick={() => {}} onClose={() => {}} />);
    const input = screen.getByRole('combobox', { name: 'Go to screen' });
    expect(input).toHaveFocus();
    expect(screen.getAllByRole('option')).toHaveLength(5);
    await user.type(input, 'bal');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([expect.stringContaining('Trial Balance')]);
  });

  it('Enter opens the highlighted screen; the arrow keys move the highlight', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Palette screens={screens} onPick={onPick} onClose={() => {}} />);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onPick).toHaveBeenCalledWith('receipt');
  });

  it('puts titles that start with the text before titles that only contain it', async () => {
    const user = userEvent.setup();
    render(<Palette screens={screens} onPick={() => {}} onClose={() => {}} />);
    await user.type(screen.getByRole('combobox', { name: 'Go to screen' }), 'a');
    const titles = screen.getAllByRole('option').map((o) => o.textContent ?? '');
    expect(titles[0]).toMatch(/^Account Master/);
  });

  it('Esc closes it', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Palette screens={screens} onPick={() => {}} onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not show shortcut keys (they are only in Help)', () => {
    render(<Palette screens={screens} onPick={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('option', { name: /Cash \/ Bank Receipt/ })).not.toHaveTextContent('F4');
  });
});
