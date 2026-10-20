import {
  buildEntries,
  fromPaise,
  toPaise,
  VoucherError,
  type BillAdjustmentInput,
  type Side,
  type VoucherKind,
  type VoucherLineInput,
} from '@sas/shared';
import type { PendingBill, SaveVoucherBody, UpdateVoucherBody, VoucherLineBody, VoucherView } from '../api/types';
import { normalizeAmount } from '../ui/format';

export interface FormLine {
  key: string;
  ledgerId: string | null;
  side: Side;
  amount: string;
  narration: string;
  adjustments: BillAdjustmentInput[];
}

export interface VoucherForm {
  kind: VoucherKind;
  bookId: string | null;
  date: string | null;
  narration: string;
  lines: FormLine[];
  editing: { voucherId: string; version: number; voucherNo: number } | null;
}

let counter = 0;
const nextKey = () => `line-${++counter}`;

export function defaultSide(kind: VoucherKind): Side {
  return kind === 'receipt' ? 'Cr' : 'Dr';
}

export function newLine(kind: VoucherKind, side?: Side, amount = ''): FormLine {
  return { key: nextKey(), ledgerId: null, side: side ?? defaultSide(kind), amount, narration: '', adjustments: [] };
}

export function emptyForm(kind: VoucherKind, base: { bookId: string | null; date: string | null }): VoucherForm {
  return {
    kind,
    bookId: base.bookId,
    date: base.date,
    narration: '',
    lines: kind === 'journal' ? [newLine(kind, 'Dr'), newLine(kind, 'Cr')] : [newLine(kind)],
    editing: null,
  };
}

export const isBlank = (line: FormLine): boolean => !line.ledgerId && line.amount === '';
export const activeLines = (form: VoucherForm): FormLine[] => form.lines.filter((l) => !isBlank(l));

/** An amount typed so far, or 0 when it is not (yet) a readable number. */
function paise(amount: string): bigint {
  try {
    return toPaise(normalizeAmount(amount) || '0');
  } catch {
    return 0n;
  }
}

export interface Totals {
  debit: string;
  credit: string;
  difference: string;
  total: string;
}

export function totals(form: VoucherForm): Totals {
  let debit = 0n;
  let credit = 0n;
  for (const l of form.lines) {
    if (l.side === 'Dr') debit += paise(l.amount);
    else credit += paise(l.amount);
  }
  return { debit: fromPaise(debit), credit: fromPaise(credit), difference: fromPaise(debit - credit), total: fromPaise(debit + credit) };
}

export function adjustedTotal(line: FormLine): string {
  return fromPaise(line.adjustments.reduce((sum, a) => sum + paise(a.amount), 0n));
}

export function onAccountOf(line: FormLine): string {
  return fromPaise(paise(line.amount) - paise(adjustedTotal(line)));
}

/** What the next line should start with: in a journal, whatever would balance it. */
export function suggestNextLine(form: VoucherForm): { side: Side; amount: string } {
  if (form.kind !== 'journal') return { side: defaultSide(form.kind), amount: '' };
  const diff = paise(totals(form).difference);
  if (diff > 0n) return { side: 'Cr', amount: fromPaise(diff) };
  if (diff < 0n) return { side: 'Dr', amount: fromPaise(-diff) };
  return { side: 'Dr', amount: '' };
}

export function validateForm(form: VoucherForm): string[] {
  const problems: string[] = [];
  if (!form.bookId) problems.push(form.kind === 'journal' ? 'Choose the journal book' : 'Choose the cash or bank book');
  if (!form.date) problems.push('Enter a valid voucher date');

  const numbered = form.lines.map((line, i) => ({ line, n: i + 1 })).filter((x) => !isBlank(x.line));
  if (numbered.length === 0) {
    problems.push('Add at least one line');
    return problems;
  }
  for (const { line, n } of numbered) {
    if (!line.ledgerId) problems.push(`Line ${n}: choose an account`);
    if (paise(line.amount) <= 0n) problems.push(`Line ${n}: enter an amount`);
    else if (paise(adjustedTotal(line)) > paise(line.amount)) {
      problems.push(`Line ${n}: the bills adjusted (${adjustedTotal(line)}) are more than the amount`);
    }
  }
  if (problems.length > 0) return problems;

  // The same rules the server applies, for instant feedback (balanced journals, correct sides).
  try {
    const lines: VoucherLineInput[] = numbered.map(({ line }) => ({
      ledgerId: line.ledgerId!,
      side: line.side,
      amount: normalizeAmount(line.amount),
    }));
    buildEntries(form.kind, 'book', lines);
  } catch (e) {
    if (e instanceof VoucherError) problems.push(e.message);
    else throw e;
  }
  return problems;
}

function lineBodies(form: VoucherForm): VoucherLineBody[] {
  return activeLines(form).map((l) => ({
    ledgerId: l.ledgerId!,
    side: l.side,
    amount: normalizeAmount(l.amount),
    ...(l.narration.trim() ? { narration: l.narration.trim() } : {}),
    ...(l.adjustments.length > 0 ? { adjustments: l.adjustments } : {}),
  }));
}

export function toSavePayload(form: VoucherForm, ctx: { companyId: string; yearId: string }): SaveVoucherBody {
  return {
    companyId: ctx.companyId,
    yearId: ctx.yearId,
    bookId: form.bookId!,
    kind: form.kind,
    date: form.date!,
    ...(form.narration.trim() ? { narration: form.narration.trim() } : {}),
    lines: lineBodies(form),
  };
}

export function toUpdatePayload(form: VoucherForm): UpdateVoucherBody {
  if (!form.editing) throw new Error('This voucher has not been saved yet');
  return {
    version: form.editing.version,
    date: form.date!,
    ...(form.narration.trim() ? { narration: form.narration.trim() } : {}),
    lines: lineBodies(form),
  };
}

export function formFromVoucher(view: VoucherView): VoucherForm {
  return {
    kind: view.kind,
    bookId: view.bookId,
    date: view.date,
    narration: view.narration ?? '',
    lines: view.lines.map((l) => ({
      key: nextKey(),
      ledgerId: l.ledgerId,
      side: l.side,
      amount: l.amount,
      narration: l.narration ?? '',
      adjustments: l.adjustments,
    })),
    editing: { voucherId: view.id, version: view.version, voucherNo: view.voucherNo },
  };
}

/** Spread `amount` over the pending bills, oldest first, never more than a bill's pending amount. */
export function allocateOldestFirst(bills: PendingBill[], amount: string): { billId: string; amount: string }[] {
  let left = paise(amount);
  const out: { billId: string; amount: string }[] = [];
  const ordered = [...bills].sort((a, b) => a.billDate.localeCompare(b.billDate) || a.billNo.localeCompare(b.billNo));
  for (const bill of ordered) {
    if (left <= 0n) break;
    const pending = toPaise(bill.pending);
    if (pending <= 0n) continue;
    const take = left < pending ? left : pending;
    out.push({ billId: bill.id, amount: fromPaise(take) });
    left -= take;
  }
  return out;
}
