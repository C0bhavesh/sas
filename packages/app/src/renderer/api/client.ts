import type { SasBridge } from '../../shared/bridge';

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClient {
  /** Resolves to the parsed JSON, or undefined for an empty (204) answer. Throws ApiError otherwise. */
  request<T = unknown>(method: Method, path: string, body?: unknown): Promise<T>;
  setToken(token: string | null): void;
  /** Called when the server says the session is gone (401 NOT_AUTHENTICATED). */
  onUnauthorized: (() => void) | null;
}

export function createBridgeClient(bridge: Pick<SasBridge, 'request'>): ApiClient {
  let token: string | null = null;
  const client: ApiClient = {
    onUnauthorized: null,
    setToken(t) {
      token = t;
    },
    async request<T>(method: Method, path: string, body?: unknown): Promise<T> {
      const res = await bridge.request({ method, path, body, token });
      if (res.status >= 200 && res.status < 300) return (res.status === 204 || res.json === null ? undefined : res.json) as T;
      const err = (res.json ?? {}) as { code?: string; message?: string };
      const apiError = new ApiError(res.status, err.code ?? 'ERROR', err.message ?? `The server answered ${res.status}`);
      if (res.status === 401 && apiError.code === 'NOT_AUTHENTICATED') client.onUnauthorized?.();
      throw apiError;
    },
  };
  return client;
}
