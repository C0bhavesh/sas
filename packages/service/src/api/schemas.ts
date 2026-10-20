import { z } from 'zod';
import { ADJUSTMENT_KINDS, MODULES } from '@sas/shared';
import { BOOK_TYPES } from '../masters/books';

export const uuid = z.string().uuid();
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');

const adjustment = z.object({ billId: uuid, amount: z.string(), kind: z.enum(ADJUSTMENT_KINDS) });

export const voucherLine = z.object({
  ledgerId: uuid,
  side: z.enum(['Dr', 'Cr']),
  amount: z.string(),
  narration: z.string().optional(),
  adjustments: z.array(adjustment).optional(),
});

export const saveVoucherBody = z.object({
  companyId: uuid,
  yearId: uuid,
  bookId: uuid,
  kind: z.enum(['receipt', 'payment', 'journal']),
  date: isoDate,
  narration: z.string().optional(),
  lines: z.array(voucherLine).min(1),
});

export const updateVoucherBody = z.object({
  version: z.number().int().positive(),
  date: isoDate,
  narration: z.string().optional(),
  lines: z.array(voucherLine).min(1),
});

export const loginBody = z.object({ username: z.string().min(1), password: z.string().min(1) });

export const newCompanyBody = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  gstin: z.string().optional(),
  pan: z.string().optional(),
  stateCode: z.string().optional(),
  fyLabel: z.string().min(1),
  fyStart: isoDate,
  fyEnd: isoDate,
});

export const newLedgerBody = z.object({
  groupCode: z.number().int(),
  name: z.string().min(1),
  code: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  stateCode: z.string().optional(),
  gstin: z.string().optional(),
  pan: z.string().optional(),
  creditDays: z.number().int().nonnegative().optional(),
});

export const openingBody = z.object({ yearId: uuid, amount: z.string(), side: z.enum(['Dr', 'Cr']) });

export const newBookBody = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(BOOK_TYPES),
  defaultLedgerId: uuid.optional(),
});

export const newUserBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  isAdmin: z.boolean().optional(),
  email: z.string().optional(),
  canExportAudit: z.boolean().optional(),
});

export const statusBody = z.object({ status: z.enum(['active', 'blocked']) });

const rightsShape = z.object({
  add: z.boolean(),
  edit: z.boolean(),
  delete: z.boolean(),
  print: z.boolean(),
  find: z.boolean(),
  show: z.boolean(),
});
export const setRightsBody = z.object({ rights: z.record(z.enum(MODULES), rightsShape) });

export const blockedGroupsBody = z.object({ groupIds: z.array(uuid) });
export const hiddenCompaniesBody = z.object({ companyIds: z.array(uuid) });
export const freezeBody = z.object({ date: isoDate.nullable() });

export const closeYearBody = z.object({
  companyId: uuid,
  next: z.object({ label: z.string().min(1), start: isoDate, end: isoDate }),
});
export const companyBody = z.object({ companyId: uuid });
export const restoreBody = z.object({ file: z.string().min(1), adminPassword: z.string().min(1) });
