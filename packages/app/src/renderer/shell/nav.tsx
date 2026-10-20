import { createContext, useContext } from 'react';
import type { ScreenId } from './screens';

export interface ScreenRef {
  id: ScreenId;
  props?: Record<string, unknown>;
}

export interface NavValue {
  current: ScreenRef;
  /** Open a screen as a tab, or switch to it if it is already open (new props replace the old ones). */
  open(id: ScreenId, props?: Record<string, unknown>): void;
  /** Close the current tab and show the one used before it. */
  back(): void;
}

/** False for a screen sitting in a background tab: its keyboard shortcuts must not fire. */
export const TabActiveContext = createContext(true);

export const NavContext = createContext<NavValue | null>(null);

export function useNav(): NavValue {
  const n = useContext(NavContext);
  if (!n) throw new Error('NavContext is missing');
  return n;
}
