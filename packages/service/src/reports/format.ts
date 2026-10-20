import { AppError, fromPaise, toPaise, type Side } from '@sas/shared';

export interface DrCr {
  amount: string;
  side: Side;
}

/** Debit-positive signed paise to an amount with its side. Zero is shown as Dr 0.00. */
export function toDrCr(signed: bigint): DrCr {
  return signed < 0n ? { amount: fromPaise(-signed), side: 'Cr' } : { amount: fromPaise(signed), side: 'Dr' };
}

export function fromDrCr(x: DrCr): bigint {
  const p = toPaise(x.amount);
  return x.side === 'Dr' ? p : -p;
}

export function assertIsoDate(text: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new AppError('INVALID_INPUT', `Invalid date "${text}"; use YYYY-MM-DD`);
  }
}
