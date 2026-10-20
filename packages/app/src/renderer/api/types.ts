import type { AdjustmentKind, Actor, ModuleName, Rights, Side, VoucherKind } from '@sas/shared';

export interface CompanyLite {
  id: string;
  code: string;
  name: string;
  freezeDate?: string | null;
  gstin?: string | null;
  yearCount?: number;
  latestYearStatus?: string | null;
}

export interface YearLite {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface YearSummary extends YearLite {
  voucherCount: number;
  accountCount: number;
  lastEntryDate: string | null;
}

export interface GroupLite {
  id: string;
  code: number;
  name: string;
  nature: string;
  parentId: string | null;
}

export interface LedgerLite {
  id: string;
  name: string;
  groupId: string;
  groupCode: number;
  groupName: string;
  city: string | null;
  gstin: string | null;
  status: string;
}

export interface BookLite {
  id: string;
  code: string;
  name: string;
  type: string;
  defaultLedgerId: string | null;
}

export interface PendingBill {
  id: string;
  billNo: string;
  billDate: string;
  dueDate: string | null;
  side: Side;
  original: string;
  pending: string;
}

export interface BillAdjustment {
  billId: string;
  amount: string;
  kind: AdjustmentKind;
}

export interface VoucherLineBody {
  ledgerId: string;
  side: Side;
  amount: string;
  narration?: string;
  adjustments?: BillAdjustment[];
}

export interface SaveVoucherBody {
  companyId: string;
  yearId: string;
  bookId: string;
  kind: VoucherKind;
  date: string;
  narration?: string;
  lines: VoucherLineBody[];
}

export interface UpdateVoucherBody {
  version: number;
  date: string;
  narration?: string;
  lines: VoucherLineBody[];
}

export interface VoucherView {
  id: string;
  companyId: string;
  yearId: string;
  bookId: string;
  kind: VoucherKind;
  voucherNo: number;
  date: string;
  narration: string | null;
  version: number;
  lines: {
    lineNo: number;
    ledgerId: string;
    ledgerName: string;
    side: Side;
    amount: string;
    narration: string | null;
    adjustments: BillAdjustment[];
  }[];
}

export interface VoucherSummary {
  id: string;
  voucherNo: number;
  date: string;
  kind: VoucherKind;
  bookCode: string;
  narration: string | null;
  total: string;
}

export interface MeResponse {
  actor: Actor;
  rights: Record<ModuleName, Rights>;
  companies: CompanyLite[];
}
