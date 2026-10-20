import { render, screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { App } from '../App';
import type { MeResponse } from '../api/types';
import { createFakeBridge, type FakeBridge } from './fakeBridge';
import { createFakeClient, type FakeClient, type FakeRoute } from './fakeClient';
import { baseRoutes } from './sampleData';

export function renderApp(opts: { me?: MeResponse; routes?: FakeRoute[]; bridge?: FakeBridge } = {}) {
  const api: FakeClient = createFakeClient(baseRoutes({ me: opts.me, extra: opts.routes }));
  const bridge = opts.bridge ?? createFakeBridge();
  const utils = render(<App deps={{ api, bridge }} />);
  return { api, bridge, ...utils };
}

/** Type the credentials on the login screen and press Enter. */
export async function signIn(user: UserEvent, username = 'boss', password = 'secret') {
  await user.type(await screen.findByLabelText('Username'), username);
  await user.type(screen.getByLabelText('Password'), `${password}{Enter}`);
}
