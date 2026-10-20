import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/types';
import { createTestDb } from '../testing/testDb';
import { hashPassword, verifyPassword } from './passwords';
import { authenticate, createUser, listUsers, login, logout, setUserStatus } from './users';

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});
afterEach(async () => {
  await db.close();
});

describe('passwords', () => {
  it('hashes with a random salt and verifies', async () => {
    const h1 = await hashPassword('secret1');
    const h2 = await hashPassword('secret1');
    expect(h1).not.toBe(h2);
    expect(h1.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('secret1', h1)).toBe(true);
    expect(await verifyPassword('wrong', h1)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });
});

describe('createUser', () => {
  it('stores a hash, never the password', async () => {
    const id = await createUser(db, { username: 'asha', password: 'pass1234' });
    const rows = await db.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [id]);
    expect(rows[0]?.password_hash).not.toContain('pass1234');
    expect(rows[0]?.password_hash.startsWith('scrypt$')).toBe(true);
  });

  it('rejects a short password', async () => {
    await expect(createUser(db, { username: 'asha', password: '123' })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('rejects a duplicate username, ignoring case', async () => {
    await createUser(db, { username: 'Asha', password: 'pass1234' });
    await expect(createUser(db, { username: 'ASHA', password: 'pass1234' })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });
});

describe('login / authenticate / logout', () => {
  it('logs in and the token identifies the user', async () => {
    const id = await createUser(db, { username: 'asha', password: 'pass1234', isAdmin: true });
    const { token, actor } = await login(db, 'ASHA', 'pass1234');
    expect(actor).toEqual({ userId: id, username: 'asha', isAdmin: true });
    expect(await authenticate(db, token)).toEqual(actor);
  });

  it('gives the same error for a wrong password and an unknown user', async () => {
    await createUser(db, { username: 'asha', password: 'pass1234' });
    await expect(login(db, 'asha', 'nope')).rejects.toMatchObject({ code: 'BAD_CREDENTIALS' });
    await expect(login(db, 'ghost', 'pass1234')).rejects.toMatchObject({ code: 'BAD_CREDENTIALS' });
  });

  it('refuses a blocked user and rejects their existing token', async () => {
    const id = await createUser(db, { username: 'asha', password: 'pass1234' });
    const { token } = await login(db, 'asha', 'pass1234');
    await setUserStatus(db, id, 'blocked');
    await expect(login(db, 'asha', 'pass1234')).rejects.toMatchObject({ code: 'USER_BLOCKED' });
    expect(await authenticate(db, token)).toBeNull();
  });

  it('an expired token no longer authenticates; an unknown token does not either', async () => {
    await createUser(db, { username: 'asha', password: 'pass1234' });
    const { token } = await login(db, 'asha', 'pass1234', -1);
    expect(await authenticate(db, token)).toBeNull();
    expect(await authenticate(db, 'not-a-token')).toBeNull();
  });

  it('logout invalidates the token', async () => {
    await createUser(db, { username: 'asha', password: 'pass1234' });
    const { token } = await login(db, 'asha', 'pass1234');
    await logout(db, token);
    expect(await authenticate(db, token)).toBeNull();
  });
});

describe('listUsers', () => {
  it('lists users without password data', async () => {
    await createUser(db, { username: 'asha', password: 'pass1234', email: 'a@x.in' });
    const users = await listUsers(db);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ username: 'asha', isAdmin: false, status: 'active', email: 'a@x.in' });
    expect(JSON.stringify(users)).not.toContain('scrypt');
  });
});
