import { formatKeys, keysEqual } from './keys';

export interface ShortcutDecl {
  id: string;
  keys: string;
  description: string;
}

/** Work everywhere in the app. Screen-opening hotkeys (F4, F5, …) are added in screens.ts. */
export const GLOBAL_SHORTCUTS: ShortcutDecl[] = [
  { id: 'help', keys: 'F1', description: 'Open this list of keyboard shortcuts' },
  { id: 'openScreen', keys: 'F2', description: 'Go to any screen: type part of its name and press Enter' },
  { id: 'openScreenAlt', keys: 'Ctrl+K', description: 'Same as F2: go to any screen by name' },
  { id: 'switchCompany', keys: 'F9', description: 'Switch company or financial year' },
  { id: 'close', keys: 'Esc', description: 'Close the open list or dialog, or go back to the previous screen' },
];

/** Behaviour of form controls. Shown in Help for information; the controls handle these keys themselves. */
export const FORM_SHORTCUTS: ShortcutDecl[] = [
  { id: 'next', keys: 'Enter', description: 'Move to the next field. On the last field of a voucher, add a new line' },
  { id: 'previous', keys: 'Shift+Tab', description: 'Go back to the previous field' },
  { id: 'openList', keys: 'Down', description: 'In an account or book field: open the list of choices' },
  { id: 'moveInList', keys: 'Up', description: 'In a list of choices: move to the previous choice (Down moves to the next)' },
  { id: 'pick', keys: 'Enter', description: 'In a list of choices: pick the highlighted one and move on' },
  { id: 'closeList', keys: 'Esc', description: 'In a list of choices: close it without picking' },
];

interface ScreenLike {
  id: string;
  title: string;
  shortcuts: ShortcutDecl[];
}

/** Problems with the declared shortcuts, as readable messages. Empty means everything is fine. */
export function findConflicts(globals: ShortcutDecl[], screens: ScreenLike[]): string[] {
  const problems: string[] = [];
  for (const s of screens) {
    const seenIds = new Set<string>();
    s.shortcuts.forEach((d, i) => {
      if (seenIds.has(d.id)) problems.push(`${s.title}: the shortcut id "${d.id}" is declared twice`);
      seenIds.add(d.id);
      for (const g of globals) {
        if (keysEqual(d.keys, g.keys)) {
          problems.push(`${s.title}: ${formatKeys(d.keys)} (${d.id}) is already used everywhere for "${g.description}"`);
        }
      }
      for (const other of s.shortcuts.slice(i + 1)) {
        if (keysEqual(d.keys, other.keys)) {
          problems.push(`${s.title}: ${formatKeys(d.keys)} is used for both "${d.id}" and "${other.id}"`);
        }
      }
    });
  }
  return problems;
}
