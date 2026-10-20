import { describe, expect, it } from 'vitest';
import { buildUrl, performRequest, type FetchLike } from './request';

describe('buildUrl', () => {
  it('joins the server address and an /api path', () => {
    expect(buildUrl('http://h:4100/', '/api/me')).toBe('http://h:4100/api/me');
    expect(buildUrl('http://h:4100', '/api/vouchers?x=1')).toBe('http://h:4100/api/vouchers?x=1');
  });
  it('refuses anything that is not an /api path', () => {
    for (const bad of ['/etc/passwd', 'http://evil.example/api/x', '/api/../secret', '/api\\x', 'api/x']) {
      expect(() => buildUrl('http://h:4100', bad)).toThrow(/blocked/i);
    }
  });
});

function fakeFetch(status: number, text: string, seen: { url?: string; init?: Parameters<FetchLike>[1] } = {}): FetchLike {
  return async (url, init) => {
    seen.url = url;
    seen.init = init;
    return { status, text: async () => text };
  };
}

describe('performRequest', () => {
  it('sends JSON and the bearer token, and parses the JSON answer', async () => {
    const seen: { url?: string; init?: Parameters<FetchLike>[1] } = {};
    const r = await performRequest(fakeFetch(201, '{"voucherNo":1}', seen), 'http://h:4100', {
      method: 'POST',
      path: '/api/vouchers',
      body: { a: 1 },
      token: 'tok',
    });
    expect(r).toEqual({ status: 201, json: { voucherNo: 1 } });
    expect(seen.url).toBe('http://h:4100/api/vouchers');
    expect(seen.init?.method).toBe('POST');
    expect(seen.init?.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer tok' });
    expect(seen.init?.body).toBe('{"a":1}');
  });
  it('sends no content-type and no body when there is no body', async () => {
    const seen: { url?: string; init?: Parameters<FetchLike>[1] } = {};
    await performRequest(fakeFetch(204, '', seen), 'http://h:4100', { method: 'DELETE', path: '/api/vouchers/x' });
    expect(seen.init?.headers).toEqual({});
    expect(seen.init?.body).toBeUndefined();
  });
  it('returns json null for an empty answer and a BAD_RESPONSE for non-JSON', async () => {
    expect((await performRequest(fakeFetch(204, ''), 'http://h', { method: 'GET', path: '/api/x' })).json).toBeNull();
    const bad = await performRequest(fakeFetch(502, '<html>bad gateway</html>'), 'http://h', { method: 'GET', path: '/api/x' });
    expect(bad.status).toBe(502);
    expect(bad.json).toMatchObject({ code: 'BAD_RESPONSE' });
  });
  it('reports status 0 when the server cannot be reached', async () => {
    const failing: FetchLike = async () => {
      throw new TypeError('fetch failed');
    };
    const r = await performRequest(failing, 'http://h', { method: 'GET', path: '/api/x' });
    expect(r.status).toBe(0);
    expect(r.json).toMatchObject({ code: 'NETWORK' });
  });
});
