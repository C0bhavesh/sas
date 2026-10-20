import { describe, expect, it } from 'vitest';
import { initialTabs, MAX_TABS, tabsReducer, type TabsState } from './tabs';
import { SCREENS, type ScreenId } from './screens';

const open = (s: TabsState, id: ScreenId, props?: Record<string, unknown>) => tabsReducer(s, { type: 'open', id, props });

describe('tabsReducer', () => {
  it('opens a screen as the active tab', () => {
    const s = open(initialTabs, 'rTrial');
    expect(s.tabs.map((t) => t.id)).toEqual(['rTrial']);
    expect(s.active).toBe('rTrial');
  });

  it('opening an open screen activates it, replacing its props only when new ones are given', () => {
    let s = open(initialTabs, 'receipt');
    s = open(s, 'rTrial');
    s = open(s, 'receipt', { editId: 'v1' });
    expect(s.tabs).toEqual([{ id: 'receipt', props: { editId: 'v1' } }, { id: 'rTrial', props: undefined }]);
    s = open(s, 'rTrial');
    s = open(s, 'receipt');
    expect(s.tabs[0]!.props).toEqual({ editId: 'v1' });
    expect(s.active).toBe('receipt');
  });

  it('refuses an eleventh screen but still switches to one that is open', () => {
    const ids = SCREENS.filter((x) => x.id !== 'home').map((x) => x.id);
    let s = initialTabs;
    for (const id of ids.slice(0, MAX_TABS)) s = open(s, id);
    const full = open(s, ids[MAX_TABS]!);
    expect(full.tabs).toHaveLength(MAX_TABS);
    expect(full.full).toBe(true);
    expect(full.active).toBe(s.active);
    const again = open(full, ids[0]!);
    expect(again.full).toBe(false);
    expect(again.active).toBe(ids[0]);
  });

  it('closing the active tab shows the one used before it, then Home', () => {
    let s = open(open(open(initialTabs, 'receipt'), 'rTrial'), 'rLedger');
    s = tabsReducer(s, { type: 'show', id: 'receipt' });
    s = tabsReducer(s, { type: 'close', id: 'receipt' });
    expect(s.active).toBe('rLedger');
    s = tabsReducer(s, { type: 'close', id: 'rLedger' });
    s = tabsReducer(s, { type: 'close', id: 'rTrial' });
    expect(s.active).toBeNull();
    expect(s.tabs).toEqual([]);
  });

  it('closing a background tab keeps the active one', () => {
    let s = open(open(initialTabs, 'receipt'), 'rTrial');
    s = tabsReducer(s, { type: 'close', id: 'receipt' });
    expect(s.active).toBe('rTrial');
  });

  it('cycles through the tabs and wraps around', () => {
    let s = open(open(initialTabs, 'receipt'), 'rTrial');
    s = tabsReducer(s, { type: 'cycle', direction: 1 });
    expect(s.active).toBe('receipt');
    s = tabsReducer(s, { type: 'cycle', direction: -1 });
    expect(s.active).toBe('rTrial');
  });

  it('opening Home shows Home and keeps the tabs', () => {
    const s = tabsReducer(open(initialTabs, 'receipt'), { type: 'open', id: 'home' });
    expect(s.active).toBeNull();
    expect(s.tabs).toHaveLength(1);
  });
});
