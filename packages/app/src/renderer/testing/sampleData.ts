import { MODULES, NO_RIGHTS, type Actor, type ModuleName, type Rights } from '@sas/shared';
import { ApiError } from '../api/client';
import type { BookLite, CompanyLite, GroupLite, LedgerLite, MeResponse, YearLite, YearSummary } from '../api/types';
import type { FakeRoute } from './fakeClient';

export const COMPANY: CompanyLite = { id: 'c1', code: 'C1', name: 'Test Textiles', gstin: '24AAAPL1234C1Z5', yearCount: 2, latestYearStatus: 'open' };
export const YEAR_2026: YearLite = { id: 'y1', label: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31', status: 'open' };
export const YEAR_2025: YearLite = { id: 'y0', label: '2025-26', startDate: '2025-04-01', endDate: '2026-03-31', status: 'closed' };

export const YEAR_SUMMARIES: YearSummary[] = [
  { ...YEAR_2026, voucherCount: 1284, accountCount: 142, lastEntryDate: '2026-10-20' },
  { ...YEAR_2025, voucherCount: 3906, accountCount: 138, lastEntryDate: '2026-03-31' },
];

export const ADMIN = { userId: 'u-admin', username: 'boss', isAdmin: true } satisfies Actor;
export const CLERK = { userId: 'u-clerk', username: 'clerk', isAdmin: false } satisfies Actor;

export function rightsFor(partial: Partial<Record<ModuleName, Partial<Rights>>> = {}): Record<ModuleName, Rights> {
  return Object.fromEntries(MODULES.map((m) => [m, { ...NO_RIGHTS, ...(partial[m] ?? {}) }])) as Record<ModuleName, Rights>;
}

export const ME_ADMIN: MeResponse = { actor: ADMIN, rights: rightsFor(), companies: [COMPANY] };
export const ME_CLERK: MeResponse = {
  actor: CLERK,
  rights: rightsFor({ cash_book: { add: true, find: true, show: true } }),
  companies: [COMPANY],
};

const ledger = (id: string, name: string, groupCode: number, groupName: string, city: string | null = null): LedgerLite => ({
  id,
  name,
  groupId: `g${groupCode}`,
  groupCode,
  groupName,
  city,
  gstin: null,
  status: 'active',
});

export const LEDGERS: LedgerLite[] = [
  ledger('l-cash', 'Cash', 16, 'Cash-in-Hand'),
  ledger('l-ramesh', 'Ramesh Traders', 42, 'Sundry Debtors', 'Surat'),
  ledger('l-suresh', 'Suresh Textiles', 42, 'Sundry Debtors', 'Surat'),
  ledger('l-discount', 'Discount', 32, 'Profit & Loss Expense'),
];

export const GROUPS: GroupLite[] = [
  { id: 'g16', code: 16, name: 'Cash-in-Hand', nature: 'asset', parentId: null },
  { id: 'g32', code: 32, name: 'Profit & Loss Expense', nature: 'expense', parentId: null },
  { id: 'g42', code: 42, name: 'Sundry Debtors', nature: 'asset', parentId: null },
];

export const BOOKS: BookLite[] = [
  { id: 'b-cash', code: 'CB', name: 'Cash Book', type: 'cash', defaultLedgerId: 'l-cash' },
  { id: 'b-jv', code: 'JV', name: 'Journal', type: 'journal', defaultLedgerId: null },
];

/** The routes every screen test needs. `extra` routes win because they are listed first. */
export function baseRoutes(opts: { me?: MeResponse; extra?: FakeRoute[] } = {}): FakeRoute[] {
  const me = opts.me ?? ME_ADMIN;
  return [
    ...(opts.extra ?? []),
    { method: 'GET', path: '/api/health', reply: () => ({ ok: true }) },
    {
      method: 'POST',
      path: '/api/login',
      reply: ({ body }) => {
        if (body.password !== 'secret') throw new ApiError(401, 'BAD_CREDENTIALS', 'Wrong username or password');
        return { token: 'tok', actor: me.actor };
      },
    },
    { method: 'POST', path: '/api/logout', reply: () => undefined },
    { method: 'GET', path: '/api/me', reply: () => me },
    { method: 'GET', path: '/api/companies/c1/years', reply: () => [YEAR_2025, YEAR_2026] },
    { method: 'GET', path: '/api/companies/c1/year-summaries', reply: () => YEAR_SUMMARIES },
    { method: 'GET', path: '/api/companies/c1/groups', reply: () => GROUPS },
    { method: 'GET', path: '/api/companies/c1/ledgers', reply: () => LEDGERS },
    { method: 'GET', path: '/api/companies/c1/books', reply: () => BOOKS },
  ];
}
