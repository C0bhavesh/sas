import { SCREEN_BY_ID, type ScreenId } from '../shell/screens';
import { useShortcuts } from './useShortcuts';

/** Bind handlers to the shortcuts a screen declared in screens.ts. */
export function useScreenShortcuts(screenId: ScreenId, handlers: Record<string, () => void>, enabled = true): void {
  useShortcuts(SCREEN_BY_ID[screenId].shortcuts, handlers, enabled);
}
