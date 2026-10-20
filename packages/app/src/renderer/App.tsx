import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, createBridgeClient } from './api/client';
import { health, login, logout, me } from './api/endpoints';
import type { MeResponse } from './api/types';
import { ConnectScreen } from './screens/ConnectScreen';
import { LoginScreen } from './screens/LoginScreen';
import { DepsProvider, useDeps, type AppDeps } from './session/deps';
import { LookupsProvider } from './session/Lookups';
import { SessionProvider } from './session/Session';
import { Shell } from './shell/Shell';

type Phase =
  | { name: 'checking' }
  | { name: 'connect'; error: string }
  | { name: 'login'; notice?: string }
  | { name: 'ready'; me: MeResponse; testMode?: boolean };

function defaultDeps(): AppDeps {
  return { api: createBridgeClient(window.sas), bridge: window.sas };
}

function AppInner() {
  const { api } = useDeps();
  const [phase, setPhase] = useState<Phase>({ name: 'checking' });

  const check = useCallback(async () => {
    setPhase({ name: 'checking' });
    try {
      const h = await health(api);
      if (h.loginRequired === false) {
        // The server is in test mode: it signs everyone in as the administrator.
        try {
          setPhase({ name: 'ready', me: await me(api), testMode: true });
          return;
        } catch {
          /* no test user to offer: use the normal sign-in screen */
        }
      }
      setPhase({ name: 'login' });
    } catch (e) {
      setPhase({ name: 'connect', error: e instanceof ApiError ? e.message : String(e) });
    }
  }, [api]);

  useEffect(() => {
    void check();
  }, [check]);

  useEffect(() => {
    api.onUnauthorized = () => {
      api.setToken(null);
      setPhase((p) => (p.name === 'ready' ? { name: 'login', notice: 'Your session has ended. Please sign in again.' } : p));
    };
    return () => {
      api.onUnauthorized = null;
    };
  }, [api]);

  async function signIn(username: string, password: string) {
    const { token } = await login(api, username, password);
    api.setToken(token);
    setPhase({ name: 'ready', me: await me(api) });
  }

  async function signOut() {
    try {
      await logout(api);
    } catch {
      /* the token may already be gone */
    }
    api.setToken(null);
    setPhase({ name: 'login' });
  }

  switch (phase.name) {
    case 'checking':
      return <p style={{ padding: 16 }}>Connecting to the server…</p>;
    case 'connect':
      return <ConnectScreen error={phase.error} onRetry={() => void check()} />;
    case 'login':
      return <LoginScreen notice={phase.notice} onSubmit={signIn} onChangeServer={() => setPhase({ name: 'connect', error: '' })} />;
    case 'ready':
      return (
        <SessionProvider me={phase.me} testMode={phase.testMode} onLogout={() => void signOut()}>
          <LookupsProvider>
            <Shell />
          </LookupsProvider>
        </SessionProvider>
      );
  }
}

export function App({ deps }: { deps?: AppDeps }) {
  const resolved = useMemo(() => deps ?? defaultDeps(), [deps]);
  return (
    <DepsProvider deps={resolved}>
      <AppInner />
    </DepsProvider>
  );
}
