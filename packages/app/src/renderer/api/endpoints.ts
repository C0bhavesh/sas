import type { Actor, ModuleName, Rights } from '@sas/shared';
import type { ApiClient } from './client';
import type {
  BookLite,
  GroupLite,
  LedgerLite,
  MeResponse,
  PendingBill,
  SaveVoucherBody,
  UpdateVoucherBody,
  VoucherSummary,
  VoucherView,
  YearLite,
} from './types';

export const health = (api: ApiClient) => api.request<{ ok: boolean }>('GET', '/api/health');

export const login = (api: ApiClient, username: string, password: string) =>
  api.request<{ token: string; actor: Actor }>('POST', '/api/login', { username, password });

export const logout = (api: ApiClient) => api.request<void>('POST', '/api/logout');

export const me = (api: ApiClient) => api.request<MeResponse>('GET', '/api/me');

export const listYears = (api: ApiClient, companyId: string) =>
  api.request<YearLite[]>('GET', `/api/companies/${companyId}/years`);

export const listGroups = (api: ApiClient, companyId: string) =>
  api.request<GroupLite[]>('GET', `/api/companies/${companyId}/groups`);

export const listLedgers = (api: ApiClient, companyId: string) =>
  api.request<LedgerLite[]>('GET', `/api/companies/${companyId}/ledgers`);

export const listBooks = (api: ApiClient, companyId: string) =>
  api.request<BookLite[]>('GET', `/api/companies/${companyId}/books`);

export const pendingBills = (api: ApiClient, companyId: string, ledgerId: string) =>
  api.request<PendingBill[]>('GET', `/api/companies/${companyId}/ledgers/${ledgerId}/pending-bills`);

export const saveVoucher = (api: ApiClient, body: SaveVoucherBody) =>
  api.request<{ voucherId: string; voucherNo: number }>('POST', '/api/vouchers', body);

export const getVoucher = (api: ApiClient, id: string) => api.request<VoucherView>('GET', `/api/vouchers/${id}`);

export const updateVoucher = (api: ApiClient, id: string, body: UpdateVoucherBody) =>
  api.request<{ version: number }>('PUT', `/api/vouchers/${id}`, body);

export const deleteVoucher = (api: ApiClient, id: string, version: number) =>
  api.request<void>('DELETE', `/api/vouchers/${id}?version=${version}`);

