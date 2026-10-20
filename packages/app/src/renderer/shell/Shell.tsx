import { useCallback, useMemo, useState } from 'react';
import { formatKeys } from '../keys/keys';
import { useShortcuts } from '../keys/useShortcuts';
import { useSession } from '../session/Session';
import { NavContext, type NavValue, type ScreenRef } from './nav';
import { Palette } from './Palette';
import { SCREEN_COMPONENTS } from './screenComponents';
import { ALL_GLOBAL, SCREENS, type ScreenGroup, type ScreenId } from './screens';
import { SwitchDialog } from './SwitchDialog';
import { canSee } from './visibility';

const GROUP_ORDER: ScreenGroup[] = ['General', 'Transactions', 'Masters', 'Reports', 'Admin'];

export function Shell() {
  const session = useSession();
  const [stack, setStack] = useState<ScreenRef[]>([{ id: 'home' }]);
  const [overlay, setOverlay] = useState<null | 'palette' | 'switch'>(null);
  const current = stack[stack.length - 1]!;

  const open = useCallback((id: ScreenId, props?: Record<string, unknown>) => {
    setStack((s) => {
      const top = s[s.length - 1]!;
      return top.id === id ? [...s.slice(0, -1), { id, props }] : [...s, { id, props }];
    });
    setOverlay(null);
  }, []);
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);

  const visible = useMemo(() => SCREENS.filter((s) => canSee(s, session)), [session]);
  const nav = useMemo<NavValue>(() => ({ current, open, back }), [current, open, back]);

  const openerHandlers = Object.fromEntries(
    visible
      .filter((s) => s.hotkey)
      .map((s) => [`open:${s.id}`, () => open(s.id)] as const),
  );
  useShortcuts(ALL_GLOBAL, {
    help: () => open('help'),
    openScreen: () => setOverlay('palette'),
    openScreenAlt: () => setOverlay('palette'),
    switchCompany: () => setOverlay('switch'),
    close: () => (overlay ? setOverlay(null) : back()),
    ...openerHandlers,
  });

  const Screen = SCREEN_COMPONENTS[current.id];

  return (
    <NavContext.Provider value={nav}>
      <div className="app">
        <header className="topbar">
          <strong>SAS</strong>
          <span>{session.company?.name ?? 'No company'}</span>
          <span>{session.year?.label}</span>
          <span className="spacer" />
          <span>{session.actor.username}</span>
          <button onClick={session.logout}>Sign out</button>
        </header>
        <div className="layout">
          <nav className="menu" aria-label="Screens">
            {GROUP_ORDER.map((group) => {
              const items = visible.filter((s) => s.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group}>
                  <h3>{group}</h3>
                  {items.map((s) => (
                    <button key={s.id} aria-current={s.id === current.id ? 'page' : undefined} onClick={() => open(s.id)}>
                      <span>{s.title}</span>
                      {s.hotkey && <kbd>{formatKeys(s.hotkey)}</kbd>}
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>
          <main className="main">
            <Screen {...(current.props ?? {})} />
          </main>
        </div>
        <footer className="statusbar no-print">
          <kbd>F1</kbd> Help · <kbd>F2</kbd> Go to screen · <kbd>F9</kbd> Company / year · <kbd>Esc</kbd> Back
        </footer>
        {overlay === 'palette' && <Palette screens={visible} onPick={open} onClose={() => setOverlay(null)} />}
        {overlay === 'switch' && <SwitchDialog onClose={() => setOverlay(null)} />}
      </div>
    </NavContext.Provider>
  );
}
