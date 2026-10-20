import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, createBridgeClient } from './api/client';
import { health, login, logout, me } from './api/endpoints';
import type { MeResponse } from './api/types';
import { ConnectScreen } from './screens/ConnectScreen';
import { LoginScreen } from './screens/LoginScreen';
import { DepsProvider, useDeps, type AppDeps } from './session/deps';
import { LookupsProvider } from './session/Lookups';
import { SessionProvider, useSession } from './session/Session';
import { CompaniesPage } from './pages/CompaniesPage';
import { YearsPage } from './pages/YearsPage';
import { Shell } from './shell/Shell';

type Phase =
  | { name: 'checking' }
  | { name: 'connect'; error: string }
  | { name: 'login'; notice?: string; testLogin?: boolean }
  | { name: 'ready'; me: MeResponse; testMode?: boolean };

function defaultDeps(): AppDeps {
  return { api: createBridgeClient(window.sas), bridge: window.sas };
}

/** Companies, then years, then the working screens. */
function Gate() {
  const { stage } = useSession();
  if (stage === 'companies') return <CompaniesPage />;
  if (stage === 'years') return <YearsPage />;
  return <Shell />;
}

function AppInner() {
  const { api } = useDeps();
  const [phase, setPhase] = useState<Phase>({ name: 'checking' });

  const check = useCallback(async () => {
    setPhase({ name: 'checking' });
    try {
      const h = await health(api);
      // In test mode the server needs no password, but the login page still comes first.
      setPhase({ name: 'login', testLogin: h.loginRequired === false });
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
      setPhase((p) => (p.name === 'ready' ? { name: 'login', notice: 'Your session has ended. Please login again.', testLogin: p.testMode } : p));
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

  async function testLogin() {
    try {
      setPhase({ name: 'ready', me: await me(api), testMode: true });
    } catch (e) {
      setPhase({ name: 'login', notice: e instanceof Error ? e.message : String(e), testLogin: false });
    }
  }

  async function signOut() {
    try {
      await logout(api);
    } catch {
      /* the token may already be gone */
    }
    api.setToken(null);
    await check();
  }

  switch (phase.name) {
    case 'checking':
      return <p style={{ padding: 16 }}>Connecting to the server…</p>;
    case 'connect':
      return <ConnectScreen error={phase.error} onRetry={() => void check()} />;
    case 'login':
      return (
        <LoginScreen
          notice={phase.notice}
          onSubmit={signIn}
          onTestLogin={phase.testLogin ? () => void testLogin() : undefined}
          onChangeServer={() => setPhase({ name: 'connect', error: '' })}
        />
      );
    case 'ready':
      return (
        <SessionProvider me={phase.me} testMode={phase.testMode} onLogout={() => void signOut()}>
          <LookupsProvider>
            <Gate />
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