export interface VoucherListQuery {
  yearId: string;
  bookId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

/** Builds "?a=1&b=2" from the defined values, in a stable order. */
export function queryString(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export const listVouchers = (api: ApiClient, companyId: string, q: VoucherListQuery) =>
  api.request<VoucherSummary[]>(
    'GET',
    `/api/companies/${companyId}/vouchers${queryString({ yearId: q.yearId, bookId: q.bookId, from: q.from, to: q.to, limit: q.limit, offset: q.offset })}`,
  );

export interface NewCompanyBody {
  code: string;
  name: string;
  gstin?: string;
  pan?: string;
  stateCode?: string;
  fyLabel: string;
  fyStart: string;
  fyEnd: string;
}
export const createCompany = (api: ApiClient, body: NewCompanyBody) =>
  api.request<{ companyId: string; yearId: string }>('POST', '/api/companies', body);

export interface NewLedgerBody {
  groupCode: number;
  name: string;
  address?: string;
  city?: string;
  stateCode?: string;
  gstin?: string;
  pan?: string;
  creditDays?: number;
}
export const createLedger = (api: ApiClient, companyId: string, body: NewLedgerBody) =>
  api.request<{ id: string }>('POST', `/api/companies/${companyId}/ledgers`, body);

export const setOpening = (api: ApiClient, ledgerId: string, body: { yearId: string; amount: string; side: 'Dr' | 'Cr' }) =>
  api.request<void>('POST', `/api/ledgers/${ledgerId}/opening`, body);

export interface OpeningRow {
  ledgerId: string;
  ledgerName: string;
  groupName: string;
  amount: string;
  side: 'Dr' | 'Cr';
}
export const listOpenings = (api: ApiClient, companyId: string, yearId: string) =>
  api.request<OpeningRow[]>('GET', `/api/companies/${companyId}/openings${queryString({ yearId })}`);

export const createBook = (api: ApiClient, companyId: string, body: { code: string; name: string; type: string; defaultLedgerId?: string }) =>
  api.request<{ id: string }>('POST', `/api/companies/${companyId}/books`, body);

export interface TrialBalanceDto {
  rows: { ledgerId: string; ledgerName: string; groupCode: number; groupName: string; debit: string; credit: string }[];
  groups: { code: number; name: string; nature: string; debit: string; credit: string }[];
  totalDebit: string;
  totalCredit: string;
  difference: string;
}
export interface SectionDto {
  groups: { code: number; name: string; amount: string; ledgers: { ledgerId: string; name: string; amount: string }[] }[];
  total: string;
}
export interface ProfitLossDto {
  income: SectionDto;
  expense: SectionDto;
  netProfit: string;
}
export interface BalanceSheetDto {
  assets: SectionDto;
  liabilities: SectionDto;
  netProfit: string;
  totalAssets: string;
  totalLiabilities: string;
  difference: string;
}
export interface AgeingDto {
  bucketLabels: string[];
  rows: { ledgerId: string; ledgerName: string; side: 'Dr' | 'Cr'; buckets: string[]; total: string; onAccount: string; net: string }[];
  totals: { buckets: string[]; total: string; onAccount: string; net: string };
}

interface AsOn {
  companyId: string;
  yearId: string;
  asOn: string;
}
export const trialBalanceReport = (api: ApiClient, p: AsOn) => api.request<TrialBalanceDto>('GET', `/api/reports/trial-balance${queryString({ ...p })}`);
export const profitLossReport = (api: ApiClient, p: AsOn) => api.request<ProfitLossDto>('GET', `/api/reports/profit-loss${queryString({ ...p })}`);
export const balanceSheetReport = (api: ApiClient, p: AsOn) => api.request<BalanceSheetDto>('GET', `/api/reports/balance-sheet${queryString({ ...p })}`);
export const ageingReport = (api: ApiClient, p: { companyId: string; asOn: string; side?: 'Dr' | 'Cr'; ledgerId?: string }) =>
  api.request<AgeingDto>('GET', `/api/reports/ageing${queryString({ ...p })}`);

export interface DrCr {
  amount: string;
  side: 'Dr' | 'Cr';
}

export interface LedgerReportDto {
  ledgerName: string;
  opening: DrCr;
  rows: { date: string; voucherNo: number; bookCode: string; narration: string | null; debit: string; credit: string; balance: DrCr }[];
  totalDebit: string;
  totalCredit: string;
  closing: DrCr;
}

export interface CashBookDayDto {
  date: string;
  opening: DrCr;
  receipts: string;
  payments: string;
  closing: DrCr;
}

export const ledgerReport = (api: ApiClient, p: { companyId: string; yearId: string; ledgerId: string; from: string; to: string }) =>
  api.request<LedgerReportDto>('GET', `/api/reports/ledger${queryString(p)}`);

export const cashBookReport = (api: ApiClient, p: { companyId: string; yearId: string; bookId: string; from: string; to: string }) =>
  api.request<CashBookDayDto[]>('GET', `/api/reports/cash-book${queryString(p)}`);

export interface UserRow {
  id: string;
  username: string;
  isAdmin: boolean;
  status: string;
  email: string | null;
}
export type RightsMap = Record<ModuleName, Rights>;
export interface UserAccess {
  blockedGroupIds: string[];
  hiddenCompanyIds: string[];
}

export const listUsers = (api: ApiClient) => api.request<UserRow[]>('GET', '/api/users');
export const createUser = (api: ApiClient, body: { username: string; password: string; isAdmin?: boolean; email?: string; canExportAudit?: boolean }) =>
  api.request<{ id: string }>('POST', '/api/users', body);
export const setUserStatus = (api: ApiClient, id: string, status: 'active' | 'blocked') => api.request<void>('PUT', `/api/users/${id}/status`, { status });
export const getUserRights = (api: ApiClient, id: string) => api.request<RightsMap>('GET', `/api/users/${id}/rights`);
export const setUserRights = (api: ApiClient, id: string, rights: RightsMap) => api.request<void>('PUT', `/api/users/${id}/rights`, { rights });
export const getUserAccess = (api: ApiClient, id: string) => api.request<UserAccess>('GET', `/api/users/${id}/access`);
export const setBlockedGroups = (api: ApiClient, id: string, groupIds: string[]) => api.request<void>('PUT', `/api/users/${id}/blocked-groups`, { groupIds });
export const setHiddenCompanies = (api: ApiClient, id: string, companyIds: string[]) => api.request<void>('PUT', `/api/users/${id}/hidden-companies`, { companyIds });

export const setFreeze = (api: ApiClient, companyId: string, date: string | null) =>
  api.request<void>('POST', `/api/companies/${companyId}/freeze`, { date });

export interface CloseYearResult {
  nextYearId: string;
  netProfit: string;
  carriedLedgers: number;
  carriedBills: number;
}
export const closeYear = (api: ApiClient, yearId: string, body: { companyId: string; next: { label: string; start: string; end: string } }) =>
  api.request<CloseYearResult>('POST', `/api/years/${yearId}/close`, body);
export const reopenYear = (api: ApiClient, yearId: string, companyId: string) => api.request<void>('POST', `/api/years/${yearId}/reopen`, { companyId });
export const lockYear = (api: ApiClient, yearId: string, companyId: string) => api.request<void>('POST', `/api/years/${yearId}/lock`, { companyId });

export interface BackupFile {
  name: string;
  path: string;
  size: number;
  modified: string;
}
export const listBackups = (api: ApiClient) => api.request<BackupFile[]>('GET', '/api/backups');
export const runBackup = (api: ApiClient) => api.request<{ file: string; removed: string[] }>('POST', '/api/backup', {});
export const restoreBackup = (api: ApiClient, file: string, adminPassword: string) => api.request<void>('POST', '/api/restore', { file, adminPassword });

export interface AuditRow {
  at: string;
  userId: string | null;
  username: string | null;
  entity: string;
  entityId: string | null;
  action: string;
  oldValues: unknown;
  newValues: unknown;
}
export const auditLog = (api: ApiClient, p: { companyId: string; from?: string; to?: string; entity?: string }) =>
  api.request<AuditRow[]>('GET', `/api/audit${queryString({ ...p })}`);
