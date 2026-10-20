import { afterEach, describe, expect, it } from 'vitest';
import { setupApi, type ApiFixture } from '../testing/apiFixtures';

let f: ApiFixture | undefined;
afterEach(async () => {
  await f?.close();
  f = undefined;
});

describe('normal mode (the default)', () => {
  it('says a login is required, and refuses requests without one', async () => {
    f = await setupApi();
    const health = await f.app.inject({ method: 'GET', url: '/api/health' });
    expect(health.json()).toEqual({ ok: true, loginRequired: true });
    expect((await f.app.inject({ method: 'GET', url: '/api/me' })).statusCode).toBe(401);
  });
});

describe('test mode (noLogin)', () => {
  it('says no login is required, and serves requests as the administrator without a token', async () => {
    f = await setupApi({ noLogin: true });
    const health = await f.app.inject({ method: 'GET', url: '/api/health' });
    expect(health.json()).toEqual({ ok: true, loginRequired: false });
    const me = await f.app.inject({ method: 'GET', url: '/api/me' });
    expect(me.statusCode).toBe(200);
    expect(me.json().actor).toMatchObject({ username: 'boss', isAdmin: true });
  });

  it('writes are attributed to that administrator in the audit log', async () => {
    f = await setupApi({ noLogin: true });
    const r = await f.app.inject({
      method: 'POST',
      url: '/api/vouchers',
      payload: {
        companyId: f.s.companyId,
        yearId: f.s.yearId,
        bookId: f.s.cashBookId,
        kind: 'receipt',
        date: '2026-05-10',
        lines: [{ ledgerId: f.s.partyLedgerId, side: 'Cr', amount: '10' }],
      },
    });
    expect(r.statusCode).toBe(201);
    const rows = await f.db.query<{ user_id: string }>(`SELECT user_id FROM audit_log WHERE entity = 'voucher'`);
    expect(rows[0]?.user_id).toBe(f.adminId);
  });

  it('a wrong token does not lock you out in test mode', async () => {
    f = await setupApi({ noLogin: true });
    const r = await f.app.inject({ method: 'GET', url: '/api/me', headers: f.auth('garbage') });
    expect(r.statusCode).toBe(200);
  });

  it('normal sign-in still works in test mode', async () => {
    f = await setupApi({ noLogin: true });
    const r = await f.app.inject({ method: 'POST', url: '/api/login', payload: { username: 'boss', password: 'adminpass' } });
    expect(r.statusCode).toBe(200);
  });

  it('cannot bypass anything when there is no administrator to act as', async () => {
    f = await setupApi({ noLogin: true });
    await f.db.query('DELETE FROM sessions');
    await f.db.query('DELETE FROM users');
    expect((await f.app.inject({ method: 'GET', url: '/api/me' })).statusCode).toBe(401);
  });
});
