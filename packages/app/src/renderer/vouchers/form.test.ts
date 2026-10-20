import { describe, expect, it } from 'vitest';
import type { PendingBill, VoucherView } from '../api/types';
import {
  activeLines,
  adjustedTotal,
  allocateOldestFirst,
  emptyForm,
  formFromVoucher,
  isBlank,
  newLine,
  onAccountOf,
  suggestNextLine,
  toSavePayload,
  toUpdatePayload,
  totals,
  validateForm,
  type VoucherForm,
} from './form';

const base = { bookId: 'b-cash', date: '2026-05-10' };

function filled(kind: 'receipt' | 'payment' | 'journal', lines: Partial<VoucherForm['lines'][number]>[]): VoucherForm {
  const f = emptyForm(kind, base);
  return { ...f, lines: lines.map((l) => ({ ...newLine(kind), ...l })) };
}

describe('emptyForm / newLine', () => {
  it('a receipt starts with one credit line, a payment with one debit line', () => {
    expect(emptyForm('receipt', base).lines.map((l) => l.side)).toEqual(['Cr']);
    expect(emptyForm('payment', base).lines.map((l) => l.side)).toEqual(['Dr']);
  });
  it('a journal starts with a debit line and a credit line', () => {
    expect(emptyForm('journal', base).lines.map((l) => l.side)).toEqual(['Dr', 'Cr']);
  });
  it('every line gets its own key', () => {
    const keys = emptyForm('journal', base).lines.map((l) => l.key);
    expect(new Set(keys).size).toBe(2);
  });
  it('keeps the book and the date it is given', () => {
    const f = emptyForm('receipt', base);
    expect(f.bookId).toBe('b-cash');
    expect(f.date).toBe('2026-05-10');
    expect(f.editing).toBeNull();
  });
});

describe('blank lines', () => {
  it('a line with no account and no amount is blank and ignored', () => {
    const f = filled('receipt', [{ ledgerId: 'l1', amount: '10.00' }, {}]);
    expect(isBlank(f.lines[1]!)).toBe(true);
    expect(activeLines(f)).toHaveLength(1);
  });
});

describe('totals', () => {
  it('adds debits and credits exactly and shows the difference', () => {
    const f = filled('journal', [
      { ledgerId: 'a', side: 'Dr', amount: '0.10' },
      { ledgerId: 'b', side: 'Dr', amount: '0.20' },
      { ledgerId: 'c', side: 'Cr', amount: '0.25' },
    ]);
    expect(totals(f)).toEqual({ debit: '0.30', credit: '0.25', difference: '0.05', total: '0.55' });
  });
  it('ignores amounts that are not yet readable', () => {
    const f = filled('receipt', [{ ledgerId: 'a', amount: '' }, { ledgerId: 'b', amount: '.' }]);
    expect(totals(f).total).toBe('0.00');
  });
});

describe('suggestNextLine', () => {
  it('a journal suggests the side and amount that would balance it', () => {
    const f = filled('journal', [{ ledgerId: 'a', side: 'Dr', amount: '100.00' }, { ledgerId: 'b', side: 'Cr', amount: '40.00' }]);
    expect(suggestNextLine(f)).toEqual({ side: 'Cr', amount: '60.00' });
    const g = filled('journal', [{ ledgerId: 'a', side: 'Cr', amount: '100.00' }]);
    expect(suggestNextLine(g)).toEqual({ side: 'Dr', amount: '100.00' });
  });
  it('a balanced journal suggests an empty debit line', () => {
    const f = filled('journal', [{ ledgerId: 'a', side: 'Dr', amount: '5.00' }, { ledgerId: 'b', side: 'Cr', amount: '5.00' }]);
    expect(suggestNextLine(f)).toEqual({ side: 'Dr', amount: '' });
  });
  it('receipts and payments always suggest their own side with no amount', () => {
    expect(suggestNextLine(emptyForm('receipt', base))).toEqual({ side: 'Cr', amount: '' });
    expect(suggestNextLine(emptyForm('payment', base))).toEqual({ side: 'Dr', amount: '' });
  });
});

