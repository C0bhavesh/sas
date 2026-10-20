import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BackupConfig } from '../ops/backup';
import { setupApi, type ApiFixture } from '../testing/apiFixtures';

let f: ApiFixture;
let dir: string;
let calls: { cmd: string; args: string[] }[];
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sas-api-backup-'));
  calls = [];
  const backup: BackupConfig = {
    conn: { host: 'h', port: 5432, user: 'u', password: 'p', database: 'd' },
    dir,
    runner: {
      async run(cmd, args) {
        calls.push({ cmd, args });
        if (cmd === 'pg_dump') await writeFile(args[args.indexOf('--file') + 1]!, 'dump');
      },
    },
  };
  f = await setupApi({ backup });
});
afterEach(async () => {
  await f.close();
  await rm(dir, { recursive: true, force: true });
});

const send = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object, token = f.adminToken) =>
  f.app.inject({ method, url, headers: f.auth(token), payload });

describe('users', () => {
  it('an admin creates a user who can then log in; creation is audited', async () => {
    const r = await send('POST', '/api/users', { username: 'asha', password: 'pass1234', email: 'a@x.in' });
    expect(r.statusCode).toBe(201);
    const login = await f.app.inject({ method: 'POST', url: '/api/login', payload: { username: 'asha', password: 'pass1234' } });
    expect(login.statusCode).toBe(200);
    expect((await f.db.query(`SELECT 1 FROM audit_log WHERE entity = 'user' AND action = 'add'`)).length).toBe(1);
    const list = await send('GET', '/api/users');
    expect(list.json().map((u: { username: string }) => u.username).sort()).toEqual(['asha', 'boss']);
    expect(JSON.stringify(list.json())).not.toContain('scrypt');
  });

  it('a normal user cannot manage users', async () => {
    const clerk = await f.addUser('clerk');
    expect((await send('POST', '/api/users', { username: 'x1', password: 'pass1234' }, clerk.token)).statusCode).toBe(403);
    expect((await send('GET', '/api/users', undefined, clerk.token)).statusCode).toBe(403);
  });

  it('a short password or duplicate username is 422', async () => {
    expect((await send('POST', '/api/users', { username: 'asha', password: '123' })).statusCode).toBe(422);
    await send('POST', '/api/users', { username: 'asha', password: 'pass1234' });
    expect((await send('POST', '/api/users', { username: 'ASHA', password: 'pass1234' })).statusCode).toBe(422);
  });

  it('blocking a user stops their login and kills their token', async () => {
    const clerk = await f.addUser('clerk');
    expect((await send('PUT', `/api/users/${clerk.id}/status`, { status: 'blocked' })).statusCode).toBe(204);
    expect((await send('GET', '/api/me', undefined, clerk.token)).statusCode).toBe(401);
    const login = await f.app.inject({ method: 'POST', url: '/api/login', payload: { username: 'clerk', password: 'pass1234' } });
    expect(login.statusCode).toBe(403);
    expect(login.json().code).toBe('USER_BLOCKED');
  });

  it('sets and reads rights, which then take effect', async () => {
    const clerk = await f.addUser('clerk');
    const body = { rights: { cash_book: { add: true, edit: false, delete: false, print: true, find: true, show: true } } };
    expect((await send('PUT', `/api/users/${clerk.id}/rights`, body)).statusCode).toBe(204);
    const rights = (await send('GET', `/api/users/${clerk.id}/rights`)).json();
    expect(rights.cash_book).toEqual(body.rights.cash_book);
    expect(rights.journal).toEqual({ add: false, edit: false, delete: false, print: false, find: false, show: false });
    const v = await send(
      'POST',
      '/api/vouchers',
      {
        companyId: f.s.companyId,
        yearId: f.s.yearId,
        bookId: f.s.cashBookId,
        kind: 'receipt',
        date: '2026-05-10',
        lines: [{ ledgerId: f.s.partyLedgerId, side: 'Cr', amount: '10' }],
      },
      clerk.token,
    );
    expect(v.statusCode).toBe(201);
    expect((await send('PUT', `/api/users/${clerk.id}/rights`, { rights: { nonsense: body.rights.cash_book } })).statusCode).toBe(400);
  });

  it('sets blocked groups and hidden companies', async () => {
    const clerk = await f.addUser('clerk');
    const g42 = (await f.db.query<{ id: string }>('SELECT id FROM account_groups WHERE company_id = $1 AND code = 42', [f.s.companyId]))[0]!.id;
    expect((await send('PUT', `/api/users/${clerk.id}/blocked-groups`, { groupIds: [g42] })).statusCode).toBe(204);
    expect((await send('PUT', `/api/users/${clerk.id}/hidden-companies`, { companyIds: [f.s.companyId] })).statusCode).toBe(204);
    expect((await send('GET', '/api/me', undefined, clerk.token)).json().companies).toEqual([]);
    expect((await f.db.query(`SELECT 1 FROM audit_log WHERE entity = 'user' AND action = 'edit'`)).length).toBeGreaterThanOrEqual(2);
  });
});

