import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FORM_SHORTCUTS } from '../keys/registry';
import { ALL_GLOBAL, PAGE_SHORTCUTS, SCREENS } from '../shell/screens';
import { Help } from './Help';

describe('Help', () => {
  it('lists every declared shortcut exactly once (it cannot drift from the real key map)', () => {
    const { container } = render(<Help />);
    const expected: string[] = [
      ...ALL_GLOBAL.map((d) => `global:${d.id}`),
      ...FORM_SHORTCUTS.map((d) => `forms:${d.id}`),
      ...Object.entries(PAGE_SHORTCUTS).flatMap(([k, items]) => items.map((d) => `page:${k}:${d.id}`)),
      ...SCREENS.flatMap((s) => s.shortcuts.map((d) => `${s.id}:${d.id}`)),
    ];
    const rows = Array.from(container.querySelectorAll('[data-shortcut]')).map((r) => r.getAttribute('data-shortcut'));
    expect(rows.sort()).toEqual([...expected].sort());
  });

  it('shows the keys and the description of a shortcut', () => {
    render(<Help />);
    const row = document.querySelector('[data-shortcut="global:help"]')!;
    expect(row).toHaveTextContent('F1');
    expect(row).toHaveTextContent('keyboard shortcuts');
  });

  it('shows the screen-opening hotkeys under "Everywhere"', () => {
    render(<Help />);
    expect(document.querySelector('[data-shortcut="global:open:receipt"]')).toHaveTextContent('F4');
  });

  it('filters by key and by words', async () => {
    const user = userEvent.setup();
    const { container } = render(<Help />);
    const search = screen.getByRole('searchbox', { name: 'Search shortcuts' });
    await user.type(search, 'pdf');
    const rows = Array.from(container.querySelectorAll('[data-shortcut]'));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => /pdf/i.test(r.textContent ?? ''))).toBe(true);

    await user.clear(search);
    await user.type(search, 'ctrl+s');
    expect(container.querySelector('[data-shortcut="receipt:save"]')).not.toBeNull();
    expect(container.querySelector('[data-shortcut="global:help"]')).toBeNull();
  });

  it('says so when nothing matches', async () => {
    const user = userEvent.setup();
    render(<Help />);
    await user.type(screen.getByRole('searchbox', { name: 'Search shortcuts' }), 'zzzzzz');
    expect(screen.getByText(/no shortcuts match/i)).toBeInTheDocument();
  });

  it('matches a screen name and then shows all of that screen\'s shortcuts', async () => {
    const user = userEvent.setup();
    const { container } = render(<Help />);
    await user.type(screen.getByRole('searchbox', { name: 'Search shortcuts' }), 'trial balance');
    expect(container.querySelector('[data-shortcut="rTrial:run"]')).not.toBeNull();
    expect(container.querySelector('[data-shortcut="rTrial:csv"]')).not.toBeNull();
  });
});
