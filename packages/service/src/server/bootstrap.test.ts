import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/types';
import { login } from '../security/users';
import { createTestDb } from '../testing/testDb';
import { bootstrapAdmin } from './bootstrap';

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});
afterEach(async () => {
  await db.close();
});

describe('bootstrapAdmin', () => {
  it('creates the first administrator, who can log in and export the audit log', async () => {
    expect(await bootstrapAdmin(db, 'admin', 'first-pass')).toBe(true);
    const { actor } = await login(db, 'admin', 'first-pass');
    expect(actor.isAdmin).toBe(true);
    const row = await db.query<{ can_export_audit: boolean }>('SELECT can_export_audit FROM users WHERE id = $1', [actor.userId]);
    expect(row[0]?.can_export_audit).toBe(true);
  });

  it('does nothing when a user already exists', async () => {
    await bootstrapAdmin(db, 'admin', 'first-pass');
    expect(await bootstrapAdmin(db, 'other', 'another-pass')).toBe(false);
    expect((await db.query('SELECT 1 FROM users')).length).toBe(1);
  });
});
