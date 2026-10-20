import { describe, expect, it } from 'vitest';
import { ApiError } from './client';
import * as api from './endpoints';
import { createFakeClient } from '../testing/fakeClient';

describe('fake client', () => {
  it('records calls, matches by method and path, and passes the query and body', async () => {
    const client = createFakeClient([
      { method: 'GET', path: '/api/companies/c1/years', reply: () => [{ id: 'y1' }] },
      { method: 'POST', path: /^\/api\/vouchers$/, reply: ({ body }) => ({ voucherId: 'v1', voucherNo: body.n }) },
      { method: 'GET', path: '/api/q', reply: ({ query }) => ({ x: query.get('x') }) },
      { method: 'DELETE', path: '/api/gone', reply: () => undefined },
    ]);
    expect(await client.request('GET', '/api/companies/c1/years')).toEqual([{ id: 'y1' }]);
    expect(await client.request('POST', '/api/vouchers', { n: 7 })).toEqual({ voucherId: 'v1', voucherNo: 7 });
    expect(await client.request('GET', '/api/q?x=5')).toEqual({ x: '5' });
    expect(await client.request('DELETE', '/api/gone')).toBeUndefined();
    expect(client.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /api/companies/c1/years',
      'POST /api/vouchers',
      'GET /api/q?x=5',
      'DELETE /api/gone',
    ]);
  });

  it('throws what a route throws, and 404 NO_ROUTE for anything unmatched', async () => {
    const client = createFakeClient([
      {
        method: 'POST',
        path: '/api/boom',
        reply: () => {
          throw new ApiError(409, 'STALE_VERSION', 'changed');
        },
      },
    ]);
    await expect(client.request('POST', '/api/boom')).rejects.toMatchObject({ status: 409, code: 'STALE_VERSION' });
    await expect(client.request('GET', '/api/none')).rejects.toMatchObject({ status: 404, code: 'NO_ROUTE' });
  });
});

describe('endpoints', () => {
  it('build the right requests', async () => {
    const client = createFakeClient([
      { method: 'GET', path: '/api/health', reply: () => ({ ok: true }) },
      { method: 'POST', path: '/api/login', reply: ({ body }) => ({ token: 't', actor: { userId: 'u', username: body.username, isAdmin: false } }) },
      { method: 'POST', path: '/api/logout', reply: () => undefined },
      { method: 'GET', path: '/api/me', reply: () => ({ actor: {}, rights: {}, companies: [] }) },
      { method: 'GET', path: '/api/companies/c1/years', reply: () => [] },
      { method: 'GET', path: '/api/companies/c1/groups', reply: () => [] },
      { method: 'GET', path: '/api/companies/c1/ledgers', reply: () => [] },
      { method: 'GET', path: '/api/companies/c1/books', reply: () => [] },
      { method: 'GET', path: '/api/companies/c1/ledgers/l1/pending-bills', reply: () => [] },
      { method: 'POST', path: '/api/vouchers', reply: () => ({ voucherId: 'v', voucherNo: 1 }) },
      { method: 'GET', path: '/api/vouchers/v', reply: () => ({ id: 'v' }) },
      { method: 'PUT', path: '/api/vouchers/v', reply: () => ({ version: 2 }) },
      { method: 'DELETE', path: '/api/vouchers/v', reply: () => undefined },
      { method: 'GET', path: '/api/companies/c1/vouchers', reply: () => [] },
    ]);
    await api.health(client);
    expect((await api.login(client, 'asha', 'pw')).actor.username).toBe('asha');
    await api.logout(client);
    await api.me(client);
    await api.listYears(client, 'c1');
    await api.listGroups(client, 'c1');
    await api.listLedgers(client, 'c1');
    await api.listBooks(client, 'c1');
    await api.pendingBills(client, 'c1', 'l1');
    await api.saveVoucher(client, { companyId: 'c1' } as never);
    await api.getVoucher(client, 'v');
    await api.updateVoucher(client, 'v', { version: 1 } as never);
    await api.deleteVoucher(client, 'v', 3);
    await api.listVouchers(client, 'c1', { yearId: 'y1', from: '2026-05-01', limit: 20 });
    const paths = client.calls.map((c) => c.path);
    expect(paths).toContain('/api/vouchers/v?version=3');
    expect(paths).toContain('/api/companies/c1/vouchers?yearId=y1&from=2026-05-01&limit=20');
  });
});
