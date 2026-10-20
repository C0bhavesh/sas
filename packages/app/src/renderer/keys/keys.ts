export interface KeyCombo {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  /** Normalised: single letters upper-case, named keys as in KeyboardEvent.key ("Enter", "Escape", "F1"). */
  key: string;
}

export interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey?: boolean;
}

const ALIASES: Record<string, string> = {
  esc: 'Escape',
  escape: 'Escape',
  del: 'Delete',
  delete: 'Delete',
  enter: 'Enter',
  return: 'Enter',
  space: ' ',
  tab: 'Tab',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  pgup: 'PageUp',
  pageup: 'PageUp',
  pgdn: 'PageDown',
  pagedown: 'PageDown',
  home: 'Home',
  end: 'End',
  insert: 'Insert',
  backspace: 'Backspace',
};

const DISPLAY: Record<string, string> = {
  Escape: 'Esc',
  Delete: 'Del',
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
};

export function parseKeys(spec: string): KeyCombo {
  const parts = spec
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) throw new Error(`Empty key spec "${spec}"`);
  const combo: KeyCombo = { ctrl: false, alt: false, shift: false, key: '' };
  parts.forEach((raw, i) => {
    const lower = raw.toLowerCase();
    if (i < parts.length - 1) {
      if (lower === 'ctrl' || lower === 'control' || lower === 'cmd') combo.ctrl = true;
      else if (lower === 'alt') combo.alt = true;
      else if (lower === 'shift') combo.shift = true;
      else throw new Error(`Unknown modifier "${raw}" in "${spec}"`);
    } else if (ALIASES[lower] !== undefined) combo.key = ALIASES[lower]!;
    else if (/^f\d{1,2}$/i.test(raw)) combo.key = raw.toUpperCase();
    else combo.key = raw.length === 1 ? raw.toUpperCase() : raw;
  });
  return combo;
}

export function matchesKey(e: KeyEventLike, spec: string | KeyCombo): boolean {
  const c = typeof spec === 'string' ? parseKeys(spec) : spec;
  const ctrl = e.ctrlKey || !!e.metaKey;
  if (ctrl !== c.ctrl || e.altKey !== c.alt || e.shiftKey !== c.shift) return false;
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return key === c.key;
}

export function formatKeys(spec: string): string {
  const c = parseKeys(spec);
  const parts: string[] = [];
  if (c.ctrl) parts.push('Ctrl');
  if (c.alt) parts.push('Alt');
  if (c.shift) parts.push('Shift');
  parts.push(DISPLAY[c.key] ?? c.key);
  return parts.join('+');
}

export function keysEqual(a: string, b: string): boolean {
  return formatKeys(a) === formatKeys(b);
}
