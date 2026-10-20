import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { filterItems, Lookup, type LookupItem } from './Lookup';
import { NavRoot } from './NavRoot';

const ITEMS: LookupItem[] = [
  { id: 'a', label: 'Ramesh Traders', sub: 'Surat' },
  { id: 'b', label: 'Suresh Textiles', sub: 'Surat' },
  { id: 'c', label: 'Mahesh Fabrics', sub: 'Mumbai' },
  { id: 'd', label: 'Rameshwar Cloth', sub: 'Surat' },
];

function Harness({ onChange = () => {}, initial = null }: { onChange?: (id: string | null) => void; initial?: string | null }) {
  const [v, setV] = useState<string | null>(initial);
  return (
    <NavRoot>
      <Lookup
        label="Account"
        items={ITEMS}
        value={v}
        onChange={(id) => {
          setV(id);
          onChange(id);
        }}
      />
      <input aria-label="Amount" data-nav />
    </NavRoot>
  );
}

describe('filterItems', () => {
  it('puts names that start with the text first, then names or details that contain it', () => {
    expect(filterItems(ITEMS, 'ram').map((i) => i.id)).toEqual(['a', 'd']);
    expect(filterItems(ITEMS, 'esh').map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(filterItems(ITEMS, 'mumbai').map((i) => i.id)).toEqual(['c']);
    expect(filterItems(ITEMS, '').length).toBe(4);
    expect(filterItems(ITEMS, 'zzz')).toEqual([]);
    expect(filterItems(ITEMS, 'esh', 2).length).toBe(2);
  });
});

describe('Lookup', () => {
  it('filters while typing and shows the details', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('combobox', { name: 'Account' }), 'sures'); // 'sur' would also match the two Surat parties by city
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([expect.stringContaining('Suresh Textiles')]);
  });

  it('Enter picks the highlighted entry and moves to the next field', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(screen.getByRole('combobox', { name: 'Account' }), 'ram{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('a');
    expect(screen.getByRole('combobox', { name: 'Account' })).toHaveValue('Ramesh Traders');
    expect(screen.getByLabelText('Amount')).toHaveFocus();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('Down opens the list and the arrow keys choose', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('combobox', { name: 'Account' }));
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')).toHaveLength(4);
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('b');
  });

  it('Esc closes the list and nothing else reacts to it', async () => {
    const user = userEvent.setup();
    const outer = vi.fn();
    render(
      <div onKeyDown={(e) => e.key === 'Escape' && outer(e.defaultPrevented)}>
        <Harness />
      </div>,
    );
    await user.type(screen.getByRole('combobox', { name: 'Account' }), 'ram');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(outer).toHaveBeenCalledWith(true); // preventDefault() was called, so the app's global Esc is skipped
  });

  it('Esc with the list closed is left for the app', async () => {
    const user = userEvent.setup();
    const outer = vi.fn();
    render(
      <div onKeyDown={(e) => e.key === 'Escape' && outer(e.defaultPrevented)}>
        <Harness />
      </div>,
    );
    await user.click(screen.getByRole('combobox', { name: 'Account' }));
    await user.keyboard('{Escape}');
    expect(outer).toHaveBeenCalledWith(false);
  });

  it('Tab picks the highlighted entry when something was typed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(screen.getByRole('combobox', { name: 'Account' }), 'mah');
    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith('c');
    expect(screen.getByRole('combobox', { name: 'Account' })).toHaveValue('Mahesh Fabrics');
  });

  it('leaving the field with text that matches nothing puts the selected name back (or empties it when nothing is selected)', async () => {
    const user = userEvent.setup();
    render(<Harness initial="a" />);
    const box = screen.getByRole('combobox', { name: 'Account' });
    expect(box).toHaveValue('Ramesh Traders');
    // Typing junk without clearing first: the selection is kept, so leaving restores the name.
    await user.type(box, 'zzz'); // whether this replaces or follows the name, the text matches nothing
    await user.tab();
    expect(box).toHaveValue('Ramesh Traders');
    // After clearing, nothing is selected any more, so leaving with junk text leaves the field empty.
    await user.clear(box);
    await user.type(box, 'qqq');
    await user.tab();
    expect(box).toHaveValue('');
  });

  it('clearing the text clears the selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial="a" onChange={onChange} />);
    await user.clear(screen.getByRole('combobox', { name: 'Account' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('Enter with nothing highlighted does not move on while the text matches nothing', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('combobox', { name: 'Account' }), 'qqq{Enter}');
    expect(screen.getByRole('combobox', { name: 'Account' })).toHaveFocus();
  });

  it('a click on an entry picks it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('combobox', { name: 'Account' }));
    await user.keyboard('{ArrowDown}');
    await user.click(screen.getByRole('option', { name: /Mahesh Fabrics/ }));
    expect(onChange).toHaveBeenLastCalledWith('c');
  });
});
