import type { BillAdjustmentInput, Side } from '@sas/shared';
import type { Queryable } from '../db/types';

export interface LineAdjustmentParams {
  companyId: string;
  voucherId: string;
  lineId: string;
  ledgerId: string;
  side: Side;
  lineAmount: bigint;
  adjustments: BillAdjustmentInput[];
}

/** Settle bills from one voucher line. Returns the total adjusted, in paise. (Task 6 implements bills.) */
export async function applyLineAdjustments(_tx: Queryable, p: LineAdjustmentParams): Promise<bigint> {
  if (p.adjustments.length > 0) throw new Error('Bill adjustment is implemented in Task 6');
  return 0n;
}

/** Undo everything a voucher did to bills and on-account money. (Task 6 implements bills.) */
export async function removeVoucherBillLinks(tx: Queryable, voucherId: string): Promise<void> {
  await tx.query('DELETE FROM on_account WHERE voucher_id = $1', [voucherId]);
}
