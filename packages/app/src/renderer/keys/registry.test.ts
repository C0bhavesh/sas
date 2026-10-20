import { describe, expect, it } from 'vitest';
import { findConflicts, FORM_SHORTCUTS, GLOBAL_SHORTCUTS } from './registry';

describe('declared shortcuts', () => {
  it('every global shortcut has an id, parseable keys and a description', () => {
    const ids = GLOBAL_SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of [...GLOBAL_SHORTCUTS, ...FORM_SHORTCUTS]) {
      expect(s.description.length).toBeGreaterThan(5);
    }
    expect(ids).toEqual(expect.arrayContaining(['help', 'openScreen', 'switchCompany', 'close']));
  });
});

describe('findConflicts', () => {
  const globals = [{ id: 'help', keys: 'F1', description: 'Help' }];
  it('is empty for a clean set', () => {
    expect(
      findConflicts(globals, [
        { id: 'a', title: 'A', shortcuts: [{ id: 'save', keys: 'Ctrl+S', description: 'Save' }] },
        { id: 'b', title: 'B', shortcuts: [{ id: 'save', keys: 'Ctrl+S', description: 'Save' }] },
      ]),
    ).toEqual([]);
  });
  it('reports a screen shortcut that reuses a global key', () => {
    const out = findConflicts(globals, [{ id: 'a', title: 'A', shortcuts: [{ id: 'x', keys: 'f1', description: 'X' }] }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/A/);
    expect(out[0]).toMatch(/F1/);
  });
  it('reports two shortcuts on one screen that share keys, and duplicate ids', () => {
    const out = findConflicts(globals, [
      {
        id: 'a',
        title: 'A',
        shortcuts: [
          { id: 'x', keys: 'Ctrl+S', description: 'X' },
          { id: 'y', keys: 'ctrl+s', description: 'Y' },
          { id: 'x', keys: 'Ctrl+Q', description: 'X again' },
        ],
      },
    ]);
    expect(out.length).toBe(2);
  });
});
