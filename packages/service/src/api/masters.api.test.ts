import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setBlockedGroups } from '../security/rights';
import { setupApi, type ApiFixture } from '../testing/apiFixtures';

let f: ApiFixture;
beforeEach(async () => {
  f = await setupApi();
});
afterEach(async () => {
  await f.close();
});

const get = (url: string, token = f.adminToken) => f.app.inject({ method: 'GET', url, headers: f.auth(token) });
const post = (url: string, payload: object, token = f.adminToken) =>
  f.app.inject({ method: 'POST', url, headers: f.auth(token), payload });

describe('lookups', () => {
  it('lists years, groups, ledgers and books of a company', async () => {
    const c = f.s.companyId;
    expect((await get(`/api/companies/${c}/years`)).json()).toMatchObject([{ label: '2026-27', status: 'open', startDate: '2026-04-01' }]);
    expect((await get(`/api/companies/${c}/groups`)).json().length).toBeGreaterThan(20);
    const ledgers = (await get(`/api/companies/${c}/ledgers`)).json() as { name: string; groupCode: number }[];
    expect(ledgers.map((l) => l.name).sort()).toEqual(['Cash', 'Discount', 'Ramesh Traders']);
    expect((await get(`/api/companies/${c}/books`)).json().map((b: { code: string }) => b.code).sort()).toEqual(['CB', 'JV']);
    expect((await get('/api/companies')).json()).toHaveLength(1);
  });

  it('hides ledgers and groups of a blocked group from that user', async () => {
    const user = await f.addUser('clerk');
    const g42 = (await f.db.query<{ id: string }>('SELECT id FROM account_groups WHERE company_id = $1 AND code = 42', [f.s.companyId]))[0]!.id;
    await setBlockedGroups(f.db, user.id, [g42]);
    const ledgers = (await get(`/api/companies/${f.s.companyId}/ledgers`, user.token)).json() as { name: string }[];
    expect(ledgers.map((l) => l.name)).not.toContain('Ramesh Traders');
    const groups = (await get(`/api/companies/${f.s.companyId}/groups`, user.token)).json() as { code: number }[];
    expect(groups.map((g) => g.code)).not.toContain(42);
  });
});

describe('creating masters', () => {
  it('creates a company and audits it', async () => {
    const r = await post('/api/companies', { code: 'C2', name: 'Second Co', fyLabel: '2026-27', fyStart: '2026-04-01', fyEnd: '2027-03-31' });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toHaveProperty('companyId');
    expect((await f.db.query(`SELECT 1 FROM audit_log WHERE entity = 'company' AND action = 'add'`)).length).toBe(1);
  });

  it('creates a ledger with an audit row; a duplicate name is 409; an unknown group is 422', async () => {
    const url = `/api/companies/${f.s.companyId}/ledgers`;
    const ok = await post(url, { groupCode: 42, name: 'Suresh Textiles', city: 'Surat', creditDays: 30 });
    expect(ok.statusCode).toBe(201);
    expect((await f.db.query(`SELECT 1 FROM audit_log WHERE entity = 'ledger' AND entity_id = $1`, [ok.json().id])).length).toBe(1);
    expect((await post(url, { groupCode: 42, name: 'SURESH TEXTILES' })).statusCode).toBe(409);
    const bad = await post(url, { groupCode: 999, name: 'X' });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().code).toBe('INVALID_INPUT');
  });

  it('needs the account_master add right, and not in a blocked group', async () => {
    const url = `/api/companies/${f.s.companyId}/ledgers`;
    const none = await f.addUser('none');
    expect((await post(url, { groupCode: 42, name: 'A' }, none.token)).statusCode).toBe(403);
    const clerk = await f.addUser('clerk', { account_master: { add: true } });
    expect((await post(url, { groupCode: 42, name: 'A' }, clerk.token)).statusCode).toBe(201);
    const g16 = (await f.db.query<{ id: string }>('SELECT id FROM account_groups WHERE company_id = $1 AND code = 16', [f.s.companyId]))[0]!.id;
    await setBlockedGroups(f.db, clerk.id, [g16]);
    expect((await post(url, { groupCode: 16, name: 'B' }, clerk.token)).statusCode).toBe(403);
  });

  it('sets an opening balance only in an open year', async () => {
    const url = `/api/ledgers/${f.s.partyLedgerId}/opening`;
    const ok = await post(url, { yearId: f.s.yearId, amount: '1500.50', side: 'Dr' });
    expect(ok.statusCode).toBe(204);
    const row = await f.db.query<{ amount: string }>('SELECT amount FROM ledger_openings WHERE ledger_id = $1', [f.s.partyLedgerId]);
    expect(row[0]?.amount).toBe('1500.50');
    await f.db.query(`UPDATE financial_years SET status = 'closed' WHERE id = $1`, [f.s.yearId]);
    const closed = await post(url, { yearId: f.s.yearId, amount: '1', side: 'Dr' });
    expect(closed.statusCode).toBe(422);
    expect(closed.json().code).toBe('YEAR_BAD_STATE');
  });

  it('creates books; a cash book needs a ledger; the ledger must be the same company\'s', async () => {
    const url = `/api/companies/${f.s.companyId}/books`;
    expect((await post(url, { code: 'JV2', name: 'Journal 2', type: 'journal' })).statusCode).toBe(201);
    expect((await post(url, { code: 'CB2', name: 'Cash 2', type: 'cash' })).statusCode).toBe(422);
    expect((await post(url, { code: 'CB2', name: 'Cash 2', type: 'cash', defaultLedgerId: f.s.cashLedgerId })).statusCode).toBe(201);
    expect((await post(url, { code: 'X', name: 'X', type: 'nonsense' })).statusCode).toBe(400);
    const other = await post('/api/companies', { code: 'C2', name: 'Second', fyLabel: '2026-27', fyStart: '2026-04-01', fyEnd: '2027-03-31' });
    const foreign = await post(`/api/companies/${other.json().companyId}/books`, {
      code: 'CB', name: 'Cash', type: 'cash', defaultLedgerId: f.s.cashLedgerId,
    });
    expect(foreign.statusCode).toBe(422);
  });
});
