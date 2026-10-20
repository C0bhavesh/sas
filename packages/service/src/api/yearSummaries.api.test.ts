import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setHiddenCompanies } from '../security/rights';
import { setupApi, type ApiFixture } from '../testing/apiFixtures';

let f: ApiFixture;
beforeEach(async () => {
  f = await setupApi();
});
afterEach(async () => {
  await f.close();
});

const get = (url: string, token = f.adminToken) => f.app.inject({ method: 'GET', url, headers: f.auth(token) });

async function receipt(date: string, ledgerId: string) {
  const r = await f.app.inject({
    method: 'POST',
    url: '/api/vouchers',
    headers: f.auth(f.adminToken),
    payload: {
      companyId: f.s.companyId,
      yearId: f.s.yearId,
      bookId: f.s.cashBookId,
      kind: 'receipt',
      date,
      lines: [{ ledgerId, side: 'Cr', amount: '100.00' }],
    },
  });
  expect(r.statusCode).toBe(201);
}

async function addYear(label: string, start: string, end: string, status: string) {
  const id = randomUUID();
  await f.db.query('INSERT INTO financial_years (id, company_id, label, start_date, end_date, status) VALUES ($1,$2,$3,$4,$5,$6)', [
    id,
    f.s.companyId,
    label,
    start,
    end,
    status,
  ]);
  return id;
}

describe('GET /api/companies/:id/year-summaries', () => {
  it('counts vouchers, accounts used and the last entry date per year, newest year first', async () => {
    await addYear('2025-26', '2025-04-01', '2026-03-31', 'closed');
    await receipt('2026-05-10', f.s.partyLedgerId);
    await receipt('2026-07-02', f.s.partyLedgerId);
    const rows = (await get(`/api/companies/${f.s.companyId}/year-summaries`)).json();
    expect(rows.map((r: { label: string }) => r.label)).toEqual(['2026-27', '2025-26']);
    // each receipt touches the party and the cash ledger
    expect(rows[0]).toMatchObject({ status: 'open', startDate: '2026-04-01', endDate: '2027-03-31', voucherCount: 2, accountCount: 2, lastEntryDate: '2026-07-02' });
    expect(rows[1]).toMatchObject({ status: 'closed', voucherCount: 0, accountCount: 0, lastEntryDate: null });
  });

  it('refuses a user who cannot see the company', async () => {
    const u = await f.addUser('clerk');
    await setHiddenCompanies(f.db, u.id, [f.s.companyId]);
    const r = await get(`/api/companies/${f.s.companyId}/year-summaries`, u.token);
    expect(r.statusCode).toBe(403);
  });
});

describe('GET /api/companies', () => {
  it('includes gstin, the number of years and the status of the newest year', async () => {
    await f.db.query('UPDATE companies SET gstin = $1 WHERE id = $2', ['24AAAPL1234C1Z5', f.s.companyId]);
    await addYear('2025-26', '2025-04-01', '2026-03-31', 'closed');
    const rows = (await get('/api/companies')).json();
    expect(rows[0]).toMatchObject({ code: 'C1', gstin: '24AAAPL1234C1Z5', yearCount: 2, latestYearStatus: 'open' });
  });
});
