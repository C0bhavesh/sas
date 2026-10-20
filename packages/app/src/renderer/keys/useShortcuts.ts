import { useEffect, useRef } from 'react';
import { matchesKey } from './keys';
import type { ShortcutDecl } from './registry';

/**
 * Bind handlers to declared shortcuts. `handlers` is keyed by shortcut id; only the ids present are active.
 * Events already handled by something closer (a list closing on Esc, say) are left alone.
 */
export function useShortcuts(decls: ShortcutDecl[], handlers: Record<string, () => void>, enabled = true): void {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    if (!enabled) return;
    for (const id of Object.keys(latest.current)) {
      if (!decls.some((d) => d.id === id)) throw new Error(`The shortcut "${id}" is not declared`);
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      for (const d of decls) {
        const handler = latest.current[d.id];
        if (handler && matchesKey(e, d.keys)) {
          e.preventDefault();
          handler();
          return;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [decls, enabled]);
}
