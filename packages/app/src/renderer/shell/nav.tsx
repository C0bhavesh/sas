import { createContext, useContext } from 'react';
import type { ScreenId } from './screens';

export interface ScreenRef {
  id: ScreenId;
  props?: Record<string, unknown>;
}

export interface NavValue {
  current: ScreenRef;
  /** Open a screen on top of the current one. Opening the screen that is already on top replaces its props. */
  open(id: ScreenId, props?: Record<string, unknown>): void;
  back(): void;
}

export const NavContext = createContext<NavValue | null>(null);

export function useNav(): NavValue {
  const n = useContext(NavContext);
  if (!n) throw new Error('NavContext is missing');
  return n;
}
