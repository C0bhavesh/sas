import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerBill } from '../outstanding/billService';
import { setBlockedGroups, setHiddenCompanies } from '../security/rights';
import { createCompany } from '../masters/companies';
import { setupApi, type ApiFixture } from '../testing/apiFixtures';

let f: ApiFixture;
beforeEach(async () => {
  f = await setupApi();
});
afterEach(async () => {
  await f.close();
});

const receiptBody = (amount = '1000.00', extra: object = {}) => ({
  companyId: f.s.companyId,
  yearId: f.s.yearId,
  bookId: f.s.cashBookId,
  kind: 'receipt',
  date: '2026-05-10',
  lines: [{ ledgerId: f.s.partyLedgerId, side: 'Cr', amount }],
  ...extra,
});

async function post(token: string, payload: object) {
  return f.app.inject({ method: 'POST', url: '/api/vouchers', headers: f.auth(token), payload });
}

describe('authentication', () => {
  it('health needs no login', async () => {
    const r = await f.app.inject({ method: 'GET', url: '/api/health' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true });
  });

  it('everything else needs a token', async () => {
    const r = await f.app.inject({ method: 'GET', url: '/api/me' });
    expect(r.statusCode).toBe(401);
    expect(r.json().code).toBe('NOT_AUTHENTICATED');
    const bad = await f.app.inject({ method: 'GET', url: '/api/me', headers: f.auth('garbage') });
    expect(bad.statusCode).toBe(401);
  });

  it('login rejects bad credentials and accepts good ones; /me shows the user', async () => {
    const bad = await f.app.inject({ method: 'POST', url: '/api/login', payload: { username: 'boss', password: 'x' } });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().code).toBe('BAD_CREDENTIALS');
    const ok = await f.app.inject({ method: 'POST', url: '/api/login', payload: { username: 'boss', password: 'adminpass' } });
    expect(ok.statusCode).toBe(200);
    const me = await f.app.inject({ method: 'GET', url: '/api/me', headers: f.auth(ok.json().token) });
    expect(me.json().actor).toMatchObject({ username: 'boss', isAdmin: true });
    expect(me.json().companies).toHaveLength(1);
    expect(me.json().rights.cash_book).toEqual({ add: false, edit: false, delete: false, print: false, find: false, show: false });
  });

  it('logout kills the token', async () => {
    const out = await f.app.inject({ method: 'POST', url: '/api/logout', headers: f.auth(f.adminToken) });
    expect(out.statusCode).toBe(204);
    const r = await f.app.inject({ method: 'GET', url: '/api/me', headers: f.auth(f.adminToken) });
    expect(r.statusCode).toBe(401);
  });
});

describe('POST /api/vouchers', () => {
  it('an admin saves a receipt', async () => {
    const r = await post(f.adminToken, receiptBody());
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ voucherNo: 1 });
  });

  it('records the signed-in user in the audit log', async () => {
    await post(f.adminToken, receiptBody());
    const rows = await f.db.query<{ user_id: string }>(`SELECT user_id FROM audit_log WHERE entity = 'voucher'`);
    expect(rows[0]?.user_id).toBe(f.adminId);
  });

  it('a user needs the right for the voucher kind', async () => {
    const clerk = await f.addUser('clerk');
    expect((await post(clerk.token, receiptBody())).statusCode).toBe(403);
    const cashier = await f.addUser('cashier', { cash_book: { add: true } });
    expect((await post(cashier.token, receiptBody())).statusCode).toBe(201);
    // cash_book rights do not cover journals
    const journal = {
      companyId: f.s.companyId,
      yearId: f.s.yearId,
      bookId: f.s.journalBookId,
      kind: 'journal',
      date: '2026-05-10',
      lines: [
        { ledgerId: f.s.partyLedgerId, side: 'Dr', amount: '5' },
        { ledgerId: f.s.discountLedgerId, side: 'Cr', amount: '5' },
      ],
    };
    expect((await post(cashier.token, journal)).statusCode).toBe(403);
  });

  it('maps an accounting error to 422 with its code', async () => {
    const r = await post(f.adminToken, {
      companyId: f.s.companyId,
      yearId: f.s.yearId,
      bookId: f.s.journalBookId,
      kind: 'journal',
      date: '2026-05-10',
      lines: [
        { ledgerId: f.s.partyLedgerId, side: 'Dr', amount: '100' },
        { ledgerId: f.s.discountLedgerId, side: 'Cr', amount: '90' },
      ],
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().code).toBe('NOT_BALANCED');
  });

  it('rejects a malformed body with 400', async () => {
    const r = await post(f.adminToken, { ...receiptBody(), lines: [] });
    expect(r.statusCode).toBe(400);
    expect(r.json().code).toBe('INVALID_INPUT');
  });

  it('refuses a hidden company and a ledger in a blocked group', async () => {
    const user = await f.addUser('cashier', { cash_book: { add: true } });
    await setBlockedGroups(f.db, user.id, [
      (await f.db.query<{ id: string }>('SELECT id FROM account_groups WHERE company_id = $1 AND code = 42', [f.s.companyId]))[0]!.id,
    ]);
    expect((await post(user.token, receiptBody())).statusCode).toBe(403);

    const other = await createCompany(f.db, { code: 'C2', name: 'Other', fyLabel: '2026-27', fyStart: '2026-04-01', fyEnd: '2027-03-31' });
    await setHiddenCompanies(f.db, user.id, [other.companyId]);
    expect((await post(user.token, { ...receiptBody(), companyId: other.companyId })).statusCode).toBe(403);
  });
});

