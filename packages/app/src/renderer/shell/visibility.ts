import type { Actor, ModuleName, Rights } from '@sas/shared';
import type { ScreenDef } from './screens';

/** Menu visibility. The server still checks every request; this only keeps the menu tidy. */
export function canSee(screen: ScreenDef, s: { actor: Actor; rights: Record<ModuleName, Rights> }): boolean {
  if (screen.adminOnly) return s.actor.isAdmin;
  if (s.actor.isAdmin || screen.modules.length === 0) return true;
  return screen.modules.some((m) => {
    const r = s.rights[m];
    return !!r && (r.show || r.add || r.edit || r.delete || r.print || r.find);
  });
}
