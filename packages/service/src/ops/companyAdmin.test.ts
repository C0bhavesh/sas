import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '@sas/shared';
import type { Db } from '../db/types';
import { saveVoucher } from '../posting/voucherService';
import { setRights } from '../security/rights';
import { createUser } from '../security/users';
import { seedCompany, type SeededCompany } from '../testing/fixtures';
import { createTestDb } from '../testing/testDb';
import { NO_RIGHTS } from '@sas/shared';
import { setFreezeDate } from './companyAdmin';

let db: Db;
let s: SeededCompany;
let admin: Actor;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedCompany(db);
  admin = { userId: await createUser(db, { username: 'boss', password: 'pass1234', isAdmin: true }), username: 'boss', isAdmin: true };
});
afterEach(async () => {
  await db.close();
});

const receipt = (date: string) => ({
  companyId: s.companyId,
  yearId: s.yearId,
  bookId: s.cashBookId,
  kind: 'receipt' as const,
  date,
  lines: [{ ledgerId: s.partyLedgerId, side: 'Cr' as const, amount: '10' }],
  actorId: null,
});

describe('setFreezeDate', () => {
  it('freezes the period, can lift the freeze, and audits both', async () => {
    await setFreezeDate(db, admin, s.companyId, '2026-06-30');
    await expect(saveVoucher(db, receipt('2026-06-15'))).rejects.toMatchObject({ code: 'PERIOD_FROZEN' });
    await setFreezeDate(db, admin, s.companyId, null);
    await expect(saveVoucher(db, receipt('2026-06-15'))).resolves.toBeTruthy();
    const audit = await db.query<{ old_values: any; new_values: any }>(
      `SELECT old_values, new_values FROM audit_log WHERE action = 'freeze' ORDER BY at, id`,
    );
    expect(audit).toHaveLength(2);
    expect(audit[0]?.new_values).toEqual({ freezeDate: '2026-06-30' });
    expect(audit[1]?.old_values).toEqual({ freezeDate: '2026-06-30' });
  });

  it('needs the utilities edit right', async () => {
    const clerkId = await createUser(db, { username: 'clerk', password: 'pass1234' });
    const clerk: Actor = { userId: clerkId, username: 'clerk', isAdmin: false };
    await expect(setFreezeDate(db, clerk, s.companyId, '2026-06-30')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await setRights(db, clerkId, 'utilities', { ...NO_RIGHTS, edit: true });
    await expect(setFreezeDate(db, clerk, s.companyId, '2026-06-30')).resolves.toBeUndefined();
  });

  it('rejects a malformed date and an unknown company', async () => {
    await expect(setFreezeDate(db, admin, s.companyId, '30-06-2026')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(setFreezeDate(db, admin, '00000000-0000-4000-8000-000000000000', '2026-06-30')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
