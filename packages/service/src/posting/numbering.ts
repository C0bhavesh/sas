import type { Queryable } from '../db/types';

/**
 * Next voucher number for a book and year. Must be called inside the save transaction:
 * the upsert takes a row lock, so two operators saving at once get different numbers,
 * and a rolled-back save gives its number back.
 */
export async function nextNumber(tx: Queryable, companyId: string, yearId: string, bookId: string): Promise<number> {
  const rows = await tx.query<{ last_no: number }>(
    `INSERT INTO counters(company_id, year_id, book_id, last_no) VALUES ($1,$2,$3,1)
     ON CONFLICT (company_id, year_id, book_id) DO UPDATE SET last_no = counters.last_no + 1
     RETURNING last_no`,
    [companyId, yearId, bookId],
  );
  return rows[0]!.last_no;
}
