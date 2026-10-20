import { ApiError, type ApiClient, type Method } from '../api/client';

export interface FakeRoute {
  method: Method;
  path: string | RegExp;
  reply: (req: { path: string; query: URLSearchParams; body: any }) => unknown;
}

export interface FakeClient extends ApiClient {
  calls: { method: Method; path: string; body?: unknown }[];
}

/** An in-memory API for component tests. Unmatched requests fail loudly with 404 NO_ROUTE. */
export function createFakeClient(routes: FakeRoute[]): FakeClient {
  const calls: FakeClient['calls'] = [];
  return {
    calls,
    onUnauthorized: null,
    setToken() {},
    async request<T>(method: Method, path: string, body?: unknown): Promise<T> {
      calls.push({ method, path, body });
      const [pathname, search = ''] = path.split('?');
      const route = routes.find(
        (r) => r.method === method && (typeof r.path === 'string' ? r.path === pathname : r.path.test(pathname!)),
      );
      if (!route) throw new ApiError(404, 'NO_ROUTE', `No fake route for ${method} ${path}`);
      return (await route.reply({ path: pathname!, query: new URLSearchParams(search), body })) as T;
    },
  };
}