describe('validateForm', () => {
  it('asks for the book, the date and at least one line', () => {
    const f = { ...emptyForm('receipt', { bookId: null, date: null }) };
    expect(validateForm(f)).toEqual([
      'Choose the cash or bank book',
      'Enter a valid voucher date',
      'Add at least one line',
    ]);
    expect(validateForm({ ...emptyForm('journal', { bookId: null, date: base.date }) })).toContain('Choose the journal book');
  });

  it('points at the line that is missing its account or amount', () => {
    const f = filled('receipt', [{ ledgerId: null, amount: '10.00' }, { ledgerId: 'l1', amount: '' }]);
    expect(validateForm(f)).toEqual(['Line 1: choose an account', 'Line 2: enter an amount']);
  });

  it('refuses a zero amount', () => {
    expect(validateForm(filled('receipt', [{ ledgerId: 'l1', amount: '0.00' }]))).toEqual(['Line 1: enter an amount']);
  });

  it('uses the shared rules for an unbalanced journal', () => {
    const f = filled('journal', [
      { ledgerId: 'a', side: 'Dr', amount: '100.00' },
      { ledgerId: 'b', side: 'Cr', amount: '90.00' },
    ]);
    expect(validateForm(f)).toEqual(['Debits 100.00 and credits 90.00 differ']);
  });

  it('wants at least two lines in a journal', () => {
    expect(validateForm(filled('journal', [{ ledgerId: 'a', side: 'Dr', amount: '1.00' }]))).toEqual(['A journal needs at least two lines']);
  });

  it('refuses bill adjustments that add up to more than the line', () => {
    const f = filled('receipt', [
      { ledgerId: 'l1', amount: '100.00', adjustments: [{ billId: 'x', amount: '150.00', kind: 'cash' }] },
    ]);
    expect(validateForm(f)).toEqual(['Line 1: the bills adjusted (150.00) are more than the amount']);
  });

  it('accepts a good receipt and a good journal', () => {
    expect(validateForm(filled('receipt', [{ ledgerId: 'l1', amount: '10.00' }]))).toEqual([]);
    expect(
      validateForm(
        filled('journal', [
          { ledgerId: 'a', side: 'Dr', amount: '10.00' },
          { ledgerId: 'b', side: 'Cr', amount: '10.00' },
        ]),
      ),
    ).toEqual([]);
  });

  it('skips blank lines', () => {
    const f = filled('receipt', [{ ledgerId: 'l1', amount: '10.00' }, {}, {}]);
    expect(validateForm(f)).toEqual([]);
  });
});

describe('adjustments on a line', () => {
  const line = { ...newLine('receipt'), ledgerId: 'l1', amount: '1000.00', adjustments: [{ billId: 'a', amount: '300.00', kind: 'cash' as const }, { billId: 'b', amount: '200.50', kind: 'discount' as const }] };
  it('adds them up and works out what is left on account', () => {
    expect(adjustedTotal(line)).toBe('500.50');
    expect(onAccountOf(line)).toBe('499.50');
    expect(onAccountOf({ ...line, adjustments: [] })).toBe('1000.00');
  });
});

describe('toSavePayload', () => {
  it('sends only filled lines, normalised amounts, and leaves out empty optional fields', () => {
    const f = filled('receipt', [
      { ledgerId: 'l1', amount: '5', narration: '', adjustments: [] },
      { ledgerId: 'l2', amount: '7.5', narration: 'cheque 123', adjustments: [{ billId: 'b1', amount: '7.50', kind: 'cash' }] },
      {},
    ]);
    expect(toSavePayload({ ...f, narration: '' }, { companyId: 'c1', yearId: 'y1' })).toEqual({
      companyId: 'c1',
      yearId: 'y1',
      bookId: 'b-cash',
      kind: 'receipt',
      date: '2026-05-10',
      lines: [
        { ledgerId: 'l1', side: 'Cr', amount: '5.00' },
        { ledgerId: 'l2', side: 'Cr', amount: '7.50', narration: 'cheque 123', adjustments: [{ billId: 'b1', amount: '7.50', kind: 'cash' }] },
      ],
    });
  });
  it('includes the voucher narration when there is one', () => {
    const f = { ...filled('journal', [{ ledgerId: 'a', side: 'Dr', amount: '1' }, { ledgerId: 'b', side: 'Cr', amount: '1' }]), narration: 'rent' };
    expect(toSavePayload(f, { companyId: 'c1', yearId: 'y1' }).narration).toBe('rent');
  });
});

