import { describe, expect, it } from 'vitest';
import { formatKeys, keysEqual, matchesKey, parseKeys } from './keys';

const ev = (key: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean } = {}) => ({
  key,
  ctrlKey: !!mods.ctrl,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
  metaKey: !!mods.meta,
});

describe('parseKeys', () => {
  it('parses modifiers and keys case-insensitively', () => {
    expect(parseKeys('Ctrl+Shift+p')).toEqual({ ctrl: true, alt: false, shift: true, key: 'P' });
    expect(parseKeys('alt+a')).toEqual({ ctrl: false, alt: true, shift: false, key: 'A' });
    expect(parseKeys('F1')).toEqual({ ctrl: false, alt: false, shift: false, key: 'F1' });
    expect(parseKeys('f10').key).toBe('F10');
  });
  it('understands aliases', () => {
    expect(parseKeys('Esc').key).toBe('Escape');
    expect(parseKeys('Ctrl+Del').key).toBe('Delete');
    expect(parseKeys('Down').key).toBe('ArrowDown');
    expect(parseKeys('PgUp').key).toBe('PageUp');
    expect(parseKeys('Space').key).toBe(' ');
    expect(parseKeys('Ctrl+Enter').key).toBe('Enter');
  });
  it('rejects bad specs', () => {
    expect(() => parseKeys('')).toThrow();
    expect(() => parseKeys('Hyper+S')).toThrow(/modifier/i);
  });
});

describe('matchesKey', () => {
  it('matches letters whatever the case of the event key', () => {
    expect(matchesKey(ev('s', { ctrl: true }), 'Ctrl+S')).toBe(true);
    expect(matchesKey(ev('S', { ctrl: true }), 'Ctrl+S')).toBe(true);
  });
  it('needs the modifiers to match exactly', () => {
    expect(matchesKey(ev('s'), 'Ctrl+S')).toBe(false);
    expect(matchesKey(ev('s', { ctrl: true, shift: true }), 'Ctrl+S')).toBe(false);
    expect(matchesKey(ev('P', { ctrl: true, shift: true }), 'Ctrl+Shift+P')).toBe(true);
    expect(matchesKey(ev('F1'), 'Ctrl+F1')).toBe(false);
  });
  it('treats the Meta key as Ctrl', () => {
    expect(matchesKey(ev('k', { meta: true }), 'Ctrl+K')).toBe(true);
  });
  it('matches named keys', () => {
    expect(matchesKey(ev('Escape'), 'Esc')).toBe(true);
    expect(matchesKey(ev('Enter', { ctrl: true }), 'Ctrl+Enter')).toBe(true);
    expect(matchesKey(ev('Delete', { ctrl: true }), 'Ctrl+Del')).toBe(true);
    expect(matchesKey(ev('F9'), 'F9')).toBe(true);
    expect(matchesKey(ev('F8'), 'F9')).toBe(false);
  });
});

describe('formatKeys / keysEqual', () => {
  it('prints a canonical, human form', () => {
    expect(formatKeys('ctrl+shift+p')).toBe('Ctrl+Shift+P');
    expect(formatKeys('Escape')).toBe('Esc');
    expect(formatKeys('ctrl+delete')).toBe('Ctrl+Del');
    expect(formatKeys('f1')).toBe('F1');
    expect(formatKeys('Down')).toBe('Down');
  });
  it('compares specs by meaning', () => {
    expect(keysEqual('ctrl+s', 'Ctrl+S')).toBe(true);
    expect(keysEqual('Esc', 'Escape')).toBe(true);
    expect(keysEqual('Ctrl+S', 'Alt+S')).toBe(false);
  });
});
