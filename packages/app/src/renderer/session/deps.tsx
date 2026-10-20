import { createContext, useContext, type ReactNode } from 'react';
import type { SasBridge } from '../../shared/bridge';
import type { ApiClient } from '../api/client';

export type AppBridge = Pick<SasBridge, 'getConfig' | 'setConfig' | 'saveFile' | 'printToPdf'>;

export interface AppDeps {
  api: ApiClient;
  bridge: AppBridge;
}

const DepsContext = createContext<AppDeps | null>(null);

export function DepsProvider({ deps, children }: { deps: AppDeps; children: ReactNode }) {
  return <DepsContext.Provider value={deps}>{children}</DepsContext.Provider>;
}

export function useDeps(): AppDeps {
  const deps = useContext(DepsContext);
  if (!deps) throw new Error('DepsProvider is missing');
  return deps;
}

export const useApi = () => useDeps().api;
export const useBridge = () => useDeps().bridge;
