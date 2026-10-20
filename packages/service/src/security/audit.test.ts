import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '@sas/shared';
import type { Db } from '../db/types';
import { deleteVoucher, saveVoucher, updateVoucher } from '../posting/voucherService';
import { seedCompany, type SeededCompany } from '../testing/fixtures';
import { createTestDb } from '../testing/testDb';
import { exportAudit, writeAudit } from './audit';
import { createUser } from './users';

let db: Db;
let s: SeededCompany;
let userId: string;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedCompany(db);
  userId = await createUser(db, { username: 'asha', password: 'pass1234', isAdmin: true, canExportAudit: true });
});
afterEach(async () => {
  await db.close();
});

function receipt(amount: string) {
  return {
    companyId: s.companyId,
    yearId: s.yearId,
    bookId: s.cashBookId,
    kind: 'receipt' as const,
    date: '2026-05-10',
    lines: [{ ledgerId: s.partyLedgerId, side: 'Cr' as const, amount }],
    actorId: userId,
  };
}

async function auditRows() {
  return db.query<{ action: string; entity: string; user_id: string | null; old_values: any; new_values: any }>(
    'SELECT action, entity, user_id, old_values, new_values FROM audit_log ORDER BY at, id',
  );
}

describe('append-only', () => {
  it('refuses update, delete and truncate', async () => {
    await writeAudit(db, { userId, companyId: s.companyId, entity: 'x', entityId: null, action: 'add' });
    await expect(db.query(`UPDATE audit_log SET action = 'hacked'`)).rejects.toThrow(/append-only/);
    await expect(db.query('DELETE FROM audit_log')).rejects.toThrow(/append-only/);
    await expect(db.exec('TRUNCATE audit_log')).rejects.toThrow(/append-only/);
  });
});

describe('voucher audit', () => {
  it('records an add with the new values and the user', async () => {
    await saveVoucher(db, receipt('1000.00'));
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'add', entity: 'voucher', user_id: userId, old_values: null });
    expect(rows[0]?.new_values).toMatchObject({ voucherNo: 1, date: '2026-05-10', kind: 'receipt' });
    expect(rows[0]?.new_values.lines).toEqual([{ ledgerId: s.partyLedgerId, debit: '0.00', credit: '1000.00' }]);
  });

  it('records an edit with old and new values', async () => {
    const { voucherId } = await saveVoucher(db, receipt('1000.00'));
    await updateVoucher(db, voucherId, 1, {
      date: '2026-05-11',
      lines: [{ ledgerId: s.partyLedgerId, side: 'Cr', amount: '400.00' }],
      actorId: userId,
    });
    const edit = (await auditRows()).find((r) => r.action === 'edit')!;
    expect(edit.old_values.lines[0].credit).toBe('1000.00');
    expect(edit.old_values.date).toBe('2026-05-10');
    expect(edit.new_values.lines[0].credit).toBe('400.00');
    expect(edit.new_values.date).toBe('2026-05-11');
  });

  it('records a delete with the old values', async () => {
    const { voucherId } = await saveVoucher(db, receipt('1000.00'));
    await deleteVoucher(db, voucherId, 1, userId);
    const del = (await auditRows()).find((r) => r.action === 'delete')!;
    expect(del.new_values).toBeNull();
    expect(del.old_values.lines[0].credit).toBe('1000.00');
  });

  it('a failed save leaves no audit row', async () => {
    await expect(saveVoucher(db, { ...receipt('1000.00'), date: '2030-01-01' })).rejects.toThrow();
    expect(await auditRows()).toHaveLength(0);
  });
});

describe('exportAudit', () => {
  const admin = (id: string): Actor => ({ userId: id, username: 'asha', isAdmin: true });

  it('returns rows to an admin who has the export right', async () => {
    await saveVoucher(db, receipt('1000.00'));
    const rows = await exportAudit(db, admin(userId), { companyId: s.companyId });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: 'voucher', action: 'add', username: 'asha' });
  });

  it('filters by entity', async () => {
    await saveVoucher(db, receipt('1000.00'));
    expect(await exportAudit(db, admin(userId), { companyId: s.companyId, entity: 'ledger' })).toHaveLength(0);
  });

  it('refuses an admin without the export right and refuses non-admins', async () => {
    const noExport = await createUser(db, { username: 'bob', password: 'pass1234', isAdmin: true });
    await expect(exportAudit(db, admin(noExport), { companyId: s.companyId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    const clerk = await createUser(db, { username: 'clerk', password: 'pass1234', canExportAudit: true });
    await expect(
      exportAudit(db, { userId: clerk, username: 'clerk', isAdmin: false }, { companyId: s.companyId }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
