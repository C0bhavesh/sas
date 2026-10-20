import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AppError, AuthError, type Actor } from '@sas/shared';
import type { Db, Queryable } from '../db/types';
import { hashPassword, verifyPassword } from './passwords';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

export async function createUser(
  q: Queryable,
  input: { username: string; password: string; isAdmin?: boolean; email?: string; canExportAudit?: boolean },
): Promise<string> {
  const username = input.username.trim();
  if (username.length < 2) throw new AppError('INVALID_INPUT', 'Username must be at least 2 characters');
  if (input.password.length < 6) throw new AppError('INVALID_INPUT', 'Password must be at least 6 characters');
  const taken = await q.query('SELECT 1 FROM users WHERE lower(username) = lower($1)', [username]);
  if (taken.length > 0) throw new AppError('INVALID_INPUT', 'That username is already taken');
  const id = randomUUID();
  await q.query(
    `INSERT INTO users(id, username, password_hash, is_admin, can_export_audit, email) VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      id,
      username,
      await hashPassword(input.password),
      input.isAdmin ?? false,
      input.canExportAudit ?? false,
      input.email ?? null,
    ],
  );
  return id;
}

export async function login(
  db: Db,
  username: string,
  password: string,
  ttlHours = 12,
): Promise<{ token: string; actor: Actor }> {
  const rows = await db.query<{
    id: string;
    username: string;
    password_hash: string;
    is_admin: boolean;
    status: string;
  }>('SELECT id, username, password_hash, is_admin, status FROM users WHERE lower(username) = lower($1)', [
    username.trim(),
  ]);
  const user = rows[0];
  if (!user) {
    await hashPassword(password); // spend the same time as a real check
    throw new AuthError('BAD_CREDENTIALS', 'Wrong username or password');
  }
  if (!(await verifyPassword(password, user.password_hash))) {
    throw new AuthError('BAD_CREDENTIALS', 'Wrong username or password');
  }
  if (user.status !== 'active') throw new AuthError('USER_BLOCKED', 'This user is blocked');
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + ttlHours * 3600_000).toISOString();
  await db.query('INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1,$2,$3)', [
    sha256(token),
    user.id,
    expires,
  ]);
  return { token, actor: { userId: user.id, username: user.username, isAdmin: user.is_admin } };
}

export async function authenticate(q: Queryable, token: string): Promise<Actor | null> {
  const rows = await q.query<{ id: string; username: string; is_admin: boolean }>(
    `SELECT u.id, u.username, u.is_admin FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND u.status = 'active'`,
    [sha256(token)],
  );
  const u = rows[0];
  return u ? { userId: u.id, username: u.username, isAdmin: u.is_admin } : null;
}

export async function logout(q: Queryable, token: string): Promise<void> {
  await q.query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
}

export async function setUserStatus(q: Queryable, userId: string, status: 'active' | 'blocked'): Promise<void> {
  await q.query('UPDATE users SET status = $2 WHERE id = $1', [userId, status]);
  if (status === 'blocked') await q.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
}

export async function listUsers(
  q: Queryable,
): Promise<{ id: string; username: string; isAdmin: boolean; status: string; email: string | null }[]> {
  const rows = await q.query<{ id: string; username: string; is_admin: boolean; status: string; email: string | null }>(
    'SELECT id, username, is_admin, status, email FROM users ORDER BY lower(username)',
  );
  return rows.map((r) => ({ id: r.id, username: r.username, isAdmin: r.is_admin, status: r.status, email: r.email }));
}
