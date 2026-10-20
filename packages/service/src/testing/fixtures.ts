import type { Db } from '../db/types';
import { createBook } from '../masters/books';
import { createCompany } from '../masters/companies';
import { createLedger } from '../masters/ledgers';

export interface SeededCompany {
  companyId: string;
  yearId: string;
  cashLedgerId: string;
  partyLedgerId: string;
  discountLedgerId: string;
  cashBookId: string;
  journalBookId: string;
}

/** One company, year 2026-27, a cash ledger/book, a party, a discount ledger and a journal book. */
export async function seedCompany(db: Db): Promise<SeededCompany> {
  const { companyId, yearId } = await createCompany(db, {
    code: 'C1',
    name: 'Test Textiles',
    fyLabel: '2026-27',
    fyStart: '2026-04-01',
    fyEnd: '2027-03-31',
  });
  const cashLedgerId = await createLedger(db, { companyId, groupCode: 16, name: 'Cash' });
  const partyLedgerId = await createLedger(db, { companyId, groupCode: 42, name: 'Ramesh Traders' });
  const discountLedgerId = await createLedger(db, { companyId, groupCode: 32, name: 'Discount' });
  const cashBookId = await createBook(db, {
    companyId,
    code: 'CB',
    name: 'Cash Book',
    type: 'cash',
    defaultLedgerId: cashLedgerId,
  });
  const journalBookId = await createBook(db, { companyId, code: 'JV', name: 'Journal', type: 'journal' });
  return { companyId, yearId, cashLedgerId, partyLedgerId, discountLedgerId, cashBookId, journalBookId };
}
