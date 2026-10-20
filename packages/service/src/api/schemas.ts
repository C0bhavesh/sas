import { z } from 'zod';
import { ADJUSTMENT_KINDS } from '@sas/shared';

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
