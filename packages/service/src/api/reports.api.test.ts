import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setOpening } from '../masters/ledgers';
import { registerBill } from '../outstanding/billService';
import { saveVoucher } from '../posting/voucherService';
import { setBlockedGroups } from '../security/rights';
import { setupApi, type ApiFixture } from '../testing/apiFixtures';

let f: ApiFixture;
beforeEach(async () => {
  f = await setupApi();
  await setOpening(f.db, f.s.cashLedgerId, f.s.yearId, '1000', 'Dr');
  await saveVoucher(f.db, {
    companyId: f.s.companyId,
    yearId: f.s.yearId,
    bookId: f.s.cashBookId,
    kind: 'receipt',
    date: '2026-05-10',
    lines: [{ ledgerId: f.s.partyLedgerId, side: 'Cr', amount: '500' }],
    actorId: null,
  });
  await registerBill(f.db, {
    companyId: f.s.companyId,
    yearId: f.s.yearId,
    ledgerId: f.s.partyLedgerId,
    billNo: 'S-1',
    billDate: '2026-04-10',
    amount: '800',
    side: 'Dr',
  });
});
afterEach(async () => {
  await f.close();
});

const get = (url: string, token = f.adminToken) => f.app.inject({ method: 'GET', url, headers: f.auth(token) });
const q = () => `companyId=${f.s.companyId}&yearId=${f.s.yearId}`;

describe('report routes', () => {
  it('ledger report', async () => {
    const r = await get(`/api/reports/ledger?${q()}&ledgerId=${f.s.cashLedgerId}&from=2026-04-01&to=2026-05-31`);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ ledgerName: 'Cash', closing: { amount: '1500.00', side: 'Dr' } });
  });

  it('trial balance, profit and loss, balance sheet', async () => {
    const tb = await get(`/api/reports/trial-balance?${q()}&asOn=2027-03-31`);
    expect(tb.json()).toMatchObject({ totalDebit: '1500.00', totalCredit: '500.00', difference: '1000.00' });
    expect((await get(`/api/reports/profit-loss?${q()}&asOn=2027-03-31`)).json()).toMatchObject({ netProfit: '0.00' });
    expect((await get(`/api/reports/balance-sheet?${q()}&asOn=2027-03-31`)).statusCode).toBe(200);
  });

  it('ageing', async () => {
    const r = await get(`/api/reports/ageing?companyId=${f.s.companyId}&asOn=2026-12-31`);
    expect(r.json().rows[0]).toMatchObject({ ledgerName: 'Ramesh Traders', total: '800.00', onAccount: '500.00', net: '300.00' });
  });

  it('cash book', async () => {
    const r = await get(`/api/reports/cash-book?${q()}&bookId=${f.s.cashBookId}&from=2026-05-01&to=2026-05-31`);
    expect(r.json()).toEqual([
      {
        date: '2026-05-10',
        opening: { amount: '1000.00', side: 'Dr' },
        receipts: '500.00',
        payments: '0.00',
        closing: { amount: '1500.00', side: 'Dr' },
      },
    ]);
  });

  it('rejects bad dates with 400', async () => {
    const r = await get(`/api/reports/trial-balance?${q()}&asOn=31-03-2027`);
    expect(r.statusCode).toBe(400);
  });
});

describe('report security', () => {
  it('needs the reports find right', async () => {
    const nobody = await f.addUser('nobody');
    expect((await get(`/api/reports/trial-balance?${q()}&asOn=2027-03-31`, nobody.token)).statusCode).toBe(403);
    const viewer = await f.addUser('viewer', { reports: { find: true } });
    expect((await get(`/api/reports/trial-balance?${q()}&asOn=2027-03-31`, viewer.token)).statusCode).toBe(200);
  });

  it('leaves blocked groups out of the reports and refuses their ledger report', async () => {
    const viewer = await f.addUser('viewer', { reports: { find: true } });
    const g42 = (await f.db.query<{ id: string }>('SELECT id FROM account_groups WHERE company_id = $1 AND code = 42', [f.s.companyId]))[0]!.id;
    await setBlockedGroups(f.db, viewer.id, [g42]);
    const tb = (await get(`/api/reports/trial-balance?${q()}&asOn=2027-03-31`, viewer.token)).json() as { rows: { ledgerName: string }[] };
    expect(tb.rows.map((r) => r.ledgerName)).not.toContain('Ramesh Traders');
    const ageing = (await get(`/api/reports/ageing?companyId=${f.s.companyId}&asOn=2026-12-31`, viewer.token)).json();
    expect(ageing.rows).toEqual([]);
    const ledger = await get(`/api/reports/ledger?${q()}&ledgerId=${f.s.partyLedgerId}&from=2026-04-01&to=2026-05-31`, viewer.token);
    expect(ledger.statusCode).toBe(403);
  });
});