const VIEW: VoucherView = {
  id: 'v1',
  companyId: 'c1',
  yearId: 'y1',
  bookId: 'b-cash',
  kind: 'receipt',
  voucherNo: 12,
  date: '2026-05-10',
  narration: 'part payment',
  version: 3,
  lines: [
    {
      lineNo: 1,
      ledgerId: 'l1',
      ledgerName: 'Ramesh Traders',
      side: 'Cr',
      amount: '300.00',
      narration: null,
      adjustments: [{ billId: 'b1', amount: '300.00', kind: 'cash' }],
    },
  ],
};

describe('formFromVoucher / toUpdatePayload', () => {
  it('loads a saved voucher into the form and remembers its version', () => {
    const f = formFromVoucher(VIEW);
    expect(f).toMatchObject({ kind: 'receipt', bookId: 'b-cash', date: '2026-05-10', narration: 'part payment' });
    expect(f.editing).toEqual({ voucherId: 'v1', version: 3, voucherNo: 12 });
    expect(f.lines).toHaveLength(1);
    expect(f.lines[0]).toMatchObject({ ledgerId: 'l1', side: 'Cr', amount: '300.00', narration: '', adjustments: [{ billId: 'b1', amount: '300.00', kind: 'cash' }] });
  });
  it('builds an update that carries the version', () => {
    const body = toUpdatePayload(formFromVoucher(VIEW));
    expect(body).toEqual({
      version: 3,
      date: '2026-05-10',
      narration: 'part payment',
      lines: [{ ledgerId: 'l1', side: 'Cr', amount: '300.00', adjustments: [{ billId: 'b1', amount: '300.00', kind: 'cash' }] }],
    });
  });
  it('refuses to build an update for a new voucher', () => {
    expect(() => toUpdatePayload(emptyForm('receipt', base))).toThrow();
  });
});

describe('allocateOldestFirst', () => {
  const bill = (id: string, billNo: string, billDate: string, pending: string): PendingBill => ({
    id,
    billNo,
    billDate,
    dueDate: null,
    side: 'Dr',
    original: pending,
    pending,
  });
  const bills = [bill('b3', 'S-3', '2026-06-01', '300.00'), bill('b1', 'S-1', '2026-04-01', '100.00'), bill('b2', 'S-2', '2026-05-01', '200.00')];

  it('fills the oldest bills first and stops when the money runs out', () => {
    expect(allocateOldestFirst(bills, '250.00')).toEqual([
      { billId: 'b1', amount: '100.00' },
      { billId: 'b2', amount: '150.00' },
    ]);
  });
  it('never allocates more than is pending', () => {
    expect(allocateOldestFirst(bills, '10000.00').map((a) => a.amount)).toEqual(['100.00', '200.00', '300.00']);
  });
  it('allocates nothing for no money, and skips settled bills', () => {
    expect(allocateOldestFirst(bills, '0.00')).toEqual([]);
    expect(allocateOldestFirst([bill('z', 'S-9', '2026-01-01', '0.00')], '50.00')).toEqual([]);
  });
  it('breaks ties on the bill number', () => {
    const tie = [bill('b', 'S-2', '2026-04-01', '10.00'), bill('a', 'S-1', '2026-04-01', '10.00')];
    expect(allocateOldestFirst(tie, '10.00')).toEqual([{ billId: 'a', amount: '10.00' }]);
  });
});
