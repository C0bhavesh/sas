import { describe, expect, it } from 'vitest';
import { MODULES } from '@sas/shared';
import { parseKeys } from '../keys/keys';
import { findConflicts, GLOBAL_SHORTCUTS } from '../keys/registry';
import { ALL_GLOBAL, OPENERS, SCREEN_BY_ID, SCREENS } from './screens';

describe('screen registry', () => {
  it('has unique ids and titles, and an entry in SCREEN_BY_ID for each', () => {
    const ids = SCREENS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(SCREENS.map((s) => s.title)).size).toBe(SCREENS.length);
    for (const s of SCREENS) expect(SCREEN_BY_ID[s.id]).toBe(s);
  });

  it('only refers to modules that exist', () => {
    for (const s of SCREENS) for (const m of s.modules) expect(MODULES).toContain(m);
  });

  it('every declared key parses', () => {
    for (const s of SCREENS) {
      if (s.hotkey) expect(() => parseKeys(s.hotkey!)).not.toThrow();
      for (const d of s.shortcuts) expect(() => parseKeys(d.keys)).not.toThrow();
    }
  });

  it('has no conflicting shortcuts anywhere', () => {
    expect(findConflicts(ALL_GLOBAL, SCREENS)).toEqual([]);
  });

  it('openers are unique and do not collide with the global shortcuts', () => {
    const everything = [...GLOBAL_SHORTCUTS, ...OPENERS];
    const forms = everything.map((d) => parseKeys(d.keys));
    const seen = new Set(forms.map((c) => JSON.stringify(c)));
    expect(seen.size).toBe(everything.length);
    expect(OPENERS.map((o) => o.id)).toEqual(expect.arrayContaining(['open:receipt', 'open:payment', 'open:journal', 'open:vouchers', 'open:rLedger']));
  });

  it('keeps the shortcuts the spec promises on the voucher screens', () => {
    for (const id of ['receipt', 'payment', 'journal'] as const) {
      const ids = SCREEN_BY_ID[id].shortcuts.map((d) => d.id);
      expect(ids).toEqual(expect.arrayContaining(['save', 'deleteLine', 'newVoucher']));
    }
    for (const id of ['rLedger', 'rCashBook', 'rTrial', 'rPL', 'rBS', 'rAgeing'] as const) {
      expect(SCREEN_BY_ID[id].shortcuts.map((d) => d.id)).toEqual(expect.arrayContaining(['run', 'print', 'pdf', 'csv']));
    }
  });
});
