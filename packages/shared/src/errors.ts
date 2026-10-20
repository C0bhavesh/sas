export type VoucherErrorCode =
  // pure rules (shared)
  | 'EMPTY_LINES'
  | 'TOO_FEW_LINES'
  | 'BAD_AMOUNT'
  | 'WRONG_SIDE'
  | 'NOT_BALANCED'
  | 'BOOK_LEDGER_REQUIRED'
  // service rules
  | 'BAD_DATE'
  | 'YEAR_NOT_FOUND'
  | 'YEAR_LOCKED'
  | 'DATE_OUT_OF_YEAR'
  | 'PERIOD_FROZEN'
  | 'BOOK_NOT_FOUND'
  | 'BOOK_KIND_MISMATCH'
  | 'LEDGER_INVALID'
  | 'VOUCHER_NOT_FOUND'
  | 'STALE_VERSION'
  | 'ADJUSTMENT_INVALID'
  | 'ADJUSTMENT_EXCEEDS_LINE'
  | 'ON_ACCOUNT_USED';

export class VoucherError extends Error {
  constructor(
    public readonly code: VoucherErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'VoucherError';
  }
}
