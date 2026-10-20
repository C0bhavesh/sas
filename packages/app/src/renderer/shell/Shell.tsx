import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent } from 'react';
import { useShortcuts } from '../keys/useShortcuts';
import { useSession } from '../session/Session';
import { NavContext, TabActiveContext, type NavValue, type ScreenRef } from './nav';
import { Palette } from './Palette';
import { SCREEN_COMPONENTS } from './screenComponents';
import { ALL_GLOBAL, QUICK_BAR, SCREEN_BY_ID, SCREENS, type QuickItem, type ScreenGroup, type ScreenId } from './screens';
import { initialTabs, MAX_TABS, tabsReducer } from './tabs';
import { canSee } from './visibility';

/** The fixed row: a section's name on the tab, its screens in the drop-down. */
const SECTIONS: { group: ScreenGroup; label: string }[] = [
  { group: 'Transactions', label: 'Vouchers' },
  { group: 'Masters', label: 'Masters' },
  { group: 'Reports', label: 'Reports' },
  { group: 'Admin', label: 'Admin' },
];

const HOME: ScreenRef = { id: 'home' };

function SectionTab({
  label,
  items,
  onPick,
}: {
  label: string;
  items: { id: ScreenId; title: string }[];
  onPick: (id: ScreenId) => void;
}) {
  const [open, setOpen] = useState(false);
  const [focusFirst, setFocusFirst] = useState(false);
  const tabRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && focusFirst) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open, focusFirst]);

  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const close = () => {
    clearTimeout(timer.current);
    setOpen(false);
    setFocusFirst(false);
  };
  // Leaving the tab and its list closes the list after a moment, so a diagonal move toward it does not lose it.
  const enter = () => {
    clearTimeout(timer.current);
    setOpen(true);
  };
  const leave = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(close, 200);
  };

  function onTabKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setFocusFirst(true);
    }
  }

  function onMenuKey(e: KeyboardEvent) {
    const els = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      els[Math.min(i + 1, els.length - 1)]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      els[Math.max(i - 1, 0)]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      tabRef.current?.focus();
    }
  }

  return (
    <div className="section" onMouseEnter={enter} onMouseLeave={leave}>
      <button ref={tabRef} role="tab" aria-selected="false" aria-haspopup="menu" aria-expanded={open} className="tab" onClick={enter} onKeyDown={onTabKey}>
        {label}
      </button>
      {open && (
        <div ref={menuRef} role="menu" aria-label={label} className="dropdown" onMouseEnter={enter} onKeyDown={onMenuKey}>
          {items.map((s) => (
            <button
              key={s.id}
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close();
                onPick(s.id);
              }}
            >
              {s.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Keeps a background tab mounted (so nothing typed is lost) but hidden and deaf to shortcuts. */
function TabPanel({ active, children }: { active: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!active || !el || el.contains(document.activeElement)) return;
    el.querySelector<HTMLElement>('[data-autofocus], input:not([type=hidden]), select, textarea, [role="grid"], [tabindex="0"]')?.focus();
  }, [active]);
  return (
    <div ref={ref} role="tabpanel" hidden={!active} className="tabpanel">
      <TabActiveContext.Provider value={active}>{children}</TabActiveContext.Provider>
    </div>
  );
}

export function Shell() {
  const session = useSession();
  const [state, dispatch] = useReducer(tabsReducer, initialTabs);
  const [overlay, setOverlay] = useState<null | 'palette'>(null);
  const [later, setLater] = useState<string | null>(null);
  const current = state.tabs.find((t) => t.id === state.active) ?? HOME;

  const open = useCallback((id: ScreenId, props?: Record<string, unknown>) => {
    dispatch({ type: 'open', id, props });
    setOverlay(null);
    setLater(null);
  }, []);
  const back = useCallback(() => dispatch({ type: 'close', id: current.id }), [current.id]);

  const visible = useMemo(() => SCREENS.filter((s) => canSee(s, session)), [session]);
  const nav = useMemo<NavValue>(() => ({ current, open, back }), [current, open, back]);

  const quick = useMemo(() => QUICK_BAR.filter((q) => q.later || canSee(SCREEN_BY_ID[q.screen!], session)), [session]);
  const pressQuick = useCallback(
    (q: QuickItem) => {
      if (q.screen) open(q.screen);
      else setLater(`${q.later} will be available in a later stage of the software.`);
    },
    [open],
  );
  const quickHandlers = Object.fromEntries(quick.filter((q) => q.keys).map((q) => [`quick:${q.id}`, () => pressQuick(q)] as const));

  const openerHandlers = Object.fromEntries(
    visible
      .filter((s) => s.hotkey)
      .map((s) => [`open:${s.id}`, () => open(s.id)] as const),
  );
  useShortcuts(ALL_GLOBAL, {
    help: () => open('help'),
    openScreen: () => setOverlay('palette'),
    openScreenAlt: () => setOverlay('palette'),
    switchCompany: () => session.backToCompanies(),
    close: () => setOverlay(null),
    closeTab: () => state.active && dispatch({ type: 'close', id: state.active }),
    nextTab: () => dispatch({ type: 'cycle', direction: 1 }),
    previousTab: () => dispatch({ type: 'cycle', direction: -1 }),
    ...openerHandlers,
    ...quickHandlers,
  });

  const Home = SCREEN_COMPONENTS.home;

  return (
    <NavContext.Provider value={nav}>
      <div className="app">
        <header className="topbar woven">
          <strong className="brand">SAS</strong>
          {session.testMode && (
            <span role="status" className="badge-test">
              TEST MODE
            </span>
          )}
          <button className="link" onClick={session.backToCompanies} title="Change company">
            {session.company?.name ?? 'No company'}
          </button>
          <button className="link" onClick={session.backToYears} title="Change financial year">
            {session.year?.label}
          </button>
          <span className="spacer" />
          <span>{session.actor.username}</span>
          <button className="link" onClick={session.logout}>
            Logout
          </button>
        </header>

        <div role="tablist" aria-label="Sections" className="tabs-main">
          <button role="tab" aria-selected={state.active === null} className={`tab${state.active === null ? ' on' : ''}`} onClick={() => open('home')}>
            Home
          </button>
          {SECTIONS.map((sec) => {
            const items = visible.filter((s) => s.group === sec.group);
            return items.length > 0 ? <SectionTab key={sec.group} label={sec.label} items={items} onPick={open} /> : null;
          })}
          <span className="spacer" />
          <button role="tab" aria-selected={state.active === 'help'} className={`tab${state.active === 'help' ? ' on' : ''}`} onClick={() => open('help')}>
            Help
          </button>
        </div>

        <div role="toolbar" aria-label="Quick access" className="quick-bar">
          {quick.map((q) => (
            <button key={q.id} className={q.later ? 'later' : undefined} onClick={() => pressQuick(q)}>
              {q.label}
            </button>
          ))}
        </div>
        {later && (
          <p role="status" aria-label="Coming later" className="notice">
            {later}
          </p>
        )}

        {state.tabs.length > 0 && (
          <div role="tablist" aria-label="Open screens" className="tabs-open">
            {state.tabs.map((t) => (
              <div key={t.id} className={`open-tab${t.id === state.active ? ' on' : ''}`}>
                <button role="tab" aria-selected={t.id === state.active} onClick={() => dispatch({ type: 'show', id: t.id })}>
                  {SCREEN_BY_ID[t.id].title}
                </button>
                <button className="close" aria-label={`Close ${SCREEN_BY_ID[t.id].title}`} onClick={() => dispatch({ type: 'close', id: t.id })}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {state.full && (
          <p role="alert" className="notice">
            {MAX_TABS} screens are open. Close one to open another.
          </p>
        )}

        <main className="main">
          {state.active === null && <Home />}
          {state.tabs.map((t) => {
            const Screen = SCREEN_COMPONENTS[t.id];
            return (
              <TabPanel key={`${t.id}:${t.props ? JSON.stringify(t.props) : ''}`} active={t.id === state.active}>
                <Screen {...(t.props ?? {})} />
              </TabPanel>
            );
          })}
        </main>
        {overlay === 'palette' && <Palette screens={visible} onPick={open} onClose={() => setOverlay(null)} />}
      </div>
    </NavContext.Provider>
  );
}