describe('GET / PUT / DELETE /api/vouchers/:id', () => {
  async function saved() {
    return (await post(f.adminToken, receiptBody())).json() as { voucherId: string };
  }

  it('reads back what was saved', async () => {
    const { voucherId } = await saved();
    const r = await f.app.inject({ method: 'GET', url: `/api/vouchers/${voucherId}`, headers: f.auth(f.adminToken) });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ voucherNo: 1, version: 1, kind: 'receipt' });
    expect(r.json().lines[0]).toMatchObject({ ledgerName: 'Ramesh Traders', side: 'Cr', amount: '1000.00' });
  });

  it('updates with the right version and refuses a stale one with 409', async () => {
    const { voucherId } = await saved();
    const body = { version: 1, date: '2026-05-11', lines: [{ ledgerId: f.s.partyLedgerId, side: 'Cr', amount: '400.00' }] };
    const ok = await f.app.inject({ method: 'PUT', url: `/api/vouchers/${voucherId}`, headers: f.auth(f.adminToken), payload: body });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ version: 2 });
    const stale = await f.app.inject({ method: 'PUT', url: `/api/vouchers/${voucherId}`, headers: f.auth(f.adminToken), payload: body });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().code).toBe('STALE_VERSION');
  });

  it('deletes, then the voucher is gone', async () => {
    const { voucherId } = await saved();
    const del = await f.app.inject({ method: 'DELETE', url: `/api/vouchers/${voucherId}?version=1`, headers: f.auth(f.adminToken) });
    expect(del.statusCode).toBe(204);
    const gone = await f.app.inject({ method: 'GET', url: `/api/vouchers/${voucherId}`, headers: f.auth(f.adminToken) });
    expect(gone.statusCode).toBe(404);
    expect(gone.json().code).toBe('NOT_FOUND');
  });

  it('edit and delete need their own rights', async () => {
    const { voucherId } = await saved();
    const cashier = await f.addUser('cashier', { cash_book: { add: true, find: true } });
    const get = await f.app.inject({ method: 'GET', url: `/api/vouchers/${voucherId}`, headers: f.auth(cashier.token) });
    expect(get.statusCode).toBe(200);
    const del = await f.app.inject({ method: 'DELETE', url: `/api/vouchers/${voucherId}?version=1`, headers: f.auth(cashier.token) });
    expect(del.statusCode).toBe(403);
  });
});

describe('listing and pending bills', () => {
  it('lists vouchers of a company and year', async () => {
    await post(f.adminToken, receiptBody('100.00'));
    await post(f.adminToken, receiptBody('200.00'));
    const r = await f.app.inject({
      method: 'GET',
      url: `/api/companies/${f.s.companyId}/vouchers?yearId=${f.s.yearId}`,
      headers: f.auth(f.adminToken),
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().map((v: { voucherNo: number }) => v.voucherNo)).toEqual([2, 1]);
  });

  it('lists the pending bills of a ledger', async () => {
    await registerBill(f.db, {
      companyId: f.s.companyId,
      yearId: f.s.yearId,
      ledgerId: f.s.partyLedgerId,
      billNo: 'S-1',
      billDate: '2026-04-10',
      amount: '500',
      side: 'Dr',
    });
    const r = await f.app.inject({
      method: 'GET',
      url: `/api/companies/${f.s.companyId}/ledgers/${f.s.partyLedgerId}/pending-bills`,
      headers: f.auth(f.adminToken),
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject([{ billNo: 'S-1', pending: '500.00', side: 'Dr' }]);
  });
});
