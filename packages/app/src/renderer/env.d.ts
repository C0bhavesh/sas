import type { SasBridge } from '../shared/bridge';

declare global {
  interface Window {
    sas: SasBridge;
  }
}

export {};