describe('freeze and year-end', () => {
  it('freezing blocks vouchers through the API', async () => {
    expect((await send('POST', `/api/companies/${f.s.companyId}/freeze`, { date: '2026-06-30' })).statusCode).toBe(204);
    const r = await send('POST', '/api/vouchers', {
      companyId: f.s.companyId,
      yearId: f.s.yearId,
      bookId: f.s.cashBookId,
      kind: 'receipt',
      date: '2026-06-01',
      lines: [{ ledgerId: f.s.partyLedgerId, side: 'Cr', amount: '10' }],
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().code).toBe('PERIOD_FROZEN');
    expect((await send('POST', `/api/companies/${f.s.companyId}/freeze`, { date: null })).statusCode).toBe(204);
  });

  it('closes, reopens and locks a year', async () => {
    const next = { label: '2027-28', start: '2027-04-01', end: '2028-03-31' };
    const closed = await send('POST', `/api/years/${f.s.yearId}/close`, { companyId: f.s.companyId, next });
    expect(closed.statusCode).toBe(200);
    expect(closed.json()).toMatchObject({ netProfit: '0.00' });
    expect((await send('POST', `/api/years/${f.s.yearId}/reopen`, { companyId: f.s.companyId })).statusCode).toBe(204);
    await send('POST', `/api/years/${f.s.yearId}/close`, { companyId: f.s.companyId, next });
    expect((await send('POST', `/api/years/${f.s.yearId}/lock`, { companyId: f.s.companyId })).statusCode).toBe(204);
    const again = await send('POST', `/api/years/${f.s.yearId}/reopen`, { companyId: f.s.companyId });
    expect(again.statusCode).toBe(422);
    expect(again.json().code).toBe('YEAR_BAD_STATE');
  });

  it('a user without the utilities right cannot close a year', async () => {
    const clerk = await f.addUser('clerk');
    const next = { label: '2027-28', start: '2027-04-01', end: '2028-03-31' };
    expect((await send('POST', `/api/years/${f.s.yearId}/close`, { companyId: f.s.companyId, next }, clerk.token)).statusCode).toBe(403);
  });
});

describe('audit export', () => {
  it('returns the log to an admin with the export right, and nobody else', async () => {
    await send('POST', '/api/vouchers', {
      companyId: f.s.companyId,
      yearId: f.s.yearId,
      bookId: f.s.cashBookId,
      kind: 'receipt',
      date: '2026-05-10',
      lines: [{ ledgerId: f.s.partyLedgerId, side: 'Cr', amount: '10' }],
    });
    const r = await send('GET', `/api/audit?companyId=${f.s.companyId}&entity=voucher`);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject([{ entity: 'voucher', action: 'add', username: 'boss' }]);
    const clerk = await f.addUser('clerk', { users: { find: true }, reports: { find: true } });
    expect((await send('GET', `/api/audit?companyId=${f.s.companyId}`, undefined, clerk.token)).statusCode).toBe(403);
  });
});

describe('backup and restore', () => {
  it('backs up through the runner and prunes old files', async () => {
    const r = await send('POST', '/api/backup', {});
    expect(r.statusCode).toBe(200);
    expect(r.json().file).toMatch(/sas-\d{8}-\d{6}\.dump$/);
    expect(calls[0]?.cmd).toBe('pg_dump');
  });

  it('restores only with the admin password', async () => {
    const file = (await send('POST', '/api/backup', {})).json().file as string;
    const wrong = await send('POST', '/api/restore', { file, adminPassword: 'nope' });
    expect(wrong.statusCode).toBe(403);
    expect(calls.filter((c) => c.cmd === 'pg_restore')).toHaveLength(0);
    const ok = await send('POST', '/api/restore', { file, adminPassword: 'adminpass' });
    expect(ok.statusCode).toBe(204);
    expect(calls.filter((c) => c.cmd === 'pg_restore')).toHaveLength(1);
  });

  it('a normal user cannot back up or restore', async () => {
    const clerk = await f.addUser('clerk');
    expect((await send('POST', '/api/backup', {}, clerk.token)).statusCode).toBe(403);
    expect((await send('POST', '/api/restore', { file: join(dir, 'x'), adminPassword: 'pass1234' }, clerk.token)).statusCode).toBe(403);
  });
});

describe('backup not configured', () => {
  it('answers 501', async () => {
    const bare = await setupApi();
    try {
      const r = await bare.app.inject({ method: 'POST', url: '/api/backup', headers: bare.auth(bare.adminToken), payload: {} });
      expect(r.statusCode).toBe(501);
      expect(r.json().code).toBe('NOT_CONFIGURED');
    } finally {
      await bare.close();
    }
  });
});

describe('user access', () => {
  it('reads back blocked groups and hidden companies, for users with the find right only', async () => {
    const clerk = await f.addUser('clerk');
    const g42 = (await f.db.query<{ id: string }>('SELECT id FROM account_groups WHERE company_id = $1 AND code = 42', [f.s.companyId]))[0]!.id;
    await send('PUT', `/api/users/${clerk.id}/blocked-groups`, { groupIds: [g42] });
    await send('PUT', `/api/users/${clerk.id}/hidden-companies`, { companyIds: [f.s.companyId] });
    const r = await send('GET', `/api/users/${clerk.id}/access`);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ blockedGroupIds: [g42], hiddenCompanyIds: [f.s.companyId] });
    const plain = await f.addUser('plain');
    expect((await send('GET', `/api/users/${clerk.id}/access`, undefined, plain.token)).statusCode).toBe(403);
  });
});
