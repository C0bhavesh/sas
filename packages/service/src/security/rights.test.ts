import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MODULES, NO_RIGHTS, type Actor } from '@sas/shared';
import type { Db } from '../db/types';
import { createCompany } from '../masters/companies';
import { createLedger } from '../masters/ledgers';
import { seedCompany, type SeededCompany } from '../testing/fixtures';
import { createTestDb } from '../testing/testDb';
import {
  assertCompanyVisible,
  assertLedgersVisible,
  assertRight,
  getRights,
  hiddenGroupIds,
  setBlockedGroups,
  setHiddenCompanies,
  setRights,
  visibleCompanies,
} from './rights';
import { createUser } from './users';

let db: Db;
let s: SeededCompany;
let admin: Actor;
let clerk: Actor;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedCompany(db);
  admin = { userId: await createUser(db, { username: 'boss', password: 'pass1234', isAdmin: true }), username: 'boss', isAdmin: true };
  clerk = { userId: await createUser(db, { username: 'clerk', password: 'pass1234' }), username: 'clerk', isAdmin: false };
});
afterEach(async () => {
  await db.close();
});

async function groupId(code: number): Promise<string> {
  const r = await db.query<{ id: string }>('SELECT id FROM account_groups WHERE company_id = $1 AND code = $2', [
    s.companyId,
    code,
  ]);
  return r[0]!.id;
}

describe('assertRight', () => {
  it('lets an admin do anything', async () => {
    await expect(assertRight(db, admin, 'users', 'delete')).resolves.toBeUndefined();
  });

  it('refuses a user who has no rights row', async () => {
    await expect(assertRight(db, clerk, 'cash_book', 'add')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('allows exactly the granted actions', async () => {
    await setRights(db, clerk.userId, 'cash_book', { ...NO_RIGHTS, add: true, find: true });
    await expect(assertRight(db, clerk, 'cash_book', 'add')).resolves.toBeUndefined();
    await expect(assertRight(db, clerk, 'cash_book', 'find')).resolves.toBeUndefined();
    await expect(assertRight(db, clerk, 'cash_book', 'edit')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(assertRight(db, clerk, 'journal', 'add')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('getRights / setRights', () => {
  it('returns no rights for every module by default', async () => {
    const r = await getRights(db, clerk.userId);
    expect(Object.keys(r).sort()).toEqual([...MODULES].sort());
    expect(r.reports).toEqual(NO_RIGHTS);
  });

  it('setting rights twice replaces the earlier values', async () => {
    await setRights(db, clerk.userId, 'reports', { ...NO_RIGHTS, find: true, print: true });
    await setRights(db, clerk.userId, 'reports', { ...NO_RIGHTS, find: true });
    expect((await getRights(db, clerk.userId)).reports).toEqual({ ...NO_RIGHTS, find: true });
  });

  it('rejects an unknown module', async () => {
    await expect(setRights(db, clerk.userId, 'nope' as never, NO_RIGHTS)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });
});

describe('blocked groups', () => {
  it('hides the group and its sub-groups; admins see everything', async () => {
    await setBlockedGroups(db, clerk.userId, [await groupId(35)]);
    const hidden = await hiddenGroupIds(db, clerk, s.companyId);
    expect(hidden).toContain(await groupId(35));
    expect(hidden).toContain(await groupId(34)); // Creditors for Others sits under Sundry Creditors
    expect(hidden).not.toContain(await groupId(42));
    expect(await hiddenGroupIds(db, admin, s.companyId)).toEqual([]);
  });

  it('setBlockedGroups replaces the previous list', async () => {
    await setBlockedGroups(db, clerk.userId, [await groupId(35)]);
    await setBlockedGroups(db, clerk.userId, [await groupId(42)]);
    const hidden = await hiddenGroupIds(db, clerk, s.companyId);
    expect(hidden).toEqual([await groupId(42)]);
  });

  it('assertLedgersVisible refuses ledgers in a blocked group', async () => {
    await setBlockedGroups(db, clerk.userId, [await groupId(42)]);
    await expect(assertLedgersVisible(db, clerk, s.companyId, [s.partyLedgerId])).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(assertLedgersVisible(db, clerk, s.companyId, [s.cashLedgerId])).resolves.toBeUndefined();
    await expect(assertLedgersVisible(db, admin, s.companyId, [s.partyLedgerId])).resolves.toBeUndefined();
  });
});

describe('hidden companies', () => {
  it('hides a company from one user only', async () => {
    const other = await createCompany(db, {
      code: 'C2',
      name: 'Other Co',
      fyLabel: '2026-27',
      fyStart: '2026-04-01',
      fyEnd: '2027-03-31',
    });
    await setHiddenCompanies(db, clerk.userId, [other.companyId]);
    expect((await visibleCompanies(db, clerk)).map((c) => c.code)).toEqual(['C1']);
    expect((await visibleCompanies(db, admin)).map((c) => c.code).sort()).toEqual(['C1', 'C2']);
    await expect(assertCompanyVisible(db, clerk, other.companyId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(assertCompanyVisible(db, clerk, s.companyId)).resolves.toBeUndefined();
    await expect(assertCompanyVisible(db, admin, other.companyId)).resolves.toBeUndefined();
  });
});

describe('uses createLedger so the fixtures are real', () => {
  it('a ledger can be created in a blocked group (blocking restricts users, not data)', async () => {
    await setBlockedGroups(db, clerk.userId, [await groupId(42)]);
    const id = await createLedger(db, { companyId: s.companyId, groupCode: 42, name: 'New Party' });
    expect(id).toBeTruthy();
  });
});
