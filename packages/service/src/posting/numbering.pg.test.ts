import { describe, expect, it } from 'vitest';
import { migrate } from '../db/migrate';
import { createPgDb } from '../db/pg';
import { seedCompany } from '../testing/fixtures';
import { saveVoucher } from './voucherService';

// Runs only when TEST_DATABASE_URL points at an EMPTY PostgreSQL database whose name contains "test".
// WARNING: this test drops everything in that database's public schema.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('voucher numbering under real concurrency (PostgreSQL)', () => {
  it('gives 20 simultaneous saves 20 distinct consecutive numbers', async () => {
    const name = new URL(url!).pathname;
    if (!/test/i.test(name)) throw new Error('TEST_DATABASE_URL must name a database containing "test"');
    const db = createPgDb(url!);
    try {
      await db.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      await migrate(db);
      const s = await seedCompany(db);
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          saveVoucher(db, {
            companyId: s.companyId,
            yearId: s.yearId,
            bookId: s.cashBookId,
            kind: 'receipt',
            date: '2026-05-10',
            lines: [{ ledgerId: s.partyLedgerId, side: 'Cr', amount: `${i + 1}.00` }],
            actorId: null,
          }),
        ),
      );
      const numbers = results.map((r) => r.voucherNo).sort((a, b) => a - b);
      expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    } finally {
      await db.close();
    }
  });
});
