import { describe, expect, it, vi } from 'vitest';
import type { RequestArgs, RequestResult } from '../../shared/bridge';
import { ApiError, createBridgeClient } from './client';

function bridgeReturning(result: RequestResult) {
  const request = vi.fn(async (_args: RequestArgs) => result);
  return { request };
}

describe('createBridgeClient', () => {
  it('sends the method, path, body and token and returns the JSON', async () => {
    const bridge = bridgeReturning({ status: 200, json: { ok: true } });
    const api = createBridgeClient(bridge);
    api.setToken('tok');
    const out = await api.request<{ ok: boolean }>('POST', '/api/x', { a: 1 });
    expect(out).toEqual({ ok: true });
    expect(bridge.request).toHaveBeenCalledWith({ method: 'POST', path: '/api/x', body: { a: 1 }, token: 'tok' });
  });

  it('resolves to undefined for 204', async () => {
    const api = createBridgeClient(bridgeReturning({ status: 204, json: null }));
    expect(await api.request('DELETE', '/api/x')).toBeUndefined();
  });

  it('throws ApiError with the server code and message', async () => {
    const api = createBridgeClient(bridgeReturning({ status: 422, json: { code: 'NOT_BALANCED', message: 'Debits 1 and credits 2 differ' } }));
    await expect(api.request('POST', '/api/vouchers', {})).rejects.toMatchObject({
      name: 'ApiError',
      status: 422,
      code: 'NOT_BALANCED',
      message: 'Debits 1 and credits 2 differ',
    });
  });

  it('turns an unreachable server into a NETWORK error', async () => {
    const api = createBridgeClient(bridgeReturning({ status: 0, json: { code: 'NETWORK', message: 'Cannot reach the server.' } }));
    const err = await api.request<never>('GET', '/api/x').catch((e) => e as ApiError);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.code).toBe('NETWORK');
  });

  it('gives a generic message when the error body has none', async () => {
    const api = createBridgeClient(bridgeReturning({ status: 500, json: null }));
    const err = await api.request<never>('GET', '/api/x').catch((e) => e as ApiError);
    expect(err.code).toBe('ERROR');
    expect(err.message).toMatch(/500/);
  });

  it('calls onUnauthorized for 401 NOT_AUTHENTICATED only', async () => {
    const onUnauthorized = vi.fn();
    const expired = createBridgeClient(bridgeReturning({ status: 401, json: { code: 'NOT_AUTHENTICATED', message: 'Please log in' } }));
    expired.onUnauthorized = onUnauthorized;
    await expired.request('GET', '/api/me').catch(() => {});
    expect(onUnauthorized).toHaveBeenCalledTimes(1);

    const badLogin = createBridgeClient(bridgeReturning({ status: 401, json: { code: 'BAD_CREDENTIALS', message: 'Wrong username or password' } }));
    badLogin.onUnauthorized = onUnauthorized;
    await badLogin.request('POST', '/api/login', {}).catch(() => {});
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
