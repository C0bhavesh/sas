import type { ScreenRef } from './nav';
import type { ScreenId } from './screens';

/** The most screens that can be open at once (Home is always there and does not count). */
export const MAX_TABS = 10;

export interface TabsState {
  tabs: ScreenRef[];
  /** The screen on show, or null for Home. */
  active: ScreenId | null;
  /** Screens in the order they were last used, newest last. Used to pick what to show after a close. */
  recent: ScreenId[];
  /** Set when an open was refused because ten screens are already open. */
  full: boolean;
}

export type TabsAction =
  | { type: 'open'; id: ScreenId; props?: Record<string, unknown> }
  | { type: 'show'; id: ScreenId | null }
  | { type: 'close'; id: ScreenId }
  | { type: 'cycle'; direction: 1 | -1 };

export const initialTabs: TabsState = { tabs: [], active: null, recent: [], full: false };

const touch = (recent: ScreenId[], id: ScreenId) => [...recent.filter((r) => r !== id), id];

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case 'open': {
      if (action.id === 'home') return { ...state, active: null, full: false };
      const existing = state.tabs.find((t) => t.id === action.id);
      if (!existing && state.tabs.length >= MAX_TABS) return { ...state, full: true };
      const tabs = existing
        ? state.tabs.map((t) => (t.id === action.id && action.props ? { id: t.id, props: action.props } : t))
        : [...state.tabs, { id: action.id, props: action.props }];
      return { tabs, active: action.id, recent: touch(state.recent, action.id), full: false };
    }
    case 'show':
      return { ...state, active: action.id, recent: action.id ? touch(state.recent, action.id) : state.recent, full: false };
    case 'close': {
      const tabs = state.tabs.filter((t) => t.id !== action.id);
      const recent = state.recent.filter((r) => r !== action.id);
      if (state.active !== action.id) return { ...state, tabs, recent, full: false };
      return { tabs, recent, active: recent[recent.length - 1] ?? null, full: false };
    }
    case 'cycle': {
      if (state.tabs.length === 0) return state;
      const i = state.tabs.findIndex((t) => t.id === state.active);
      const next = state.tabs[(i + action.direction + state.tabs.length) % state.tabs.length]!;
      return { ...state, active: next.id, recent: touch(state.recent, next.id), full: false };
    }
  }
}
