import { describe, expect, it } from 'vitest';
import { VoucherError } from './errors';
import { buildEntries } from './voucher';

const CASH = 'cash-ledger';
const A = 'party-a';
const B = 'party-b';

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as VoucherError).code;
  }
  return undefined;
}

describe('buildEntries — receipt', () => {
  it('credits each party and debits the cash/bank ledger with the total', () => {
    const entries = buildEntries('receipt', CASH, [
      { ledgerId: A, side: 'Cr', amount: '1000.00' },
      { ledgerId: B, side: 'Cr', amount: '250.50' },
    ]);
    expect(entries).toEqual([
      { ledgerId: A, debit: 0n, credit: 100000n },
      { ledgerId: B, debit: 0n, credit: 25050n },
      { ledgerId: CASH, debit: 125050n, credit: 0n },
    ]);
  });
  it('rejects a debit line in a receipt', () => {
    expect(code(() => buildEntries('receipt', CASH, [{ ledgerId: A, side: 'Dr', amount: '10' }]))).toBe('WRONG_SIDE');
  });
  it('needs the book ledger', () => {
    expect(code(() => buildEntries('receipt', null, [{ ledgerId: A, side: 'Cr', amount: '10' }]))).toBe(
      'BOOK_LEDGER_REQUIRED',
    );
  });
});

describe('buildEntries — payment', () => {
  it('debits the party and credits the cash/bank ledger', () => {
    const entries = buildEntries('payment', CASH, [{ ledgerId: A, side: 'Dr', amount: '300' }]);
    expect(entries).toEqual([
      { ledgerId: A, debit: 30000n, credit: 0n },
      { ledgerId: CASH, debit: 0n, credit: 30000n },
    ]);
  });
});

describe('buildEntries — journal', () => {
  it('accepts a balanced journal as entered', () => {
    const entries = buildEntries('journal', null, [
      { ledgerId: A, side: 'Dr', amount: '100.00' },
      { ledgerId: B, side: 'Cr', amount: '60.00' },
      { ledgerId: CASH, side: 'Cr', amount: '40.00' },
    ]);
    expect(entries).toHaveLength(3);
    expect(entries.reduce((s, e) => s + e.debit, 0n)).toBe(entries.reduce((s, e) => s + e.credit, 0n));
  });
  it('rejects an unbalanced journal', () => {
    expect(
      code(() =>
        buildEntries('journal', null, [
          { ledgerId: A, side: 'Dr', amount: '100.00' },
          { ledgerId: B, side: 'Cr', amount: '99.99' },
        ]),
      ),
    ).toBe('NOT_BALANCED');
  });
  it('rejects a one-line journal', () => {
    expect(code(() => buildEntries('journal', null, [{ ledgerId: A, side: 'Dr', amount: '1' }]))).toBe(
      'TOO_FEW_LINES',
    );
  });
});

describe('buildEntries — common checks', () => {
  it('rejects no lines', () => {
    expect(code(() => buildEntries('journal', null, []))).toBe('EMPTY_LINES');
  });
  it('rejects zero, negative and malformed amounts', () => {
    for (const amount of ['0', '0.00', '-5', 'abc', '1.234']) {
      expect(code(() => buildEntries('payment', CASH, [{ ledgerId: A, side: 'Dr', amount }]))).toBe('BAD_AMOUNT');
    }
  });
});
