import { expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { App } from '../App';
import type { ApiClient } from '../api/client';
import type { MeResponse } from '../api/types';
import { DepsProvider } from '../session/deps';
import { LookupsContext, LookupsProvider, type LookupsValue } from '../session/Lookups';
import { SessionContext, type SessionValue } from '../session/Session';
import { NavContext, type NavValue } from '../shell/nav';
import { createFakeBridge, type FakeBridge } from './fakeBridge';
import { createFakeClient, type FakeClient, type FakeRoute } from './fakeClient';
import { baseRoutes, COMPANY, ME_ADMIN, YEAR_2025, YEAR_2026 } from './sampleData';

export function renderApp(opts: { me?: MeResponse; routes?: FakeRoute[]; bridge?: FakeBridge; api?: ApiClient } = {}) {
  // A real client can be passed for the integration tests; it has no `calls` log, and those tests do not read one.
  const api = (opts.api ?? createFakeClient(baseRoutes({ me: opts.me, extra: opts.routes }))) as FakeClient;
  const bridge = opts.bridge ?? createFakeBridge();
  const utils = render(<App deps={{ api, bridge }} />);
  return { api, bridge, ...utils };
}

/** Type the credentials on the login screen and press Enter. */
export async function signIn(user: UserEvent, username = 'boss', password = 'secret') {
  await user.type(await screen.findByLabelText('Username'), username);
  await user.type(screen.getByLabelText('Password'), `${password}{Enter}`);
}

/** Log in, then choose the first company and the highlighted year with Enter, landing on Home. */
export async function signInToHome(user: UserEvent, username = 'boss', password = 'secret') {
  await signIn(user, username, password);
  await screen.findByRole('heading', { name: 'Your companies' });
  await user.keyboard('{Enter}');
  await screen.findByRole('heading', { name: 'Financial years' });
  await waitFor(() => expect(screen.getByRole('grid', { name: 'Years' })).toHaveFocus());
  await user.keyboard('{Enter}');
  await screen.findByRole('heading', { name: /Welcome/ });
}

function staticSession(partial: Partial<SessionValue>): SessionValue {
  return {
    actor: ME_ADMIN.actor,
    rights: ME_ADMIN.rights,
    companies: [COMPANY],
    company: COMPANY,
    year: YEAR_2026,
    years: [YEAR_2025, YEAR_2026],
    stage: 'home',
    selectCompany: async () => {},
    enterCompany: async () => {},
    openYear: () => {},
    backToCompanies: () => {},
    backToYears: () => {},
    selectYear: () => {},
    refreshCompanies: async () => {},
    reloadYears: async () => {},
    can: () => true,
    logout: () => {},
    testMode: false,
    ...partial,
  };
}

/**
 * Render one screen with an admin session (company c1, year 2026-27), a fake API and the real lookup cache.
 * Pass `lookups` to supply the cache directly instead of loading it through the fake API.
 */
export function renderScreen(
  ui: ReactElement,
  opts: {
    api?: FakeClient;
    routes?: FakeRoute[];
    session?: Partial<SessionValue>;
    lookups?: LookupsValue;
    bridge?: FakeBridge;
  } = {},
) {
  const api = opts.api ?? createFakeClient(baseRoutes({ extra: opts.routes }));
  const bridge = opts.bridge ?? createFakeBridge();
  const navCalls: string[] = [];
  const nav: NavValue = {
    current: { id: 'home' },
    open: (id, props) => void navCalls.push(`open:${id}${props ? ` ${JSON.stringify(props)}` : ''}`),
    back: () => void navCalls.push('back'),
  };
  const session = staticSession(opts.session ?? {});

  const utils = render(
    <DepsProvider deps={{ api, bridge }}>
      <SessionContext.Provider value={session}>
        <NavContext.Provider value={nav}>
          {opts.lookups ? <LookupsContext.Provider value={opts.lookups}>{ui}</LookupsContext.Provider> : <LookupsProvider>{ui}</LookupsProvider>}
        </NavContext.Provider>
      </SessionContext.Provider>
    </DepsProvider>,
  );
  return { api, bridge, navCalls, ...utils };
}
