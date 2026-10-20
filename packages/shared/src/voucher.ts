import { VoucherError } from './errors';
import { fromPaise, sumPaise, toPaise, type Paise } from './money';

export type VoucherKind = 'receipt' | 'payment' | 'journal';
export type Side = 'Dr' | 'Cr';

export const ADJUSTMENT_KINDS = ['cash', 'discount', 'rd', 'rg', 'claim', 'bc', 'interest', 'close'] as const;
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number];

export interface BillAdjustmentInput {
  billId: string;
  amount: string;
  kind: AdjustmentKind;
}

export interface VoucherLineInput {
  ledgerId: string;
  side: Side;
  amount: string;
  narration?: string;
  adjustments?: BillAdjustmentInput[];
}

export interface LedgerEntry {
  ledgerId: string;
  debit: Paise;
  credit: Paise;
}

interface ParsedLine {
  ledgerId: string;
  side: Side;
  amt: Paise;
}

function parseLine(l: VoucherLineInput): ParsedLine {
  let amt: Paise;
  try {
    amt = toPaise(l.amount);
  } catch {
    throw new VoucherError('BAD_AMOUNT', `Invalid amount "${l.amount}"`);
  }
  if (amt <= 0n) throw new VoucherError('BAD_AMOUNT', 'Amount must be greater than zero');
  return { ledgerId: l.ledgerId, side: l.side, amt };
}

function toEntry(p: ParsedLine): LedgerEntry {
  return p.side === 'Dr'
    ? { ledgerId: p.ledgerId, debit: p.amt, credit: 0n }
    : { ledgerId: p.ledgerId, debit: 0n, credit: p.amt };
}

/**
 * Turn what the operator typed into the full double-entry postings.
 * Receipt: party lines are credits, contra debit on the cash/bank ledger.
 * Payment: party lines are debits, contra credit on the cash/bank ledger.
 * Journal: lines as typed, debits must equal credits.
 */
export function buildEntries(
  kind: VoucherKind,
  bookLedgerId: string | null,
  lines: VoucherLineInput[],
): LedgerEntry[] {
  if (lines.length === 0) throw new VoucherError('EMPTY_LINES', 'A voucher needs at least one line');
  const parsed = lines.map(parseLine);

  if (kind === 'journal') {
    if (parsed.length < 2) throw new VoucherError('TOO_FEW_LINES', 'A journal needs at least two lines');
    const dr = sumPaise(parsed.filter((p) => p.side === 'Dr').map((p) => p.amt));
    const cr = sumPaise(parsed.filter((p) => p.side === 'Cr').map((p) => p.amt));
    if (dr !== cr) {
      throw new VoucherError('NOT_BALANCED', `Debits ${fromPaise(dr)} and credits ${fromPaise(cr)} differ`);
    }
    return parsed.map(toEntry);
  }

  if (!bookLedgerId) throw new VoucherError('BOOK_LEDGER_REQUIRED', 'This book has no cash/bank ledger');
  const partySide: Side = kind === 'receipt' ? 'Cr' : 'Dr';
  if (parsed.some((p) => p.side !== partySide)) {
    throw new VoucherError('WRONG_SIDE', `A ${kind} can only have ${partySide} party lines`);
  }
  const total = sumPaise(parsed.map((p) => p.amt));
  const contra: LedgerEntry =
    kind === 'receipt'
      ? { ledgerId: bookLedgerId, debit: total, credit: 0n }
      : { ledgerId: bookLedgerId, debit: 0n, credit: total };
  return [...parsed.map(toEntry), contra];
}
