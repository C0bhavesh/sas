# Foundation Plan B: Security, Reports, Year-end, Backup and API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the tested accounting engine from Plan A into a secure, usable back end: users and rights, an append-only audit log, the financial reports, year-end closing with carry-forward, backup and restore, and an HTTP API that the desktop app (Plan C) will call.

**Architecture:** Everything stays in `@sas/service` on top of the `Queryable`/`Db` abstraction from Plan A, so every task is tested on in-memory PGlite and runs unchanged on PostgreSQL. Security and audit are enforced inside the service layer (not in the UI). The HTTP layer is a thin Fastify app: it authenticates a bearer token, validates the request with zod, checks rights, and calls the service functions. All reports are computed from `ledger_entries` and `ledger_openings` only.

**Tech Stack:** Node 24, TypeScript 5, vitest 2, Fastify 5, zod 3, `node:crypto` scrypt (no password library), PGlite for tests, `tsx` to run the server in development.

**Prerequisite:** Plan A merged on `main` (`docs/superpowers/plans/2026-10-20-foundation-plan-a-accounting-engine.md`). Existing signatures this plan builds on: `saveVoucher/updateVoucher/deleteVoucher(db, …)`, `createCompany(db, …)`, `createLedger(q, …)`, `setOpening(q, ledgerId, yearId, amount, side)`, `createBook(q, …)`, `listPendingBills(q, companyId, ledgerId)`, `seedCompany(db)`, `createTestDb()`.

**Design spec:** `docs/superpowers/specs/2026-10-20-accounting-foundation-design.md` (sections 4 to 7).

## Global Constraints

- All Plan A constraints still apply: TypeScript `strict`, ES modules, money only as `bigint` paise in code and `NUMERIC(18,2)` in the database, UUID keys generated in code, dates as `YYYY-MM-DD` strings, one transaction per voucher save/edit/delete, English-only messages.
- Commit after every task. Commit messages end with: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Passwords are hashed with scrypt and a random 16-byte salt; the plain password is never stored or logged.
- Session tokens are 32 random bytes (hex); only their SHA-256 hash is stored; default lifetime 12 hours.
- Rights are enforced in the service/API layer on every request. Hiding a menu item is never the only protection.
- The audit log is append-only: the database itself refuses UPDATE, DELETE and TRUNCATE on it.
- Users with `is_admin = true` bypass module rights, blocked groups and hidden companies.
- Account groups blocked for a user hide that group and all its sub-groups, in every list and report.
- Profit-and-loss ledgers (income and expense natures) never carry an opening balance forward; year-end moves their net result into the ledger named `Profit & Loss A/c` (group 22).
- Reports return money as decimal strings, never `bigint` (JSON cannot carry it).
- New runtime dependencies allowed in this plan: `fastify`, `zod`. New dev dependency: `tsx`. Nothing else.

## File Structure

```
packages/shared/src/
  errors.ts                 modify: add AuthError, AppError (+ codes)
  rights.ts                 new: MODULES, RIGHT_ACTIONS, Rights, NO_RIGHTS, Actor
  index.ts                  modify: export rights
packages/service/src/
  db/migrations/002_security.sql   users, sessions, rights, blocked groups, hidden companies
  db/migrations/003_audit.sql      audit_log + append-only triggers
  security/passwords.ts            hashPassword, verifyPassword
  security/users.ts                createUser, login, authenticate, logout, setUserStatus, listUsers
  security/rights.ts               setRights, getRights, assertRight, blocked groups, hidden companies, visibility asserts
  security/audit.ts                writeAudit, exportAudit
  posting/voucherService.ts        modify: write audit rows in the same transaction
  posting/voucherQueries.ts        getVoucher, listVouchers
  reports/format.ts                DrCr, toDrCr, fromDrCr, assertIsoDate
  reports/balances.ts              ledgerBalances (shared by the financial reports and year-end)
  reports/ledgerReport.ts          ledgerReport, cashBookDaily
  reports/financial.ts             trialBalance, profitAndLoss, balanceSheet
  reports/ageing.ts                outstandingAgeing
  ops/companyAdmin.ts              setFreezeDate
  ops/yearEnd.ts                   closeYear, reopenYear, lockYear
  ops/backup.ts                    backupDatabase, pruneBackups, restoreDatabase, execRunner
  masters/queries.ts               listYears, listGroups, listLedgers, listBooks
  api/app.ts                       buildApp (auth hook, error mapping)
  api/schemas.ts                   zod schemas shared by routes
  api/routes/auth.ts  vouchers.ts  masters.ts  reports.ts  admin.ts
  server/bootstrap.ts              bootstrapAdmin
  server/main.ts                   process entry point
  testing/apiFixtures.ts           setupApi() helper for API tests
  (tests next to each file: *.test.ts)
```

---

### Task 1: Users, passwords and sessions

**Files:**
- Modify: `packages/shared/src/errors.ts`, `packages/shared/src/index.ts`
- Create: `packages/shared/src/rights.ts`
- Create: `packages/service/src/db/migrations/002_security.sql`
- Create: `packages/service/src/security/passwords.ts`, `packages/service/src/security/users.ts`
- Modify: `packages/service/src/db/migrate.test.ts`
- Test: `packages/service/src/security/users.test.ts`

**Interfaces:**
- Consumes: `Db`, `Queryable` (Plan A).
- Produces (`@sas/shared`): `class AuthError(code, message)` with `AuthErrorCode = 'BAD_CREDENTIALS' | 'USER_BLOCKED' | 'NOT_AUTHENTICATED' | 'FORBIDDEN'`; `class AppError(code, message)` with `AppErrorCode = 'NOT_FOUND' | 'INVALID_INPUT' | 'YEAR_BAD_STATE' | 'BACKUP_FAILED' | 'NOT_CONFIGURED'`; `MODULES` (`'company' | 'account_master' | 'group_master' | 'book_master' | 'cash_book' | 'journal' | 'reports' | 'users' | 'utilities'`), `type ModuleName`, `RIGHT_ACTIONS` (`'add' | 'edit' | 'delete' | 'print' | 'find' | 'show'`), `type RightAction`, `type Rights = Record<RightAction, boolean>`, `NO_RIGHTS: Rights`, `interface Actor { userId: string; username: string; isAdmin: boolean }`.
- Produces (`@sas/service`):
  - `hashPassword(password: string): Promise<string>`; `verifyPassword(password: string, stored: string): Promise<boolean>`
  - `createUser(q: Queryable, input: { username: string; password: string; isAdmin?: boolean; email?: string; canExportAudit?: boolean }): Promise<string>`
  - `login(db: Db, username: string, password: string, ttlHours?: number): Promise<{ token: string; actor: Actor }>`
  - `authenticate(q: Queryable, token: string): Promise<Actor | null>`
  - `logout(q: Queryable, token: string): Promise<void>`
  - `setUserStatus(q: Queryable, userId: string, status: 'active' | 'blocked'): Promise<void>`
  - `listUsers(q: Queryable): Promise<{ id: string; username: string; isAdmin: boolean; status: string; email: string | null }[]>`

- [ ] **Step 1: Add the shared types**

Append to `packages/shared/src/errors.ts`:
```ts
export type AuthErrorCode = 'BAD_CREDENTIALS' | 'USER_BLOCKED' | 'NOT_AUTHENTICATED' | 'FORBIDDEN';

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export type AppErrorCode = 'NOT_FOUND' | 'INVALID_INPUT' | 'YEAR_BAD_STATE' | 'BACKUP_FAILED' | 'NOT_CONFIGURED';

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
```

`packages/shared/src/rights.ts`:
```ts
export const MODULES = [
  'company',
  'account_master',
  'group_master',
  'book_master',
  'cash_book',
  'journal',
  'reports',
  'users',
  'utilities',
] as const;
export type ModuleName = (typeof MODULES)[number];

export const RIGHT_ACTIONS = ['add', 'edit', 'delete', 'print', 'find', 'show'] as const;
export type RightAction = (typeof RIGHT_ACTIONS)[number];

export type Rights = Record<RightAction, boolean>;

export const NO_RIGHTS: Rights = { add: false, edit: false, delete: false, print: false, find: false, show: false };

/** The signed-in user, as the service layer sees them. */
export interface Actor {
  userId: string;
  username: string;
  isAdmin: boolean;
}
```

`packages/shared/src/index.ts`:
```ts
export * from './money';
export * from './errors';
export * from './voucher';
export * from './rights';
```

- [ ] **Step 2: Fix the migration-count assertion in the existing test**

`packages/service/src/db/migrate.test.ts` currently asserts exactly one applied migration, which stops being true once this plan adds more. Replace the `is safe to run twice` test with:
```ts
  it('is safe to run twice', async () => {
    const before = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM schema_migrations');
    await migrate(db);
    const after = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM schema_migrations');
    expect(before[0]?.n).toBeGreaterThanOrEqual(1);
    expect(after[0]?.n).toBe(before[0]?.n);
  });
```

- [ ] **Step 3: Write the failing test**

`packages/service/src/security/users.test.ts`:
```ts
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
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run packages/service/src/security/users.test.ts`
Expected: FAIL — cannot find module `./passwords`.

- [ ] **Step 5: Write the migration and the implementation**

`packages/service/src/db/migrations/002_security.sql`:
```sql
CREATE TABLE users (
  id uuid PRIMARY KEY,
  username text NOT NULL,
  password_hash text NOT NULL,
  is_admin boolean NOT NULL DEFAULT false,
  can_export_audit boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_username ON users (lower(username));

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE user_rights (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  module text NOT NULL,
  can_add boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  can_print boolean NOT NULL DEFAULT false,
  can_find boolean NOT NULL DEFAULT false,
  show_menu boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, module)
);

CREATE TABLE user_blocked_groups (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  group_id uuid NOT NULL REFERENCES account_groups(id),
  UNIQUE (user_id, group_id)
);

CREATE TABLE user_hidden_companies (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  company_id uuid NOT NULL REFERENCES companies(id),
  UNIQUE (user_id, company_id)
);
```

`packages/service/src/security/passwords.ts`:
```ts
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEY_LEN = 64;

/** Returns "scrypt$<salt hex>$<key hex>". */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LEN);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, saltHex, keyHex] = stored.split('$');
  if (alg !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
```

`packages/service/src/security/users.ts`:
```ts
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
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run packages/service/src/security packages/service/src/db`
Expected: PASS — user tests and the updated migrate tests.

- [ ] **Step 7: Commit**

```bash
git add packages/shared packages/service
git commit -m "feat(security): users, scrypt passwords and sessions" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Rights, blocked groups and hidden companies

**Files:**
- Create: `packages/service/src/security/rights.ts`
- Test: `packages/service/src/security/rights.test.ts`

**Interfaces:**
- Consumes: `Actor`, `ModuleName`, `MODULES`, `NO_RIGHTS`, `Rights`, `RightAction`, `AuthError`, `AppError` (Task 1); `createUser` (Task 1); `seedCompany`, `createCompany`, `createLedger` (Plan A).
- Produces:
  - `setRights(q: Queryable, userId: string, module: ModuleName, rights: Rights): Promise<void>`
  - `getRights(q: Queryable, userId: string): Promise<Record<ModuleName, Rights>>`
  - `assertRight(q: Queryable, actor: Actor, module: ModuleName, action: RightAction): Promise<void>` (throws `AuthError('FORBIDDEN')`)
  - `setBlockedGroups(db: Db, userId: string, groupIds: string[]): Promise<void>`
  - `hiddenGroupIds(q: Queryable, actor: Actor, companyId: string): Promise<string[]>` (blocked groups plus all sub-groups; `[]` for admins)
  - `assertLedgersVisible(q: Queryable, actor: Actor, companyId: string, ledgerIds: string[]): Promise<void>`
  - `setHiddenCompanies(db: Db, userId: string, companyIds: string[]): Promise<void>`
  - `visibleCompanies(q: Queryable, actor: Actor): Promise<{ id: string; code: string; name: string }[]>`
  - `assertCompanyVisible(q: Queryable, actor: Actor, companyId: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

`packages/service/src/security/rights.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/service/src/security/rights.test.ts`
Expected: FAIL — cannot find module `./rights`.

- [ ] **Step 3: Write the implementation**

`packages/service/src/security/rights.ts`:
```ts
import { randomUUID } from 'node:crypto';
import {
  AppError,
  AuthError,
  MODULES,
  NO_RIGHTS,
  type Actor,
  type ModuleName,
  type RightAction,
  type Rights,
} from '@sas/shared';
import type { Db, Queryable } from '../db/types';

const COLUMN: Record<RightAction, string> = {
  add: 'can_add',
  edit: 'can_edit',
  delete: 'can_delete',
  print: 'can_print',
  find: 'can_find',
  show: 'show_menu',
};

export async function setRights(q: Queryable, userId: string, module: ModuleName, rights: Rights): Promise<void> {
  if (!(MODULES as readonly string[]).includes(module)) {
    throw new AppError('INVALID_INPUT', `Unknown module "${module}"`);
  }
  await q.query(
    `INSERT INTO user_rights(id, user_id, module, can_add, can_edit, can_delete, can_print, can_find, show_menu)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (user_id, module) DO UPDATE SET
       can_add = EXCLUDED.can_add, can_edit = EXCLUDED.can_edit, can_delete = EXCLUDED.can_delete,
       can_print = EXCLUDED.can_print, can_find = EXCLUDED.can_find, show_menu = EXCLUDED.show_menu`,
    [randomUUID(), userId, module, rights.add, rights.edit, rights.delete, rights.print, rights.find, rights.show],
  );
}

export async function getRights(q: Queryable, userId: string): Promise<Record<ModuleName, Rights>> {
  const out = Object.fromEntries(MODULES.map((m) => [m, { ...NO_RIGHTS }])) as Record<ModuleName, Rights>;
  const rows = await q.query<{
    module: string;
    can_add: boolean;
    can_edit: boolean;
    can_delete: boolean;
    can_print: boolean;
    can_find: boolean;
    show_menu: boolean;
  }>('SELECT * FROM user_rights WHERE user_id = $1', [userId]);
  for (const r of rows) {
    if (!(MODULES as readonly string[]).includes(r.module)) continue;
    out[r.module as ModuleName] = {
      add: r.can_add,
      edit: r.can_edit,
      delete: r.can_delete,
      print: r.can_print,
      find: r.can_find,
      show: r.show_menu,
    };
  }
  return out;
}

export async function assertRight(
  q: Queryable,
  actor: Actor,
  module: ModuleName,
  action: RightAction,
): Promise<void> {
  if (actor.isAdmin) return;
  const rows = await q.query<{ allowed: boolean }>(
    `SELECT ${COLUMN[action]} AS allowed FROM user_rights WHERE user_id = $1 AND module = $2`,
    [actor.userId, module],
  );
  if (!rows[0]?.allowed) {
    throw new AuthError('FORBIDDEN', `You do not have ${action} rights on ${module.replace('_', ' ')}`);
  }
}

export async function setBlockedGroups(db: Db, userId: string, groupIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query('DELETE FROM user_blocked_groups WHERE user_id = $1', [userId]);
    for (const groupId of groupIds) {
      await tx.query('INSERT INTO user_blocked_groups(id, user_id, group_id) VALUES ($1,$2,$3)', [
        randomUUID(),
        userId,
        groupId,
      ]);
    }
  });
}

/** Blocked groups of this company plus all their sub-groups. Empty for admins. */
export async function hiddenGroupIds(q: Queryable, actor: Actor, companyId: string): Promise<string[]> {
  if (actor.isAdmin) return [];
  const rows = await q.query<{ id: string }>(
    `WITH RECURSIVE g AS (
       SELECT ag.id FROM account_groups ag
       JOIN user_blocked_groups b ON b.group_id = ag.id
       WHERE b.user_id = $1 AND ag.company_id = $2
       UNION
       SELECT c.id FROM account_groups c JOIN g ON c.parent_id = g.id
     )
     SELECT id FROM g`,
    [actor.userId, companyId],
  );
  return rows.map((r) => r.id);
}

export async function assertLedgersVisible(
  q: Queryable,
  actor: Actor,
  companyId: string,
  ledgerIds: string[],
): Promise<void> {
  const hidden = await hiddenGroupIds(q, actor, companyId);
  if (hidden.length === 0 || ledgerIds.length === 0) return;
  const rows = await q.query<{ id: string }>(
    `SELECT id FROM ledgers WHERE company_id = $1 AND id = ANY($2::uuid[]) AND group_id = ANY($3::uuid[])`,
    [companyId, ledgerIds, hidden],
  );
  if (rows.length > 0) throw new AuthError('FORBIDDEN', 'You do not have access to one of these accounts');
}

export async function setHiddenCompanies(db: Db, userId: string, companyIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query('DELETE FROM user_hidden_companies WHERE user_id = $1', [userId]);
    for (const companyId of companyIds) {
      await tx.query('INSERT INTO user_hidden_companies(id, user_id, company_id) VALUES ($1,$2,$3)', [
        randomUUID(),
        userId,
        companyId,
      ]);
    }
  });
}

export async function visibleCompanies(
  q: Queryable,
  actor: Actor,
): Promise<{ id: string; code: string; name: string }[]> {
  return q.query(
    `SELECT id, code, name FROM companies
     WHERE $1::boolean OR id NOT IN (SELECT company_id FROM user_hidden_companies WHERE user_id = $2)
     ORDER BY name`,
    [actor.isAdmin, actor.userId],
  );
}

export async function assertCompanyVisible(q: Queryable, actor: Actor, companyId: string): Promise<void> {
  if (actor.isAdmin) return;
  const hidden = await q.query(
    'SELECT 1 FROM user_hidden_companies WHERE user_id = $1 AND company_id = $2',
    [actor.userId, companyId],
  );
  if (hidden.length > 0) throw new AuthError('FORBIDDEN', 'You do not have access to this company');
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/service/src/security`
Expected: PASS — rights and users tests.

- [ ] **Step 5: Commit**

```bash
git add packages/service/src/security
git commit -m "feat(security): module rights, blocked groups and hidden companies" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Append-only audit log wired into vouchers

**Files:**
- Create: `packages/service/src/db/migrations/003_audit.sql`
- Create: `packages/service/src/security/audit.ts`
- Modify: `packages/service/src/posting/voucherService.ts`
- Test: `packages/service/src/security/audit.test.ts`

**Interfaces:**
- Consumes: `createUser` (Task 1); `saveVoucher/updateVoucher/deleteVoucher` (Plan A); `Actor` (Task 1).
- Produces:
  - `interface AuditEntry { userId: string | null; companyId: string | null; entity: string; entityId: string | null; action: string; oldValues?: unknown; newValues?: unknown }`
  - `writeAudit(q: Queryable, e: AuditEntry): Promise<void>`
  - `exportAudit(q: Queryable, actor: Actor, filter: { companyId: string; from?: string; to?: string; entity?: string }): Promise<AuditRow[]>` where `AuditRow = { at: string; userId: string | null; username: string | null; entity: string; entityId: string | null; action: string; oldValues: unknown; newValues: unknown }`; only for admins whose `can_export_audit` is true.
  - Voucher audit rows: `entity = 'voucher'`, `action` is `'add' | 'edit' | 'delete'`, `old_values`/`new_values` are `{ voucherNo, date, kind, narration, lines: { ledgerId, debit, credit }[] }`.

- [ ] **Step 1: Write the failing test**

`packages/service/src/security/audit.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/service/src/security/audit.test.ts`
Expected: FAIL — cannot find module `./audit`.

- [ ] **Step 3: Write the migration and the audit module**

`packages/service/src/db/migrations/003_audit.sql`:
```sql
CREATE TABLE audit_log (
  id uuid PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES users(id),
  company_id uuid,
  entity text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  old_values jsonb,
  new_values jsonb
);
CREATE INDEX audit_log_entity ON audit_log (entity, entity_id);
CREATE INDEX audit_log_company_at ON audit_log (company_id, at);

CREATE FUNCTION audit_log_refuse() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END
$$;

CREATE TRIGGER trg_audit_log_no_change BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_refuse();
CREATE TRIGGER trg_audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_refuse();
```

`packages/service/src/security/audit.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { AuthError, type Actor } from '@sas/shared';
import type { Queryable } from '../db/types';

export interface AuditEntry {
  userId: string | null;
  companyId: string | null;
  entity: string;
  entityId: string | null;
  action: string;
  oldValues?: unknown;
  newValues?: unknown;
}

export interface AuditRow {
  at: string;
  userId: string | null;
  username: string | null;
  entity: string;
  entityId: string | null;
  action: string;
  oldValues: unknown;
  newValues: unknown;
}

const json = (v: unknown) => (v === undefined ? null : JSON.stringify(v));

export async function writeAudit(q: Queryable, e: AuditEntry): Promise<void> {
  await q.query(
    `INSERT INTO audit_log(id, user_id, company_id, entity, entity_id, action, old_values, new_values)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,
    [randomUUID(), e.userId, e.companyId, e.entity, e.entityId, e.action, json(e.oldValues), json(e.newValues)],
  );
}

/** Admins with the separate "export audit" right only. */
export async function exportAudit(
  q: Queryable,
  actor: Actor,
  filter: { companyId: string; from?: string; to?: string; entity?: string },
): Promise<AuditRow[]> {
  const allowed = actor.isAdmin
    ? await q.query<{ can_export_audit: boolean }>('SELECT can_export_audit FROM users WHERE id = $1', [actor.userId])
    : [];
  if (!allowed[0]?.can_export_audit) throw new AuthError('FORBIDDEN', 'You may not export the audit log');
  const rows = await q.query<{
    at: string;
    user_id: string | null;
    username: string | null;
    entity: string;
    entity_id: string | null;
    action: string;
    old_values: unknown;
    new_values: unknown;
  }>(
    `SELECT a.at, a.user_id, u.username, a.entity, a.entity_id, a.action, a.old_values, a.new_values
     FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.company_id = $1
       AND ($2::text IS NULL OR a.entity = $2)
       AND ($3::date IS NULL OR a.at >= $3::date)
       AND ($4::date IS NULL OR a.at < $4::date + 1)
     ORDER BY a.at, a.id`,
    [filter.companyId, filter.entity ?? null, filter.from ?? null, filter.to ?? null],
  );
  return rows.map((r) => ({
    at: new Date(r.at).toISOString(),
    userId: r.user_id,
    username: r.username,
    entity: r.entity,
    entityId: r.entity_id,
    action: r.action,
    oldValues: r.old_values,
    newValues: r.new_values,
  }));
}
```

- [ ] **Step 4: Wire audit into the voucher service**

In `packages/service/src/posting/voucherService.ts`, add the import:
```ts
import { writeAudit } from '../security/audit';
```
Add this helper above `saveVoucher`:
```ts
/** The voucher as the audit log stores it. */
async function snapshot(tx: Queryable, voucherId: string) {
  const header = (
    await tx.query<{ voucher_no: number; voucher_date: string; kind: string; narration: string | null }>(
      'SELECT voucher_no, voucher_date, kind, narration FROM vouchers WHERE id = $1',
      [voucherId],
    )
  )[0]!;
  const lines = await tx.query<{ ledger_id: string; debit: string; credit: string }>(
    'SELECT ledger_id, debit, credit FROM voucher_lines WHERE voucher_id = $1 ORDER BY line_no',
    [voucherId],
  );
  return {
    voucherNo: header.voucher_no,
    date: header.voucher_date,
    kind: header.kind,
    narration: header.narration,
    lines: lines.map((l) => ({ ledgerId: l.ledger_id, debit: l.debit, credit: l.credit })),
  };
}
```
In `saveVoucher`, after the `await writeBody(tx, {...});` call and before `return { voucherId, voucherNo };` add:
```ts
    await writeAudit(tx, {
      userId: input.actorId,
      companyId: input.companyId,
      entity: 'voucher',
      entityId: voucherId,
      action: 'add',
      newValues: await snapshot(tx, voucherId),
    });
```
In `updateVoucher`, take the old snapshot right after `lockVoucher` and the checks, i.e. immediately before `await clearBody(tx, voucherId);`:
```ts
    const before = await snapshot(tx, voucherId);
```
and after the `UPDATE vouchers SET …` statement, before `return { version: expectedVersion + 1 };` add:
```ts
    await writeAudit(tx, {
      userId: patch.actorId,
      companyId: v.company_id,
      entity: 'voucher',
      entityId: voucherId,
      action: 'edit',
      oldValues: before,
      newValues: await snapshot(tx, voucherId),
    });
```
In `deleteVoucher`, rename the parameter `_actorId` to `actorId`, take the snapshot before clearing, and audit after the delete:
```ts
export async function deleteVoucher(
  db: Db,
  voucherId: string,
  expectedVersion: number,
  actorId: string | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    const v = await lockVoucher(tx, voucherId, expectedVersion);
    await assertPostable(tx, v.company_id, v.year_id, v.voucher_date);
    const before = await snapshot(tx, voucherId);
    await clearBody(tx, voucherId);
    await tx.query('DELETE FROM vouchers WHERE id = $1', [voucherId]);
    await writeAudit(tx, {
      userId: actorId,
      companyId: v.company_id,
      entity: 'voucher',
      entityId: voucherId,
      action: 'delete',
      oldValues: before,
    });
  });
}
```

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS — the new audit tests and every Plan A test still green (their `actorId` is `null`, which the audit table allows).

- [ ] **Step 6: Commit**

```bash
git add packages/service
git commit -m "feat(security): append-only audit log recorded inside voucher transactions" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Ledger balances, ledger report and cash book

**Files:**
- Create: `packages/service/src/reports/format.ts`, `balances.ts`, `ledgerReport.ts`
- Test: `packages/service/src/reports/ledgerReport.test.ts`

**Interfaces:**
- Consumes: `toPaise`, `fromPaise`, `Side`, `AppError` (Plan A / Task 1); `Queryable`.
- Produces:
  - `interface DrCr { amount: string; side: Side }`; `toDrCr(signed: bigint): DrCr` (debit is positive; zero is `Dr 0.00`); `fromDrCr(x: DrCr): bigint`; `assertIsoDate(text: string): void` (throws `AppError('INVALID_INPUT')`).
  - `interface BalanceRow { ledgerId: string; ledgerName: string; groupId: string; groupCode: number; groupName: string; nature: 'asset'|'liability'|'income'|'expense'; opening: bigint; debit: bigint; credit: bigint; balance: bigint }` (`balance = opening + debit − credit`).
  - `ledgerBalances(q: Queryable, p: { companyId: string; yearId: string; asOn: string; hiddenGroupIds?: string[] }): Promise<BalanceRow[]>`, ordered by group code then ledger name.
  - `ledgerReport(q: Queryable, p: { companyId: string; yearId: string; ledgerId: string; from: string; to: string }): Promise<LedgerReport>` where `LedgerReport = { ledgerName: string; opening: DrCr; rows: LedgerReportRow[]; totalDebit: string; totalCredit: string; closing: DrCr }` and `LedgerReportRow = { date: string; voucherNo: number; bookCode: string; narration: string | null; debit: string; credit: string; balance: DrCr }`.
  - `cashBookDaily(q: Queryable, p: { companyId: string; yearId: string; bookId: string; from: string; to: string }): Promise<CashBookDay[]>` where `CashBookDay = { date: string; opening: DrCr; receipts: string; payments: string; closing: DrCr }` (only days that have entries; the book must have a default ledger).

- [ ] **Step 1: Write the failing test**

`packages/service/src/reports/ledgerReport.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/types';
import { setOpening } from '../masters/ledgers';
import { saveVoucher } from '../posting/voucherService';
import { seedCompany, type SeededCompany } from '../testing/fixtures';
import { createTestDb } from '../testing/testDb';
import { ledgerBalances } from './balances';
import { assertIsoDate, fromDrCr, toDrCr } from './format';
import { cashBookDaily, ledgerReport } from './ledgerReport';

let db: Db;
let s: SeededCompany;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedCompany(db);
  await setOpening(db, s.cashLedgerId, s.yearId, '1000', 'Dr');
});
afterEach(async () => {
  await db.close();
});

function receipt(amount: string, date: string) {
  return {
    companyId: s.companyId,
    yearId: s.yearId,
    bookId: s.cashBookId,
    kind: 'receipt' as const,
    date,
    lines: [{ ledgerId: s.partyLedgerId, side: 'Cr' as const, amount }],
    actorId: null,
  };
}
function payment(amount: string, date: string) {
  return {
    companyId: s.companyId,
    yearId: s.yearId,
    bookId: s.cashBookId,
    kind: 'payment' as const,
    date,
    lines: [{ ledgerId: s.partyLedgerId, side: 'Dr' as const, amount }],
    actorId: null,
  };
}

describe('format helpers', () => {
  it('toDrCr / fromDrCr round-trip', () => {
    expect(toDrCr(12345n)).toEqual({ amount: '123.45', side: 'Dr' });
    expect(toDrCr(-5n)).toEqual({ amount: '0.05', side: 'Cr' });
    expect(toDrCr(0n)).toEqual({ amount: '0.00', side: 'Dr' });
    expect(fromDrCr({ amount: '123.45', side: 'Dr' })).toBe(12345n);
    expect(fromDrCr({ amount: '0.05', side: 'Cr' })).toBe(-5n);
  });
  it('assertIsoDate rejects bad dates', () => {
    expect(() => assertIsoDate('2026-05-10')).not.toThrow();
    expect(() => assertIsoDate('10/05/2026')).toThrowError(/date/i);
  });
});

describe('ledgerBalances', () => {
  it('adds opening and movement up to the as-on date', async () => {
    await saveVoucher(db, receipt('500', '2026-05-10'));
    await saveVoucher(db, receipt('200', '2026-06-10'));
    const rows = await ledgerBalances(db, { companyId: s.companyId, yearId: s.yearId, asOn: '2026-05-31' });
    const cash = rows.find((r) => r.ledgerId === s.cashLedgerId)!;
    expect(cash).toMatchObject({ opening: 100000n, debit: 50000n, credit: 0n, balance: 150000n });
    const party = rows.find((r) => r.ledgerId === s.partyLedgerId)!;
    expect(party.balance).toBe(-50000n); // credit balance
  });

  it('leaves out ledgers in hidden groups', async () => {
    const group = await db.query<{ id: string }>('SELECT id FROM account_groups WHERE company_id = $1 AND code = 16', [
      s.companyId,
    ]);
    const rows = await ledgerBalances(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      asOn: '2027-03-31',
      hiddenGroupIds: [group[0]!.id],
    });
    expect(rows.some((r) => r.ledgerId === s.cashLedgerId)).toBe(false);
  });
});

describe('ledgerReport', () => {
  it('shows opening, running balance and closing', async () => {
    await saveVoucher(db, receipt('500', '2026-05-10'));
    await saveVoucher(db, payment('200', '2026-05-12'));
    const r = await ledgerReport(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      ledgerId: s.cashLedgerId,
      from: '2026-04-01',
      to: '2026-05-31',
    });
    expect(r.ledgerName).toBe('Cash');
    expect(r.opening).toEqual({ amount: '1000.00', side: 'Dr' });
    expect(r.rows.map((x) => [x.date, x.debit, x.credit, x.balance.amount])).toEqual([
      ['2026-05-10', '500.00', '0.00', '1500.00'],
      ['2026-05-12', '0.00', '200.00', '1300.00'],
    ]);
    expect(r.rows[0]).toMatchObject({ voucherNo: 1, bookCode: 'CB' });
    expect(r.totalDebit).toBe('500.00');
    expect(r.totalCredit).toBe('200.00');
    expect(r.closing).toEqual({ amount: '1300.00', side: 'Dr' });
  });

  it('a report starting mid-year folds earlier entries into the opening', async () => {
    await saveVoucher(db, receipt('500', '2026-05-10'));
    await saveVoucher(db, receipt('100', '2026-06-10'));
    const r = await ledgerReport(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      ledgerId: s.cashLedgerId,
      from: '2026-06-01',
      to: '2026-06-30',
    });
    expect(r.opening).toEqual({ amount: '1500.00', side: 'Dr' });
    expect(r.rows).toHaveLength(1);
    expect(r.closing).toEqual({ amount: '1600.00', side: 'Dr' });
  });

  it('rejects an unknown ledger and a bad date', async () => {
    await expect(
      ledgerReport(db, {
        companyId: s.companyId,
        yearId: s.yearId,
        ledgerId: '00000000-0000-4000-8000-000000000000',
        from: '2026-04-01',
        to: '2026-05-31',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      ledgerReport(db, { companyId: s.companyId, yearId: s.yearId, ledgerId: s.cashLedgerId, from: 'x', to: 'y' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('cashBookDaily', () => {
  it('summarises each day with opening, receipts, payments and closing', async () => {
    await saveVoucher(db, receipt('500', '2026-05-10'));
    await saveVoucher(db, receipt('300', '2026-05-10'));
    await saveVoucher(db, payment('200', '2026-05-12'));
    const days = await cashBookDaily(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      bookId: s.cashBookId,
      from: '2026-05-01',
      to: '2026-05-31',
    });
    expect(days).toEqual([
      {
        date: '2026-05-10',
        opening: { amount: '1000.00', side: 'Dr' },
        receipts: '800.00',
        payments: '0.00',
        closing: { amount: '1800.00', side: 'Dr' },
      },
      {
        date: '2026-05-12',
        opening: { amount: '1800.00', side: 'Dr' },
        receipts: '0.00',
        payments: '200.00',
        closing: { amount: '1600.00', side: 'Dr' },
      },
    ]);
  });

  it('refuses a book that has no ledger', async () => {
    await expect(
      cashBookDaily(db, {
        companyId: s.companyId,
        yearId: s.yearId,
        bookId: s.journalBookId,
        from: '2026-05-01',
        to: '2026-05-31',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/service/src/reports/ledgerReport.test.ts`
Expected: FAIL — cannot find module `./balances`.

- [ ] **Step 3: Write the implementation**

`packages/service/src/reports/format.ts`:
```ts
import { AppError, fromPaise, toPaise, type Side } from '@sas/shared';

export interface DrCr {
  amount: string;
  side: Side;
}

/** Debit-positive signed paise to an amount with its side. Zero is shown as Dr 0.00. */
export function toDrCr(signed: bigint): DrCr {
  return signed < 0n ? { amount: fromPaise(-signed), side: 'Cr' } : { amount: fromPaise(signed), side: 'Dr' };
}

export function fromDrCr(x: DrCr): bigint {
  const p = toPaise(x.amount);
  return x.side === 'Dr' ? p : -p;
}

export function assertIsoDate(text: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new AppError('INVALID_INPUT', `Invalid date "${text}"; use YYYY-MM-DD`);
  }
}
```

`packages/service/src/reports/balances.ts`:
```ts
import { toPaise } from '@sas/shared';
import type { Queryable } from '../db/types';
import { assertIsoDate } from './format';

export type Nature = 'asset' | 'liability' | 'income' | 'expense';

export interface BalanceRow {
  ledgerId: string;
  ledgerName: string;
  groupId: string;
  groupCode: number;
  groupName: string;
  nature: Nature;
  opening: bigint;
  debit: bigint;
  credit: bigint;
  /** opening + debit - credit; positive is a debit balance. */
  balance: bigint;
}

export interface BalanceParams {
  companyId: string;
  yearId: string;
  asOn: string;
  hiddenGroupIds?: string[];
}

/** Every ledger's balance as on a date: the year's opening balance plus the year's entries up to that date. */
export async function ledgerBalances(q: Queryable, p: BalanceParams): Promise<BalanceRow[]> {
  assertIsoDate(p.asOn);
  const rows = await q.query<{
    ledger_id: string;
    ledger_name: string;
    group_id: string;
    group_code: number;
    group_name: string;
    nature: Nature;
    opening: string;
    dr: string;
    cr: string;
  }>(
    `SELECT l.id AS ledger_id, l.name AS ledger_name,
            g.id AS group_id, g.code AS group_code, g.name AS group_name, g.nature,
            COALESCE(CASE WHEN o.side = 'Dr' THEN o.amount ELSE -o.amount END, 0) AS opening,
            COALESCE(e.dr, 0) AS dr, COALESCE(e.cr, 0) AS cr
     FROM ledgers l
     JOIN account_groups g ON g.id = l.group_id
     LEFT JOIN ledger_openings o ON o.ledger_id = l.id AND o.year_id = $2
     LEFT JOIN (
       SELECT ledger_id, SUM(debit) AS dr, SUM(credit) AS cr
       FROM ledger_entries
       WHERE company_id = $1 AND year_id = $2 AND entry_date <= $3
       GROUP BY ledger_id
     ) e ON e.ledger_id = l.id
     WHERE l.company_id = $1
     ORDER BY g.code, l.name`,
    [p.companyId, p.yearId, p.asOn],
  );
  const hidden = new Set(p.hiddenGroupIds ?? []);
  return rows
    .filter((r) => !hidden.has(r.group_id))
    .map((r) => {
      const opening = toPaise(r.opening);
      const debit = toPaise(r.dr);
      const credit = toPaise(r.cr);
      return {
        ledgerId: r.ledger_id,
        ledgerName: r.ledger_name,
        groupId: r.group_id,
        groupCode: r.group_code,
        groupName: r.group_name,
        nature: r.nature,
        opening,
        debit,
        credit,
        balance: opening + debit - credit,
      };
    });
}
```

`packages/service/src/reports/ledgerReport.ts`:
```ts
import { AppError, fromPaise, toPaise } from '@sas/shared';
import type { Queryable } from '../db/types';
import { assertIsoDate, fromDrCr, toDrCr, type DrCr } from './format';

export interface LedgerReportRow {
  date: string;
  voucherNo: number;
  bookCode: string;
  narration: string | null;
  debit: string;
  credit: string;
  balance: DrCr;
}

export interface LedgerReport {
  ledgerName: string;
  opening: DrCr;
  rows: LedgerReportRow[];
  totalDebit: string;
  totalCredit: string;
  closing: DrCr;
}

export interface LedgerReportParams {
  companyId: string;
  yearId: string;
  ledgerId: string;
  from: string;
  to: string;
}

export async function ledgerReport(q: Queryable, p: LedgerReportParams): Promise<LedgerReport> {
  assertIsoDate(p.from);
  assertIsoDate(p.to);
  const ledgers = await q.query<{ name: string }>('SELECT name FROM ledgers WHERE id = $1 AND company_id = $2', [
    p.ledgerId,
    p.companyId,
  ]);
  if (!ledgers[0]) throw new AppError('NOT_FOUND', 'Ledger not found');

  const opening = await q.query<{ signed: string }>(
    `SELECT COALESCE(SUM(CASE WHEN side = 'Dr' THEN amount ELSE -amount END), 0) AS signed
     FROM ledger_openings WHERE ledger_id = $1 AND year_id = $2`,
    [p.ledgerId, p.yearId],
  );
  const prior = await q.query<{ net: string }>(
    `SELECT COALESCE(SUM(debit - credit), 0) AS net FROM ledger_entries
     WHERE company_id = $1 AND year_id = $2 AND ledger_id = $3 AND entry_date < $4`,
    [p.companyId, p.yearId, p.ledgerId, p.from],
  );
  let running = toPaise(opening[0]!.signed) + toPaise(prior[0]!.net);
  const openingBalance = toDrCr(running);

  const entries = await q.query<{
    entry_date: string;
    voucher_no: number;
    book_code: string;
    narration: string | null;
    debit: string;
    credit: string;
  }>(
    `SELECT e.entry_date, v.voucher_no, b.code AS book_code, v.narration, e.debit, e.credit
     FROM ledger_entries e
     JOIN vouchers v ON v.id = e.voucher_id
     JOIN books b ON b.id = v.book_id
     WHERE e.company_id = $1 AND e.year_id = $2 AND e.ledger_id = $3 AND e.entry_date BETWEEN $4 AND $5
     ORDER BY e.entry_date, v.voucher_no, e.debit DESC, e.id`,
    [p.companyId, p.yearId, p.ledgerId, p.from, p.to],
  );

  let totalDebit = 0n;
  let totalCredit = 0n;
  const rows: LedgerReportRow[] = entries.map((e) => {
    const debit = toPaise(e.debit);
    const credit = toPaise(e.credit);
    totalDebit += debit;
    totalCredit += credit;
    running += debit - credit;
    return {
      date: e.entry_date,
      voucherNo: e.voucher_no,
      bookCode: e.book_code,
      narration: e.narration,
      debit: fromPaise(debit),
      credit: fromPaise(credit),
      balance: toDrCr(running),
    };
  });

  return {
    ledgerName: ledgers[0].name,
    opening: openingBalance,
    rows,
    totalDebit: fromPaise(totalDebit),
    totalCredit: fromPaise(totalCredit),
    closing: toDrCr(running),
  };
}

export interface CashBookDay {
  date: string;
  opening: DrCr;
  receipts: string;
  payments: string;
  closing: DrCr;
}

/** Rojmel: one line per day that has entries, for a cash or bank book. */
export async function cashBookDaily(
  q: Queryable,
  p: { companyId: string; yearId: string; bookId: string; from: string; to: string },
): Promise<CashBookDay[]> {
  const books = await q.query<{ default_ledger_id: string | null }>(
    'SELECT default_ledger_id FROM books WHERE id = $1 AND company_id = $2',
    [p.bookId, p.companyId],
  );
  if (!books[0]) throw new AppError('NOT_FOUND', 'Book not found');
  const ledgerId = books[0].default_ledger_id;
  if (!ledgerId) throw new AppError('INVALID_INPUT', 'This book has no cash or bank ledger');

  const report = await ledgerReport(q, { companyId: p.companyId, yearId: p.yearId, ledgerId, from: p.from, to: p.to });
  const days: CashBookDay[] = [];
  let running = fromDrCr(report.opening);
  for (const row of report.rows) {
    let day = days[days.length - 1];
    if (!day || day.date !== row.date) {
      day = { date: row.date, opening: toDrCr(running), receipts: '0.00', payments: '0.00', closing: toDrCr(running) };
      days.push(day);
    }
    const debit = toPaise(row.debit);
    const credit = toPaise(row.credit);
    running += debit - credit;
    day.receipts = fromPaise(toPaise(day.receipts) + debit);
    day.payments = fromPaise(toPaise(day.payments) + credit);
    day.closing = toDrCr(running);
  }
  return days;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/service/src/reports`
Expected: PASS — ledger balance, ledger report and cash book tests.

- [ ] **Step 5: Commit**

```bash
git add packages/service/src/reports
git commit -m "feat(reports): ledger balances, ledger report and daily cash book" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Trial balance, profit and loss, balance sheet

**Files:**
- Create: `packages/service/src/reports/financial.ts`
- Test: `packages/service/src/reports/financial.test.ts`

**Interfaces:**
- Consumes: `ledgerBalances`, `BalanceRow`, `BalanceParams` (Task 4); `fromPaise`; `Queryable`.
- Produces (all take `BalanceParams` = `{ companyId; yearId; asOn; hiddenGroupIds? }`):
  - `trialBalance(q, p): Promise<TrialBalance>` where `TrialBalance = { rows: { ledgerId; ledgerName; groupCode; groupName; debit: string; credit: string }[]; groups: { code: number; name: string; nature: string; debit: string; credit: string }[]; totalDebit: string; totalCredit: string; difference: string }`. `rows` has every ledger with a non-zero balance. `groups` rolls ledgers up to their top-level group (sub-groups count in their parent). `difference = totalDebit − totalCredit`.
  - `profitAndLoss(q, p): Promise<ProfitAndLoss>` where `ProfitAndLoss = { income: Section; expense: Section; netProfit: string }`; `Section = { groups: { code: number; name: string; amount: string; ledgers: { ledgerId: string; name: string; amount: string }[] }[]; total: string }`; `netProfit` is negative for a loss.
  - `balanceSheet(q, p): Promise<BalanceSheet>` where `BalanceSheet = { assets: Section; liabilities: Section; netProfit: string; totalAssets: string; totalLiabilities: string; difference: string }`. Assets are the debit balances of asset/liability ledgers; liabilities are their credit balances; a profit is added to the liabilities side, a loss to the assets side.

- [ ] **Step 1: Write the failing test**

`packages/service/src/reports/financial.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/types';
import { createLedger, setOpening } from '../masters/ledgers';
import { saveVoucher } from '../posting/voucherService';
import { seedCompany, type SeededCompany } from '../testing/fixtures';
import { createTestDb } from '../testing/testDb';
import { balanceSheet, profitAndLoss, trialBalance } from './financial';

let db: Db;
let s: SeededCompany;
let capital: string;
let sales: string;
let rent: string;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedCompany(db);
  capital = await createLedger(db, { companyId: s.companyId, groupCode: 5, name: 'Capital' });
  sales = await createLedger(db, { companyId: s.companyId, groupCode: 29, name: 'Sales' });
  rent = await createLedger(db, { companyId: s.companyId, groupCode: 32, name: 'Rent' });
  await setOpening(db, s.cashLedgerId, s.yearId, '10000', 'Dr');
  await setOpening(db, capital, s.yearId, '10000', 'Cr');

  // Credit sale of 3000, receipt of 1000, rent paid 400.
  await saveVoucher(db, {
    companyId: s.companyId,
    yearId: s.yearId,
    bookId: s.journalBookId,
    kind: 'journal',
    date: '2026-05-01',
    lines: [
      { ledgerId: s.partyLedgerId, side: 'Dr', amount: '3000' },
      { ledgerId: sales, side: 'Cr', amount: '3000' },
    ],
    actorId: null,
  });
  await saveVoucher(db, {
    companyId: s.companyId,
    yearId: s.yearId,
    bookId: s.cashBookId,
    kind: 'receipt',
    date: '2026-05-05',
    lines: [{ ledgerId: s.partyLedgerId, side: 'Cr', amount: '1000' }],
    actorId: null,
  });
  await saveVoucher(db, {
    companyId: s.companyId,
    yearId: s.yearId,
    bookId: s.cashBookId,
    kind: 'payment',
    date: '2026-05-08',
    lines: [{ ledgerId: rent, side: 'Dr', amount: '400' }],
    actorId: null,
  });
});
afterEach(async () => {
  await db.close();
});

const P = () => ({ companyId: s.companyId, yearId: s.yearId, asOn: '2027-03-31' });

describe('trialBalance', () => {
  it('lists non-zero ledgers and balances to the paisa', async () => {
    const tb = await trialBalance(db, P());
    const byName = Object.fromEntries(tb.rows.map((r) => [r.ledgerName, [r.debit, r.credit]]));
    expect(byName).toEqual({
      Cash: ['10600.00', '0.00'],
      'Ramesh Traders': ['2000.00', '0.00'],
      Rent: ['400.00', '0.00'],
      Capital: ['0.00', '10000.00'],
      Sales: ['0.00', '3000.00'],
    });
    expect(tb.totalDebit).toBe('13000.00');
    expect(tb.totalCredit).toBe('13000.00');
    expect(tb.difference).toBe('0.00');
  });

  it('respects the as-on date', async () => {
    const tb = await trialBalance(db, { ...P(), asOn: '2026-05-01' });
    expect(tb.rows.find((r) => r.ledgerName === 'Rent')).toBeUndefined();
    expect(tb.difference).toBe('0.00');
  });

  it('rolls sub-groups up into their top-level group', async () => {
    const creditor = await createLedger(db, { companyId: s.companyId, groupCode: 34, name: 'Misc Creditor' });
    await saveVoucher(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      bookId: s.journalBookId,
      kind: 'journal',
      date: '2026-05-09',
      lines: [
        { ledgerId: rent, side: 'Dr', amount: '50' },
        { ledgerId: creditor, side: 'Cr', amount: '50' },
      ],
      actorId: null,
    });
    const tb = await trialBalance(db, P());
    expect(tb.groups.find((g) => g.code === 35)).toMatchObject({ debit: '0.00', credit: '50.00' });
    expect(tb.groups.find((g) => g.code === 34)).toBeUndefined();
  });

  it('shows an imbalance when a group is hidden', async () => {
    const g = await db.query<{ id: string }>('SELECT id FROM account_groups WHERE company_id = $1 AND code = 16', [
      s.companyId,
    ]);
    const tb = await trialBalance(db, { ...P(), hiddenGroupIds: [g[0]!.id] });
    expect(tb.rows.some((r) => r.ledgerName === 'Cash')).toBe(false);
    expect(tb.difference).toBe('-10600.00');
  });
});

describe('profitAndLoss', () => {
  it('computes income, expense and net profit', async () => {
    const pl = await profitAndLoss(db, P());
    expect(pl.income.total).toBe('3000.00');
    expect(pl.expense.total).toBe('400.00');
    expect(pl.netProfit).toBe('2600.00');
    expect(pl.income.groups[0]).toMatchObject({ code: 29, name: 'Trading Income', amount: '3000.00' });
    expect(pl.income.groups[0]?.ledgers).toEqual([{ ledgerId: sales, name: 'Sales', amount: '3000.00' }]);
  });

  it('respects the as-on date', async () => {
    // the sale is dated 05-01 and the rent 05-08
    expect((await profitAndLoss(db, { ...P(), asOn: '2026-05-04' })).netProfit).toBe('3000.00');
    expect((await profitAndLoss(db, { ...P(), asOn: '2026-04-30' })).netProfit).toBe('0.00');
  });

  it('reports a loss as a negative net profit', async () => {
    await saveVoucher(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      bookId: s.cashBookId,
      kind: 'payment',
      date: '2026-06-01',
      lines: [{ ledgerId: rent, side: 'Dr', amount: '5000' }],
      actorId: null,
    });
    const pl = await profitAndLoss(db, P());
    expect(pl.expense.total).toBe('5400.00');
    expect(pl.netProfit).toBe('-2400.00');
  });
});

describe('balanceSheet', () => {
  it('ties: assets equal liabilities plus net profit', async () => {
    const bs = await balanceSheet(db, P());
    expect(bs.netProfit).toBe('2600.00');
    expect(bs.assets.total).toBe('12600.00'); // cash 10600 + debtor 2000
    expect(bs.liabilities.total).toBe('10000.00'); // capital
    expect(bs.totalAssets).toBe('12600.00');
    expect(bs.totalLiabilities).toBe('12600.00'); // capital + profit
    expect(bs.difference).toBe('0.00');
  });

  it('puts a loss on the assets side', async () => {
    await saveVoucher(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      bookId: s.cashBookId,
      kind: 'payment',
      date: '2026-06-01',
      lines: [{ ledgerId: rent, side: 'Dr', amount: '5000' }],
      actorId: null,
    });
    const bs = await balanceSheet(db, P());
    expect(bs.netProfit).toBe('-2400.00');
    expect(bs.totalAssets).toBe(bs.totalLiabilities);
    expect(bs.difference).toBe('0.00');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/service/src/reports/financial.test.ts`
Expected: FAIL — cannot find module `./financial`.

- [ ] **Step 3: Write the implementation**

`packages/service/src/reports/financial.ts`:
```ts
import { fromPaise } from '@sas/shared';
import type { Queryable } from '../db/types';
import { ledgerBalances, type BalanceParams, type BalanceRow } from './balances';

export interface SectionGroup {
  code: number;
  name: string;
  amount: string;
  ledgers: { ledgerId: string; name: string; amount: string }[];
}
export interface Section {
  groups: SectionGroup[];
  total: string;
}

/** Group ledger rows by their own group; `sign` turns a debit-positive balance into the natural amount. */
function section(rows: BalanceRow[], sign: 1n | -1n): { section: Section; total: bigint } {
  const groups = new Map<number, { name: string; total: bigint; ledgers: SectionGroup['ledgers'] }>();
  let total = 0n;
  for (const r of rows) {
    const amount = sign * r.balance;
    if (amount === 0n) continue;
    total += amount;
    const g = groups.get(r.groupCode) ?? { name: r.groupName, total: 0n, ledgers: [] };
    g.total += amount;
    g.ledgers.push({ ledgerId: r.ledgerId, name: r.ledgerName, amount: fromPaise(amount) });
    groups.set(r.groupCode, g);
  }
  return {
    section: {
      groups: [...groups.entries()]
        .sort(([a], [b]) => a - b)
        .map(([code, g]) => ({ code, name: g.name, amount: fromPaise(g.total), ledgers: g.ledgers })),
      total: fromPaise(total),
    },
    total,
  };
}

export interface TrialBalance {
  rows: { ledgerId: string; ledgerName: string; groupCode: number; groupName: string; debit: string; credit: string }[];
  groups: { code: number; name: string; nature: string; debit: string; credit: string }[];
  totalDebit: string;
  totalCredit: string;
  difference: string;
}

export async function trialBalance(q: Queryable, p: BalanceParams): Promise<TrialBalance> {
  const balances = (await ledgerBalances(q, p)).filter((r) => r.balance !== 0n);

  const groupRows = await q.query<{ id: string; code: number; name: string; nature: string; parent_id: string | null }>(
    'SELECT id, code, name, nature, parent_id FROM account_groups WHERE company_id = $1',
    [p.companyId],
  );
  const byId = new Map(groupRows.map((g) => [g.id, g]));
  const topOf = (id: string) => {
    let cur = byId.get(id)!;
    while (cur.parent_id) cur = byId.get(cur.parent_id)!;
    return cur;
  };

  let totalDebit = 0n;
  let totalCredit = 0n;
  const top = new Map<number, { name: string; nature: string; net: bigint }>();
  const rows = balances.map((r) => {
    const debit = r.balance > 0n ? r.balance : 0n;
    const credit = r.balance < 0n ? -r.balance : 0n;
    totalDebit += debit;
    totalCredit += credit;
    const t = topOf(r.groupId);
    const agg = top.get(t.code) ?? { name: t.name, nature: t.nature, net: 0n };
    agg.net += r.balance;
    top.set(t.code, agg);
    return {
      ledgerId: r.ledgerId,
      ledgerName: r.ledgerName,
      groupCode: r.groupCode,
      groupName: r.groupName,
      debit: fromPaise(debit),
      credit: fromPaise(credit),
    };
  });

  return {
    rows,
    groups: [...top.entries()]
      .sort(([a], [b]) => a - b)
      .map(([code, g]) => ({
        code,
        name: g.name,
        nature: g.nature,
        debit: fromPaise(g.net > 0n ? g.net : 0n),
        credit: fromPaise(g.net < 0n ? -g.net : 0n),
      })),
    totalDebit: fromPaise(totalDebit),
    totalCredit: fromPaise(totalCredit),
    difference: fromPaise(totalDebit - totalCredit),
  };
}

export interface ProfitAndLoss {
  income: Section;
  expense: Section;
  netProfit: string;
}

export async function profitAndLoss(q: Queryable, p: BalanceParams): Promise<ProfitAndLoss> {
  const balances = await ledgerBalances(q, p);
  const income = section(
    balances.filter((r) => r.nature === 'income'),
    -1n,
  );
  const expense = section(
    balances.filter((r) => r.nature === 'expense'),
    1n,
  );
  return { income: income.section, expense: expense.section, netProfit: fromPaise(income.total - expense.total) };
}

export interface BalanceSheet {
  assets: Section;
  liabilities: Section;
  netProfit: string;
  totalAssets: string;
  totalLiabilities: string;
  difference: string;
}

export async function balanceSheet(q: Queryable, p: BalanceParams): Promise<BalanceSheet> {
  const balances = await ledgerBalances(q, p);
  const sheet = balances.filter((r) => r.nature === 'asset' || r.nature === 'liability');
  const assets = section(
    sheet.filter((r) => r.balance > 0n),
    1n,
  );
  const liabilities = section(
    sheet.filter((r) => r.balance < 0n),
    -1n,
  );
  const profit =
    section(
      balances.filter((r) => r.nature === 'income'),
      -1n,
    ).total -
    section(
      balances.filter((r) => r.nature === 'expense'),
      1n,
    ).total;
  const totalAssets = assets.total + (profit < 0n ? -profit : 0n);
  const totalLiabilities = liabilities.total + (profit > 0n ? profit : 0n);
  return {
    assets: assets.section,
    liabilities: liabilities.section,
    netProfit: fromPaise(profit),
    totalAssets: fromPaise(totalAssets),
    totalLiabilities: fromPaise(totalLiabilities),
    difference: fromPaise(totalAssets - totalLiabilities),
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/service/src/reports`
Expected: PASS — trial balance, profit and loss, and balance sheet tests.

- [ ] **Step 5: Commit**

```bash
git add packages/service/src/reports
git commit -m "feat(reports): trial balance, profit and loss, balance sheet" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Outstanding ageing

**Files:**
- Create: `packages/service/src/reports/ageing.ts`
- Test: `packages/service/src/reports/ageing.test.ts`

**Interfaces:**
- Consumes: `registerBill`, `listOnAccount` (Plan A); `saveVoucher` (Plan A); `fromPaise`, `toPaise`, `Side`; `assertIsoDate` (Task 4).
- Produces: `outstandingAgeing(q: Queryable, p: AgeingParams): Promise<AgeingReport>` where
  - `AgeingParams = { companyId: string; asOn: string; side?: Side; ledgerId?: string; hiddenGroupIds?: string[]; bucketDays?: number[] }` (default `bucketDays = [30, 60, 90]`)
  - `AgeingReport = { bucketLabels: string[]; rows: AgeingRow[]; totals: { buckets: string[]; total: string; onAccount: string; net: string } }`
  - `AgeingRow = { ledgerId: string; ledgerName: string; side: Side; buckets: string[]; total: string; onAccount: string; net: string }`
  - Bucket labels for `[30,60,90]` are `['0-30','31-60','61-90','90+']`. A bill's age is `asOn − bill_date` in days; bills dated after `asOn` are left out. Pending amounts are as of now (today's adjustments), not as of `asOn`. `onAccount` is the unmatched money on that ledger on the opposite side; `net = total − onAccount`.

- [ ] **Step 1: Write the failing test**

`packages/service/src/reports/ageing.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/types';
import { registerBill } from '../outstanding/billService';
import { saveVoucher } from '../posting/voucherService';
import { seedCompany, type SeededCompany } from '../testing/fixtures';
import { createTestDb } from '../testing/testDb';
import { outstandingAgeing } from './ageing';

let db: Db;
let s: SeededCompany;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedCompany(db);
});
afterEach(async () => {
  await db.close();
});

function bill(billNo: string, amount: string, billDate: string) {
  return registerBill(db, {
    companyId: s.companyId,
    yearId: s.yearId,
    ledgerId: s.partyLedgerId,
    billNo,
    billDate,
    amount,
    side: 'Dr',
  });
}

describe('outstandingAgeing', () => {
  it('puts each pending bill into its age bucket', async () => {
    // as on 2026-12-31: 10 days, 50 days, 80 days and 200 days old
    await bill('S-1', '100.00', '2026-12-21');
    await bill('S-2', '200.00', '2026-11-11');
    await bill('S-3', '300.00', '2026-10-12');
    await bill('S-4', '400.00', '2026-06-14');
    const r = await outstandingAgeing(db, { companyId: s.companyId, asOn: '2026-12-31' });
    expect(r.bucketLabels).toEqual(['0-30', '31-60', '61-90', '90+']);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      ledgerName: 'Ramesh Traders',
      side: 'Dr',
      buckets: ['100.00', '200.00', '300.00', '400.00'],
      total: '1000.00',
      onAccount: '0.00',
      net: '1000.00',
    });
    expect(r.totals.total).toBe('1000.00');
  });

  it('counts only what is still pending after receipts', async () => {
    const id = await bill('S-1', '1000.00', '2026-12-21');
    await saveVoucher(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      bookId: s.cashBookId,
      kind: 'receipt',
      date: '2026-12-25',
      lines: [
        {
          ledgerId: s.partyLedgerId,
          side: 'Cr',
          amount: '700.00',
          adjustments: [{ billId: id, amount: '600.00', kind: 'cash' }],
        },
      ],
      actorId: null,
    });
    const r = await outstandingAgeing(db, { companyId: s.companyId, asOn: '2026-12-31' });
    expect(r.rows[0]).toMatchObject({ buckets: ['400.00', '0.00', '0.00', '0.00'], total: '400.00' });
    expect(r.rows[0]?.onAccount).toBe('100.00'); // 700 received, 600 adjusted
    expect(r.rows[0]?.net).toBe('300.00');
  });

  it('leaves out bills dated after the as-on date and settled bills', async () => {
    await bill('S-1', '100.00', '2027-01-15');
    const done = await bill('S-2', '50.00', '2026-12-01');
    await saveVoucher(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      bookId: s.cashBookId,
      kind: 'receipt',
      date: '2026-12-02',
      lines: [
        {
          ledgerId: s.partyLedgerId,
          side: 'Cr',
          amount: '50.00',
          adjustments: [{ billId: done, amount: '50.00', kind: 'cash' }],
        },
      ],
      actorId: null,
    });
    const r = await outstandingAgeing(db, { companyId: s.companyId, asOn: '2026-12-31' });
    expect(r.rows).toHaveLength(0);
    expect(r.totals.total).toBe('0.00');
  });

  it('filters by ledger and by side, and hides blocked groups', async () => {
    await bill('S-1', '100.00', '2026-12-21');
    const base = { companyId: s.companyId, asOn: '2026-12-31' };
    expect((await outstandingAgeing(db, { ...base, ledgerId: s.cashLedgerId })).rows).toHaveLength(0);
    expect((await outstandingAgeing(db, { ...base, side: 'Cr' })).rows).toHaveLength(0);
    expect((await outstandingAgeing(db, { ...base, side: 'Dr' })).rows).toHaveLength(1);
    const g = await db.query<{ id: string }>('SELECT id FROM account_groups WHERE company_id = $1 AND code = 42', [
      s.companyId,
    ]);
    expect((await outstandingAgeing(db, { ...base, hiddenGroupIds: [g[0]!.id] })).rows).toHaveLength(0);
  });

  it('supports custom bucket sizes', async () => {
    await bill('S-1', '100.00', '2026-12-21');
    const r = await outstandingAgeing(db, { companyId: s.companyId, asOn: '2026-12-31', bucketDays: [15] });
    expect(r.bucketLabels).toEqual(['0-15', '15+']);
    expect(r.rows[0]?.buckets).toEqual(['100.00', '0.00']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/service/src/reports/ageing.test.ts`
Expected: FAIL — cannot find module `./ageing`.

- [ ] **Step 3: Write the implementation**

`packages/service/src/reports/ageing.ts`:
```ts
import { fromPaise, toPaise, type Side } from '@sas/shared';
import type { Queryable } from '../db/types';
import { assertIsoDate } from './format';

export interface AgeingParams {
  companyId: string;
  asOn: string;
  side?: Side;
  ledgerId?: string;
  hiddenGroupIds?: string[];
  bucketDays?: number[];
}

export interface AgeingRow {
  ledgerId: string;
  ledgerName: string;
  side: Side;
  buckets: string[];
  total: string;
  onAccount: string;
  net: string;
}

export interface AgeingReport {
  bucketLabels: string[];
  rows: AgeingRow[];
  totals: { buckets: string[]; total: string; onAccount: string; net: string };
}

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);

/** [30, 60, 90] gives 0-30, 31-60, 61-90, 90+. */
function labels(cuts: number[]): string[] {
  const out = cuts.map((cut, i) => (i === 0 ? `0-${cut}` : `${cuts[i - 1]! + 1}-${cut}`));
  out.push(`${cuts[cuts.length - 1]}+`);
  return out;
}

export async function outstandingAgeing(q: Queryable, p: AgeingParams): Promise<AgeingReport> {
  assertIsoDate(p.asOn);
  const cuts = p.bucketDays ?? [30, 60, 90];
  const bucketLabels = labels(cuts);
  const hidden = new Set(p.hiddenGroupIds ?? []);

  const bills = await q.query<{
    ledger_id: string;
    name: string;
    group_id: string;
    side: Side;
    bill_date: string;
    pending: string;
  }>(
    `SELECT b.ledger_id, l.name, l.group_id, b.side, b.bill_date,
            b.original_amount - COALESCE(SUM(a.amount), 0) AS pending
     FROM outstanding_bills b
     JOIN ledgers l ON l.id = b.ledger_id
     LEFT JOIN bill_adjustments a ON a.bill_id = b.id
     WHERE b.company_id = $1 AND b.bill_date <= $2
       AND ($3::text IS NULL OR b.side = $3)
       AND ($4::uuid IS NULL OR b.ledger_id = $4)
     GROUP BY b.id, l.name, l.group_id
     HAVING b.original_amount - COALESCE(SUM(a.amount), 0) > 0`,
    [p.companyId, p.asOn, p.side ?? null, p.ledgerId ?? null],
  );

  const asOnDay = dayNumber(p.asOn);
  const rows = new Map<string, { row: AgeingRow; buckets: bigint[]; total: bigint }>();
  for (const b of bills) {
    if (hidden.has(b.group_id)) continue;
    const key = `${b.ledger_id}|${b.side}`;
    let entry = rows.get(key);
    if (!entry) {
      entry = {
        row: { ledgerId: b.ledger_id, ledgerName: b.name, side: b.side, buckets: [], total: '', onAccount: '', net: '' },
        buckets: bucketLabels.map(() => 0n),
        total: 0n,
      };
      rows.set(key, entry);
    }
    const age = asOnDay - dayNumber(b.bill_date);
    let idx = cuts.findIndex((cut) => age <= cut);
    if (idx === -1) idx = cuts.length;
    const amount = toPaise(b.pending);
    entry.buckets[idx]! += amount;
    entry.total += amount;
  }

  // Unmatched on-account money sits on the opposite side of the bills it could settle.
  const onAccount = await q.query<{ ledger_id: string; side: Side; remaining: string }>(
    `SELECT o.ledger_id, o.side, o.amount - COALESCE(SUM(a.amount), 0) AS remaining
     FROM on_account o LEFT JOIN bill_adjustments a ON a.on_account_id = o.id
     WHERE o.company_id = $1
     GROUP BY o.id
     HAVING o.amount - COALESCE(SUM(a.amount), 0) > 0`,
    [p.companyId],
  );
  const onAccountByKey = new Map<string, bigint>();
  for (const o of onAccount) {
    const billSide: Side = o.side === 'Cr' ? 'Dr' : 'Cr';
    const key = `${o.ledger_id}|${billSide}`;
    onAccountByKey.set(key, (onAccountByKey.get(key) ?? 0n) + toPaise(o.remaining));
  }

  const totalsBuckets = bucketLabels.map(() => 0n);
  let totalAll = 0n;
  let totalOnAccount = 0n;
  const out: AgeingRow[] = [];
  for (const [key, e] of [...rows.entries()].sort(([, a], [, b]) => a.row.ledgerName.localeCompare(b.row.ledgerName))) {
    const oa = onAccountByKey.get(key) ?? 0n;
    e.buckets.forEach((v, i) => (totalsBuckets[i]! += v));
    totalAll += e.total;
    totalOnAccount += oa;
    out.push({
      ...e.row,
      buckets: e.buckets.map(fromPaise),
      total: fromPaise(e.total),
      onAccount: fromPaise(oa),
      net: fromPaise(e.total - oa),
    });
  }

  return {
    bucketLabels,
    rows: out,
    totals: {
      buckets: totalsBuckets.map(fromPaise),
      total: fromPaise(totalAll),
      onAccount: fromPaise(totalOnAccount),
      net: fromPaise(totalAll - totalOnAccount),
    },
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/service/src/reports/ageing.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/service/src/reports
git commit -m "feat(reports): outstanding ageing with on-account netting" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 7: Freeze date and year-end closing

**Files:**
- Create: `packages/service/src/ops/companyAdmin.ts`, `packages/service/src/ops/yearEnd.ts`
- Test: `packages/service/src/ops/companyAdmin.test.ts`, `packages/service/src/ops/yearEnd.test.ts`

**Interfaces:**
- Consumes: `assertRight` (Task 2); `writeAudit` (Task 3); `ledgerBalances` (Task 4); `createLedger`, `setOpening` (Plan A); `assertIsoDate` (Task 4); `Actor`, `AppError` (Task 1).
- Produces:
  - `setFreezeDate(db: Db, actor: Actor, companyId: string, date: string | null): Promise<void>` — needs `utilities` + `edit`; `null` removes the freeze; audited as `entity 'company'`, `action 'freeze'`.
  - `PL_LEDGER_NAME = 'Profit & Loss A/c'`
  - `closeYear(db: Db, actor: Actor, p: { companyId: string; yearId: string; next: { label: string; start: string; end: string } }): Promise<{ nextYearId: string; netProfit: string; carriedLedgers: number; carriedBills: number }>`
  - `reopenYear(db: Db, actor: Actor, companyId: string, yearId: string): Promise<void>` — `closed` → `open`
  - `lockYear(db: Db, actor: Actor, companyId: string, yearId: string): Promise<void>` — `closed` → `locked` (final)

**Closing rules:** the next year's opening balances are fully derived: every previous opening of the next year is deleted and rewritten. Asset and liability ledgers carry their closing balance. Income and expense ledgers carry nothing; their net result (profit is credit) is added to the `Profit & Loss A/c` ledger (created under group 22 when missing). Pending bills carry forward automatically because bills are not year-bound; the result reports how many. The closed year refuses vouchers until it is reopened. A year can be reopened only while no later year is closed or locked.

- [ ] **Step 1: Write the failing tests**

`packages/service/src/ops/companyAdmin.test.ts`:
```ts
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
```

`packages/service/src/ops/yearEnd.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '@sas/shared';
import type { Db } from '../db/types';
import { createLedger, setOpening } from '../masters/ledgers';
import { listPendingBills, registerBill } from '../outstanding/billService';
import { saveVoucher } from '../posting/voucherService';
import { trialBalance } from '../reports/financial';
import { createUser } from '../security/users';
import { seedCompany, type SeededCompany } from '../testing/fixtures';
import { createTestDb } from '../testing/testDb';
import { closeYear, lockYear, reopenYear } from './yearEnd';

let db: Db;
let s: SeededCompany;
let admin: Actor;
let sales: string;
let rent: string;
const NEXT = { label: '2027-28', start: '2027-04-01', end: '2028-03-31' };

beforeEach(async () => {
  db = await createTestDb();
  s = await seedCompany(db);
  admin = { userId: await createUser(db, { username: 'boss', password: 'pass1234', isAdmin: true }), username: 'boss', isAdmin: true };
  const capital = await createLedger(db, { companyId: s.companyId, groupCode: 5, name: 'Capital' });
  sales = await createLedger(db, { companyId: s.companyId, groupCode: 29, name: 'Sales' });
  rent = await createLedger(db, { companyId: s.companyId, groupCode: 32, name: 'Rent' });
  await setOpening(db, s.cashLedgerId, s.yearId, '10000', 'Dr');
  await setOpening(db, capital, s.yearId, '10000', 'Cr');
  const base = { companyId: s.companyId, yearId: s.yearId, actorId: null };
  await saveVoucher(db, {
    ...base,
    bookId: s.journalBookId,
    kind: 'journal',
    date: '2026-05-01',
    lines: [
      { ledgerId: s.partyLedgerId, side: 'Dr', amount: '3000' },
      { ledgerId: sales, side: 'Cr', amount: '3000' },
    ],
  });
  await saveVoucher(db, {
    ...base,
    bookId: s.cashBookId,
    kind: 'receipt',
    date: '2026-05-05',
    lines: [{ ledgerId: s.partyLedgerId, side: 'Cr', amount: '1000' }],
  });
  await saveVoucher(db, {
    ...base,
    bookId: s.cashBookId,
    kind: 'payment',
    date: '2026-05-08',
    lines: [{ ledgerId: rent, side: 'Dr', amount: '400' }],
  });
});
afterEach(async () => {
  await db.close();
});

async function openings(yearId: string) {
  const rows = await db.query<{ name: string; amount: string; side: string }>(
    `SELECT l.name, o.amount, o.side FROM ledger_openings o JOIN ledgers l ON l.id = o.ledger_id WHERE o.year_id = $1`,
    [yearId],
  );
  return Object.fromEntries(rows.map((r) => [r.name, [r.amount, r.side]]));
}
const status = async (yearId: string) =>
  (await db.query<{ status: string }>('SELECT status FROM financial_years WHERE id = $1', [yearId]))[0]?.status;
const close = () => closeYear(db, admin, { companyId: s.companyId, yearId: s.yearId, next: NEXT });

describe('closeYear', () => {
  it('writes the next year\'s openings and moves the profit to Profit & Loss A/c', async () => {
    const r = await close();
    expect(r.netProfit).toBe('2600.00');
    expect(r.carriedLedgers).toBe(4);
    expect(await openings(r.nextYearId)).toEqual({
      Cash: ['10600.00', 'Dr'],
      Capital: ['10000.00', 'Cr'],
      'Ramesh Traders': ['2000.00', 'Dr'],
      'Profit & Loss A/c': ['2600.00', 'Cr'],
    });
    expect(await status(s.yearId)).toBe('closed');
  });

  it('the next year opens balanced', async () => {
    const r = await close();
    const tb = await trialBalance(db, { companyId: s.companyId, yearId: r.nextYearId, asOn: '2027-04-01' });
    expect(tb.totalDebit).toBe('12600.00');
    expect(tb.totalCredit).toBe('12600.00');
    expect(tb.difference).toBe('0.00');
  });

  it('closed year refuses new vouchers', async () => {
    await close();
    await expect(
      saveVoucher(db, {
        companyId: s.companyId,
        yearId: s.yearId,
        bookId: s.cashBookId,
        kind: 'receipt',
        date: '2026-06-01',
        lines: [{ ledgerId: s.partyLedgerId, side: 'Cr', amount: '1' }],
        actorId: null,
      }),
    ).rejects.toMatchObject({ code: 'YEAR_LOCKED' });
  });

  it('carries pending bills forward', async () => {
    await registerBill(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      ledgerId: s.partyLedgerId,
      billNo: 'S-1',
      billDate: '2026-05-01',
      amount: '3000',
      side: 'Dr',
    });
    const r = await close();
    expect(r.carriedBills).toBe(1);
    expect((await listPendingBills(db, s.companyId, s.partyLedgerId)).map((b) => b.billNo)).toEqual(['S-1']);
  });

  it('rejects bad next-year dates', async () => {
    await expect(
      closeYear(db, admin, { companyId: s.companyId, yearId: s.yearId, next: { label: 'x', start: '2026-12-01', end: '2027-11-30' } }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('needs the utilities edit right', async () => {
    const clerkId = await createUser(db, { username: 'clerk', password: 'pass1234' });
    await expect(
      closeYear(db, { userId: clerkId, username: 'clerk', isAdmin: false }, { companyId: s.companyId, yearId: s.yearId, next: NEXT }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('reopenYear', () => {
  it('lets you correct the old year and close again; openings are recalculated, not duplicated', async () => {
    const first = await close();
    await reopenYear(db, admin, s.companyId, s.yearId);
    expect(await status(s.yearId)).toBe('open');
    await saveVoucher(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      bookId: s.cashBookId,
      kind: 'receipt',
      date: '2026-06-01',
      lines: [{ ledgerId: s.partyLedgerId, side: 'Cr', amount: '500' }],
      actorId: null,
    });
    const second = await close();
    expect(second.nextYearId).toBe(first.nextYearId);
    expect(await openings(second.nextYearId)).toEqual({
      Cash: ['11100.00', 'Dr'],
      Capital: ['10000.00', 'Cr'],
      'Ramesh Traders': ['1500.00', 'Dr'],
      'Profit & Loss A/c': ['2600.00', 'Cr'],
    });
  });

  it('refuses once the next year is closed', async () => {
    const r = await close();
    await closeYear(db, admin, {
      companyId: s.companyId,
      yearId: r.nextYearId,
      next: { label: '2028-29', start: '2028-04-01', end: '2029-03-31' },
    });
    await expect(reopenYear(db, admin, s.companyId, s.yearId)).rejects.toMatchObject({ code: 'YEAR_BAD_STATE' });
  });

  it('refuses to reopen a year that is not closed', async () => {
    await expect(reopenYear(db, admin, s.companyId, s.yearId)).rejects.toMatchObject({ code: 'YEAR_BAD_STATE' });
  });
});

describe('lockYear', () => {
  it('locks for good', async () => {
    await close();
    await lockYear(db, admin, s.companyId, s.yearId);
    expect(await status(s.yearId)).toBe('locked');
    await expect(reopenYear(db, admin, s.companyId, s.yearId)).rejects.toMatchObject({ code: 'YEAR_BAD_STATE' });
    await expect(close()).rejects.toMatchObject({ code: 'YEAR_BAD_STATE' });
  });

  it('only a closed year can be locked', async () => {
    await expect(lockYear(db, admin, s.companyId, s.yearId)).rejects.toMatchObject({ code: 'YEAR_BAD_STATE' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/service/src/ops`
Expected: FAIL — cannot find module `./companyAdmin` / `./yearEnd`.

- [ ] **Step 3: Write the implementation**

`packages/service/src/ops/companyAdmin.ts`:
```ts
import { AppError, type Actor } from '@sas/shared';
import type { Db } from '../db/types';
import { assertIsoDate } from '../reports/format';
import { writeAudit } from '../security/audit';
import { assertRight } from '../security/rights';

/** Freeze every entry dated on or before `date`. Pass null to lift the freeze. */
export async function setFreezeDate(db: Db, actor: Actor, companyId: string, date: string | null): Promise<void> {
  if (date !== null) assertIsoDate(date);
  await db.transaction(async (tx) => {
    await assertRight(tx, actor, 'utilities', 'edit');
    const rows = await tx.query<{ freeze_date: string | null }>(
      'SELECT freeze_date FROM companies WHERE id = $1 FOR UPDATE',
      [companyId],
    );
    if (!rows[0]) throw new AppError('NOT_FOUND', 'Company not found');
    await tx.query('UPDATE companies SET freeze_date = $2, version = version + 1, updated_at = now() WHERE id = $1', [
      companyId,
      date,
    ]);
    await writeAudit(tx, {
      userId: actor.userId,
      companyId,
      entity: 'company',
      entityId: companyId,
      action: 'freeze',
      oldValues: { freezeDate: rows[0].freeze_date },
      newValues: { freezeDate: date },
    });
  });
}
```

`packages/service/src/ops/yearEnd.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { AppError, fromPaise, type Actor } from '@sas/shared';
import type { Db, Queryable } from '../db/types';
import { createLedger, setOpening } from '../masters/ledgers';
import { ledgerBalances } from '../reports/balances';
import { assertIsoDate } from '../reports/format';
import { writeAudit } from '../security/audit';
import { assertRight } from '../security/rights';

export const PL_LEDGER_NAME = 'Profit & Loss A/c';

export interface CloseYearParams {
  companyId: string;
  yearId: string;
  next: { label: string; start: string; end: string };
}

export interface CloseYearResult {
  nextYearId: string;
  netProfit: string;
  carriedLedgers: number;
  carriedBills: number;
}

interface YearRow {
  status: string;
  start_date: string;
  end_date: string;
}

async function lockYearRow(tx: Queryable, companyId: string, yearId: string): Promise<YearRow> {
  const rows = await tx.query<YearRow>(
    'SELECT status, start_date, end_date FROM financial_years WHERE id = $1 AND company_id = $2 FOR UPDATE',
    [yearId, companyId],
  );
  if (!rows[0]) throw new AppError('NOT_FOUND', 'Financial year not found');
  return rows[0];
}

export async function closeYear(db: Db, actor: Actor, p: CloseYearParams): Promise<CloseYearResult> {
  assertIsoDate(p.next.start);
  assertIsoDate(p.next.end);
  return db.transaction(async (tx) => {
    await assertRight(tx, actor, 'utilities', 'edit');
    const year = await lockYearRow(tx, p.companyId, p.yearId);
    if (year.status === 'locked') throw new AppError('YEAR_BAD_STATE', 'This year is locked');
    if (p.next.start <= year.end_date) {
      throw new AppError('INVALID_INPUT', 'The next year must start after this year ends');
    }
    if (p.next.end <= p.next.start) throw new AppError('INVALID_INPUT', 'The next year must end after it starts');

    // Reuse the next year if it exists and is still open; otherwise create it.
    const existing = await tx.query<{ id: string; status: string; start_date: string; end_date: string }>(
      'SELECT id, status, start_date, end_date FROM financial_years WHERE company_id = $1 AND label = $2 FOR UPDATE',
      [p.companyId, p.next.label],
    );
    let nextYearId: string;
    if (existing[0]) {
      if (existing[0].status !== 'open') throw new AppError('YEAR_BAD_STATE', 'The next year is already closed');
      if (existing[0].start_date !== p.next.start || existing[0].end_date !== p.next.end) {
        throw new AppError('INVALID_INPUT', `Year ${p.next.label} already exists with different dates`);
      }
      nextYearId = existing[0].id;
    } else {
      nextYearId = randomUUID();
      await tx.query(
        `INSERT INTO financial_years(id, company_id, label, start_date, end_date, status) VALUES ($1,$2,$3,$4,$5,'open')`,
        [nextYearId, p.companyId, p.next.label, p.next.start, p.next.end],
      );
    }

    // The ledger that receives the year's profit or loss.
    const found = await tx.query<{ id: string }>(
      'SELECT id FROM ledgers WHERE company_id = $1 AND lower(name) = lower($2)',
      [p.companyId, PL_LEDGER_NAME],
    );
    const carryId = found[0]?.id ?? (await createLedger(tx, { companyId: p.companyId, groupCode: 22, name: PL_LEDGER_NAME }));

    const balances = await ledgerBalances(tx, { companyId: p.companyId, yearId: p.yearId, asOn: year.end_date });
    const netDebit = balances
      .filter((r) => r.nature === 'income' || r.nature === 'expense')
      .reduce((sum, r) => sum + r.balance, 0n); // debit-positive; a profit makes this negative
    const closing = new Map<string, bigint>();
    for (const r of balances) {
      if (r.nature === 'asset' || r.nature === 'liability') closing.set(r.ledgerId, r.balance);
    }
    closing.set(carryId, (closing.get(carryId) ?? 0n) + netDebit);

    // The next year's openings are fully derived: rewrite them from scratch.
    await tx.query(
      `DELETE FROM ledger_openings WHERE year_id = $1 AND ledger_id IN (SELECT id FROM ledgers WHERE company_id = $2)`,
      [nextYearId, p.companyId],
    );
    let carriedLedgers = 0;
    for (const [ledgerId, balance] of closing) {
      if (balance === 0n) continue;
      await setOpening(tx, ledgerId, nextYearId, fromPaise(balance < 0n ? -balance : balance), balance < 0n ? 'Cr' : 'Dr');
      carriedLedgers++;
    }

    await tx.query(`UPDATE financial_years SET status = 'closed' WHERE id = $1`, [p.yearId]);

    const bills = await tx.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM (
         SELECT b.id FROM outstanding_bills b LEFT JOIN bill_adjustments a ON a.bill_id = b.id
         WHERE b.company_id = $1
         GROUP BY b.id HAVING b.original_amount - COALESCE(SUM(a.amount), 0) > 0
       ) pending`,
      [p.companyId],
    );
    const result: CloseYearResult = {
      nextYearId,
      netProfit: fromPaise(-netDebit),
      carriedLedgers,
      carriedBills: bills[0]?.n ?? 0,
    };
    await writeAudit(tx, {
      userId: actor.userId,
      companyId: p.companyId,
      entity: 'financial_year',
      entityId: p.yearId,
      action: 'close_year',
      oldValues: { status: year.status },
      newValues: result,
    });
    return result;
  });
}

export async function reopenYear(db: Db, actor: Actor, companyId: string, yearId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await assertRight(tx, actor, 'utilities', 'edit');
    const year = await lockYearRow(tx, companyId, yearId);
    if (year.status !== 'closed') throw new AppError('YEAR_BAD_STATE', 'Only a closed year can be reopened');
    const later = await tx.query<{ status: string }>(
      `SELECT status FROM financial_years WHERE company_id = $1 AND start_date > $2 AND status <> 'open'`,
      [companyId, year.start_date],
    );
    if (later.length > 0) {
      throw new AppError('YEAR_BAD_STATE', 'A later year is already closed. Reopen that one first.');
    }
    await tx.query(`UPDATE financial_years SET status = 'open' WHERE id = $1`, [yearId]);
    await writeAudit(tx, {
      userId: actor.userId,
      companyId,
      entity: 'financial_year',
      entityId: yearId,
      action: 'reopen_year',
      oldValues: { status: 'closed' },
      newValues: { status: 'open' },
    });
  });
}

export async function lockYear(db: Db, actor: Actor, companyId: string, yearId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await assertRight(tx, actor, 'utilities', 'edit');
    const year = await lockYearRow(tx, companyId, yearId);
    if (year.status !== 'closed') throw new AppError('YEAR_BAD_STATE', 'Only a closed year can be locked');
    await tx.query(`UPDATE financial_years SET status = 'locked' WHERE id = $1`, [yearId]);
    await writeAudit(tx, {
      userId: actor.userId,
      companyId,
      entity: 'financial_year',
      entityId: yearId,
      action: 'lock_year',
      oldValues: { status: 'closed' },
      newValues: { status: 'locked' },
    });
  });
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/service/src/ops`
Expected: PASS — freeze and year-end tests. The `close()` call inside the `lockYear` test after locking must throw `YEAR_BAD_STATE` (the year is locked), not a different error.

- [ ] **Step 5: Commit**

```bash
git add packages/service/src/ops
git commit -m "feat(ops): freeze date and year-end closing with carry-forward" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Backup and restore

**Files:**
- Create: `packages/service/src/ops/backup.ts`
- Test: `packages/service/src/ops/backup.test.ts`

**Interfaces:**
- Consumes: `verifyPassword` (Task 1); `Actor`, `AppError`, `AuthError` (Task 1); `Db`.
- Produces:
  - `interface PgConn { host: string; port: number; user: string; password: string; database: string }`
  - `interface CommandRunner { run(cmd: string, args: string[], env: Record<string, string>): Promise<void> }`
  - `interface BackupConfig { conn: PgConn; dir: string; runner: CommandRunner }`
  - `execRunner(): CommandRunner` (runs real programs with `execFile`; not unit-tested)
  - `backupFileName(now: Date): string` → e.g. `sas-20261020-143005.dump` (UTC)
  - `backupDatabase(cfg: BackupConfig, now?: Date): Promise<string>` → full path of the file
  - `pruneBackups(dir: string, keep: number): Promise<string[]>` → names removed (oldest first); only files named like backups are touched
  - `restoreDatabase(db: Db, cfg: BackupConfig, actor: Actor, adminPassword: string, file: string): Promise<void>` — admin only, re-checks that admin's password, the file must be inside `cfg.dir`

The real `pg_dump` / `pg_restore` programs ship with PostgreSQL and are not available in this development environment, so the tests use a fake runner and check the exact command lines. A real backup/restore round trip is a manual check on a machine with PostgreSQL (Task 12, Step 7).

- [ ] **Step 1: Write the failing test**

`packages/service/src/ops/backup.test.ts`:
```ts
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '@sas/shared';
import type { Db } from '../db/types';
import { createUser } from '../security/users';
import { createTestDb } from '../testing/testDb';
import { backupDatabase, backupFileName, pruneBackups, restoreDatabase, type BackupConfig, type CommandRunner } from './backup';

interface Call {
  cmd: string;
  args: string[];
  env: Record<string, string>;
}

let db: Db;
let dir: string;
let calls: Call[];
let failWith: Error | null;
let cfg: BackupConfig;
let admin: Actor;

beforeEach(async () => {
  db = await createTestDb();
  dir = await mkdtemp(join(tmpdir(), 'sas-backup-'));
  calls = [];
  failWith = null;
  const runner: CommandRunner = {
    async run(cmd, args, env) {
      calls.push({ cmd, args, env });
      if (failWith) throw failWith;
    },
  };
  cfg = { conn: { host: 'localhost', port: 5432, user: 'sas', password: 's3cret', database: 'sasdb' }, dir, runner };
  admin = { userId: await createUser(db, { username: 'boss', password: 'adminpass', isAdmin: true }), username: 'boss', isAdmin: true };
});
afterEach(async () => {
  await db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('backupFileName', () => {
  it('is sortable and uses UTC', () => {
    expect(backupFileName(new Date('2026-10-20T14:30:05Z'))).toBe('sas-20261020-143005.dump');
  });
});

describe('backupDatabase', () => {
  it('runs pg_dump into the backup folder, passing the password only through the environment', async () => {
    const file = await backupDatabase(cfg, new Date('2026-10-20T14:30:05Z'));
    expect(file).toBe(join(dir, 'sas-20261020-143005.dump'));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.cmd).toBe('pg_dump');
    expect(calls[0]?.args).toEqual([
      '--format=custom',
      '--no-owner',
      '--file',
      file,
      '--host',
      'localhost',
      '--port',
      '5432',
      '--username',
      'sas',
      'sasdb',
    ]);
    expect(calls[0]?.env).toEqual({ PGPASSWORD: 's3cret' });
    expect(calls[0]?.args.join(' ')).not.toContain('s3cret');
  });

  it('turns a runner failure into BACKUP_FAILED', async () => {
    failWith = new Error('pg_dump: not found');
    await expect(backupDatabase(cfg)).rejects.toMatchObject({ code: 'BACKUP_FAILED' });
  });
});

describe('pruneBackups', () => {
  it('keeps the newest N backups and leaves other files alone', async () => {
    for (const n of ['sas-20261001-010000.dump', 'sas-20261002-010000.dump', 'sas-20261003-010000.dump', 'sas-20261004-010000.dump', 'notes.txt']) {
      await writeFile(join(dir, n), 'x');
    }
    const removed = await pruneBackups(dir, 2);
    expect(removed).toEqual(['sas-20261001-010000.dump', 'sas-20261002-010000.dump']);
    expect((await readdir(dir)).sort()).toEqual(['notes.txt', 'sas-20261003-010000.dump', 'sas-20261004-010000.dump']);
  });
});

describe('restoreDatabase', () => {
  async function backupFile() {
    const f = join(dir, 'sas-20261020-143005.dump');
    await writeFile(f, 'dump');
    return f;
  }

  it('refuses a wrong password without running anything', async () => {
    const f = await backupFile();
    await expect(restoreDatabase(db, cfg, admin, 'nope', f)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(calls).toHaveLength(0);
  });

  it('refuses a non-admin', async () => {
    const f = await backupFile();
    const clerkId = await createUser(db, { username: 'clerk', password: 'clerkpass' });
    await expect(
      restoreDatabase(db, cfg, { userId: clerkId, username: 'clerk', isAdmin: false }, 'clerkpass', f),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(calls).toHaveLength(0);
  });

  it('refuses a file outside the backup folder', async () => {
    const outside = join(tmpdir(), 'sas-outside.dump');
    await writeFile(outside, 'dump');
    try {
      await expect(restoreDatabase(db, cfg, admin, 'adminpass', outside)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
    } finally {
      await rm(outside, { force: true });
    }
    expect(calls).toHaveLength(0);
  });

  it('reports a missing file', async () => {
    await expect(restoreDatabase(db, cfg, admin, 'adminpass', join(dir, 'sas-19990101-000000.dump'))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('runs pg_restore with the right arguments', async () => {
    const f = await backupFile();
    await restoreDatabase(db, cfg, admin, 'adminpass', f);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.cmd).toBe('pg_restore');
    expect(calls[0]?.args).toEqual([
      '--clean',
      '--if-exists',
      '--no-owner',
      '--host',
      'localhost',
      '--port',
      '5432',
      '--username',
      'sas',
      '--dbname',
      'sasdb',
      f,
    ]);
    expect(calls[0]?.env).toEqual({ PGPASSWORD: 's3cret' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/service/src/ops/backup.test.ts`
Expected: FAIL — cannot find module `./backup`.

- [ ] **Step 3: Write the implementation**

`packages/service/src/ops/backup.ts`:
```ts
import { execFile } from 'node:child_process';
import { access, mkdir, readdir, unlink } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { AppError, AuthError, type Actor } from '@sas/shared';
import type { Db } from '../db/types';
import { verifyPassword } from '../security/passwords';

export interface PgConn {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface CommandRunner {
  run(cmd: string, args: string[], env: Record<string, string>): Promise<void>;
}

export interface BackupConfig {
  conn: PgConn;
  dir: string;
  runner: CommandRunner;
}

const execFileAsync = promisify(execFile);

/** Runs real programs. The password travels in the environment, never on the command line. */
export function execRunner(): CommandRunner {
  return {
    async run(cmd, args, env) {
      await execFileAsync(cmd, args, { env: { ...process.env, ...env } });
    },
  };
}

const BACKUP_NAME = /^sas-\d{8}-\d{6}\.dump$/;

export function backupFileName(now: Date): string {
  const iso = now.toISOString(); // 2026-10-20T14:30:05.123Z
  return `sas-${iso.slice(0, 10).replaceAll('-', '')}-${iso.slice(11, 19).replaceAll(':', '')}.dump`;
}

export async function backupDatabase(cfg: BackupConfig, now: Date = new Date()): Promise<string> {
  await mkdir(cfg.dir, { recursive: true });
  const file = join(cfg.dir, backupFileName(now));
  try {
    await cfg.runner.run(
      'pg_dump',
      [
        '--format=custom',
        '--no-owner',
        '--file',
        file,
        '--host',
        cfg.conn.host,
        '--port',
        String(cfg.conn.port),
        '--username',
        cfg.conn.user,
        cfg.conn.database,
      ],
      { PGPASSWORD: cfg.conn.password },
    );
  } catch (e) {
    throw new AppError('BACKUP_FAILED', `Backup failed: ${(e as Error).message}`);
  }
  return file;
}

/** Delete all but the newest `keep` backup files. Returns the names removed, oldest first. */
export async function pruneBackups(dir: string, keep: number): Promise<string[]> {
  const names = (await readdir(dir)).filter((n) => BACKUP_NAME.test(n)).sort();
  const remove = names.slice(0, Math.max(0, names.length - keep));
  for (const name of remove) await unlink(join(dir, name));
  return remove;
}

export async function restoreDatabase(
  db: Db,
  cfg: BackupConfig,
  actor: Actor,
  adminPassword: string,
  file: string,
): Promise<void> {
  if (!actor.isAdmin) throw new AuthError('FORBIDDEN', 'Only an administrator can restore a backup');
  const rows = await db.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [
    actor.userId,
  ]);
  if (!rows[0] || !(await verifyPassword(adminPassword, rows[0].password_hash))) {
    throw new AuthError('FORBIDDEN', 'Wrong administrator password');
  }
  const root = resolve(cfg.dir) + sep;
  const target = resolve(file);
  if (!target.startsWith(root)) throw new AppError('INVALID_INPUT', 'The backup file must be inside the backup folder');
  try {
    await access(target);
  } catch {
    throw new AppError('NOT_FOUND', 'Backup file not found');
  }
  try {
    await cfg.runner.run(
      'pg_restore',
      [
        '--clean',
        '--if-exists',
        '--no-owner',
        '--host',
        cfg.conn.host,
        '--port',
        String(cfg.conn.port),
        '--username',
        cfg.conn.user,
        '--dbname',
        cfg.conn.database,
        target,
      ],
      { PGPASSWORD: cfg.conn.password },
    );
  } catch (e) {
    throw new AppError('BACKUP_FAILED', `Restore failed: ${(e as Error).message}`);
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/service/src/ops/backup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/service/src/ops/backup.ts packages/service/src/ops/backup.test.ts
git commit -m "feat(ops): backup, pruning and password-gated restore" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: HTTP API — app core, login, vouchers

**Files:**
- Modify: `packages/service/package.json` (new dependencies)
- Create: `packages/service/src/api/types.ts`, `app.ts`, `schemas.ts`, `routes/auth.ts`, `routes/vouchers.ts`
- Create: `packages/service/src/posting/voucherQueries.ts`
- Create: `packages/service/src/testing/apiFixtures.ts`
- Test: `packages/service/src/posting/voucherQueries.test.ts`, `packages/service/src/api/vouchers.api.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–3 and 8 (`BackupConfig`); `saveVoucher/updateVoucher/deleteVoucher` (Plan A); `listPendingBills` (Plan A).
- Produces:
  - `getVoucher(q, voucherId): Promise<VoucherView>` and `listVouchers(q, p): Promise<VoucherSummary[]>` (`posting/voucherQueries.ts`), with
    `VoucherView = { id; companyId; yearId; bookId; kind; voucherNo; date; narration: string | null; version: number; lines: { lineNo; ledgerId; ledgerName; side; amount: string; narration: string | null; adjustments: { billId; amount: string; kind }[] }[] }` and
    `VoucherSummary = { id; voucherNo; date; kind; bookCode; narration: string | null; total: string }`. `listVouchers` params: `{ companyId; yearId; bookId?; from?; to?; limit?; offset?; hiddenGroupIds? }` (limit defaults to 50, capped at 500; newest first; vouchers touching a hidden group are left out).
  - `AppDeps = { db: Db; backup?: BackupConfig; logger?: boolean }`; `buildApp(deps: AppDeps): FastifyInstance`.
  - Routes: `GET /api/health`; `POST /api/login` `{username,password}` → `{token, actor}`; `POST /api/logout` → 204; `GET /api/me` → `{actor, rights, companies}`; `POST /api/vouchers` → 201 `{voucherId, voucherNo}`; `GET /api/vouchers/:id`; `PUT /api/vouchers/:id` body `{version, date, narration?, lines}` → `{version}`; `DELETE /api/vouchers/:id?version=N` → 204; `GET /api/companies/:companyId/vouchers?yearId=&bookId=&from=&to=&limit=&offset=`; `GET /api/companies/:companyId/ledgers/:ledgerId/pending-bills`.
  - Every route except `/api/health` and `/api/login` needs `Authorization: Bearer <token>`.
  - Status codes: `401` not logged in or bad credentials; `403` forbidden or blocked user; `404` not found; `409` stale version or on-account money already used; `400` request body fails validation; `422` any other accounting rule; `500` unexpected.
  - `setupApi(opts?: { backup?: BackupConfig }): Promise<ApiFixture>` with `ApiFixture = { db; app; s: SeededCompany; adminId; adminToken; addUser(username, rights?): Promise<{id; token}>; auth(token): { authorization: string }; close(): Promise<void> }`.

- [ ] **Step 1: Install the dependencies**

Run: `npm install fastify@^5.1.0 zod@^3.24.1 -w @sas/service`
Expected: both appear under `dependencies` in `packages/service/package.json`.

- [ ] **Step 2: Write the failing query tests**

`packages/service/src/posting/voucherQueries.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/types';
import { registerBill } from '../outstanding/billService';
import { seedCompany, type SeededCompany } from '../testing/fixtures';
import { createTestDb } from '../testing/testDb';
import { getVoucher, listVouchers } from './voucherQueries';
import { saveVoucher } from './voucherService';

let db: Db;
let s: SeededCompany;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedCompany(db);
});
afterEach(async () => {
  await db.close();
});

const base = () => ({ companyId: s.companyId, yearId: s.yearId, actorId: null });

describe('getVoucher', () => {
  it('returns header, lines with names and sides, and bill adjustments', async () => {
    const billId = await registerBill(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      ledgerId: s.partyLedgerId,
      billNo: 'S-1',
      billDate: '2026-04-10',
      amount: '500',
      side: 'Dr',
    });
    const { voucherId } = await saveVoucher(db, {
      ...base(),
      bookId: s.cashBookId,
      kind: 'receipt',
      date: '2026-05-10',
      narration: 'part payment',
      lines: [
        {
          ledgerId: s.partyLedgerId,
          side: 'Cr',
          amount: '300.00',
          adjustments: [{ billId, amount: '300.00', kind: 'cash' }],
        },
      ],
    });
    const v = await getVoucher(db, voucherId);
    expect(v).toMatchObject({ voucherNo: 1, date: '2026-05-10', kind: 'receipt', narration: 'part payment', version: 1 });
    expect(v.lines).toEqual([
      {
        lineNo: 1,
        ledgerId: s.partyLedgerId,
        ledgerName: 'Ramesh Traders',
        side: 'Cr',
        amount: '300.00',
        narration: null,
        adjustments: [{ billId, amount: '300.00', kind: 'cash' }],
      },
    ]);
  });

  it('throws NOT_FOUND for an unknown voucher', async () => {
    await expect(getVoucher(db, '00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('listVouchers', () => {
  async function three() {
    for (const [i, date] of ['2026-05-01', '2026-05-02', '2026-05-03'].entries()) {
      await saveVoucher(db, {
        ...base(),
        bookId: s.cashBookId,
        kind: 'receipt',
        date,
        lines: [{ ledgerId: s.partyLedgerId, side: 'Cr', amount: `${(i + 1) * 100}` }],
      });
    }
  }

  it('lists newest first with the total', async () => {
    await three();
    const rows = await listVouchers(db, { companyId: s.companyId, yearId: s.yearId });
    expect(rows.map((r) => [r.voucherNo, r.date, r.total, r.bookCode])).toEqual([
      [3, '2026-05-03', '300.00', 'CB'],
      [2, '2026-05-02', '200.00', 'CB'],
      [1, '2026-05-01', '100.00', 'CB'],
    ]);
  });

  it('filters by date range and pages', async () => {
    await three();
    const p = { companyId: s.companyId, yearId: s.yearId };
    expect((await listVouchers(db, { ...p, from: '2026-05-02', to: '2026-05-02' })).map((r) => r.voucherNo)).toEqual([2]);
    expect((await listVouchers(db, { ...p, limit: 1, offset: 1 })).map((r) => r.voucherNo)).toEqual([2]);
    expect(await listVouchers(db, { ...p, bookId: s.journalBookId })).toEqual([]);
  });

  it('leaves out vouchers that touch a hidden group', async () => {
    await three();
    const g = await db.query<{ id: string }>('SELECT id FROM account_groups WHERE company_id = $1 AND code = 42', [
      s.companyId,
    ]);
    const rows = await listVouchers(db, { companyId: s.companyId, yearId: s.yearId, hiddenGroupIds: [g[0]!.id] });
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run packages/service/src/posting/voucherQueries.test.ts`
Expected: FAIL — cannot find module `./voucherQueries`.

- [ ] **Step 4: Write the voucher queries**

`packages/service/src/posting/voucherQueries.ts`:
```ts
import { AppError, toPaise, type AdjustmentKind, type Side, type VoucherKind } from '@sas/shared';
import type { Queryable } from '../db/types';

export interface VoucherView {
  id: string;
  companyId: string;
  yearId: string;
  bookId: string;
  kind: VoucherKind;
  voucherNo: number;
  date: string;
  narration: string | null;
  version: number;
  lines: {
    lineNo: number;
    ledgerId: string;
    ledgerName: string;
    side: Side;
    amount: string;
    narration: string | null;
    adjustments: { billId: string; amount: string; kind: AdjustmentKind }[];
  }[];
}

export async function getVoucher(q: Queryable, voucherId: string): Promise<VoucherView> {
  const headers = await q.query<{
    id: string;
    company_id: string;
    year_id: string;
    book_id: string;
    kind: VoucherKind;
    voucher_no: number;
    voucher_date: string;
    narration: string | null;
    version: number;
  }>(
    `SELECT id, company_id, year_id, book_id, kind, voucher_no, voucher_date, narration, version
     FROM vouchers WHERE id = $1`,
    [voucherId],
  );
  const v = headers[0];
  if (!v) throw new AppError('NOT_FOUND', 'Voucher not found');

  const lines = await q.query<{
    id: string;
    line_no: number;
    ledger_id: string;
    ledger_name: string;
    debit: string;
    credit: string;
    narration: string | null;
  }>(
    `SELECT vl.id, vl.line_no, vl.ledger_id, l.name AS ledger_name, vl.debit, vl.credit, vl.narration
     FROM voucher_lines vl JOIN ledgers l ON l.id = vl.ledger_id
     WHERE vl.voucher_id = $1 ORDER BY vl.line_no`,
    [voucherId],
  );
  const adjustments = await q.query<{ voucher_line_id: string; bill_id: string; amount: string; kind: AdjustmentKind }>(
    'SELECT voucher_line_id, bill_id, amount, kind FROM bill_adjustments WHERE voucher_id = $1',
    [voucherId],
  );

  return {
    id: v.id,
    companyId: v.company_id,
    yearId: v.year_id,
    bookId: v.book_id,
    kind: v.kind,
    voucherNo: v.voucher_no,
    date: v.voucher_date,
    narration: v.narration,
    version: v.version,
    lines: lines.map((l) => {
      const isDebit = toPaise(l.debit) > 0n;
      return {
        lineNo: l.line_no,
        ledgerId: l.ledger_id,
        ledgerName: l.ledger_name,
        side: isDebit ? 'Dr' : 'Cr',
        amount: isDebit ? l.debit : l.credit,
        narration: l.narration,
        adjustments: adjustments
          .filter((a) => a.voucher_line_id === l.id)
          .map((a) => ({ billId: a.bill_id, amount: a.amount, kind: a.kind })),
      };
    }),
  };
}

export interface VoucherSummary {
  id: string;
  voucherNo: number;
  date: string;
  kind: VoucherKind;
  bookCode: string;
  narration: string | null;
  total: string;
}

export async function listVouchers(
  q: Queryable,
  p: {
    companyId: string;
    yearId: string;
    bookId?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
    hiddenGroupIds?: string[];
  },
): Promise<VoucherSummary[]> {
  const rows = await q.query<{
    id: string;
    voucher_no: number;
    voucher_date: string;
    kind: VoucherKind;
    book_code: string;
    narration: string | null;
    total: string;
  }>(
    `SELECT v.id, v.voucher_no, v.voucher_date, v.kind, b.code AS book_code, v.narration,
            (SELECT COALESCE(SUM(e.debit), 0) FROM ledger_entries e WHERE e.voucher_id = v.id) AS total
     FROM vouchers v JOIN books b ON b.id = v.book_id
     WHERE v.company_id = $1 AND v.year_id = $2
       AND ($3::uuid IS NULL OR v.book_id = $3)
       AND ($4::date IS NULL OR v.voucher_date >= $4)
       AND ($5::date IS NULL OR v.voucher_date <= $5)
       AND NOT EXISTS (
         SELECT 1 FROM voucher_lines vl JOIN ledgers l ON l.id = vl.ledger_id
         WHERE vl.voucher_id = v.id AND l.group_id = ANY($8::uuid[]))
     ORDER BY v.voucher_date DESC, v.voucher_no DESC
     LIMIT $6 OFFSET $7`,
    [
      p.companyId,
      p.yearId,
      p.bookId ?? null,
      p.from ?? null,
      p.to ?? null,
      Math.min(p.limit ?? 50, 500),
      p.offset ?? 0,
      p.hiddenGroupIds ?? [],
    ],
  );
  return rows.map((r) => ({
    id: r.id,
    voucherNo: r.voucher_no,
    date: r.voucher_date,
    kind: r.kind,
    bookCode: r.book_code,
    narration: r.narration,
    total: r.total,
  }));
}
```

- [ ] **Step 5: Run the query tests**

Run: `npx vitest run packages/service/src/posting/voucherQueries.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 6: Write the API test fixture and the failing API tests**

`packages/service/src/testing/apiFixtures.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import { NO_RIGHTS, type ModuleName, type Rights } from '@sas/shared';
import { buildApp } from '../api/app';
import type { Db } from '../db/types';
import type { BackupConfig } from '../ops/backup';
import { setRights } from '../security/rights';
import { createUser, login } from '../security/users';
import { seedCompany, type SeededCompany } from './fixtures';
import { createTestDb } from './testDb';

export interface ApiFixture {
  db: Db;
  app: FastifyInstance;
  s: SeededCompany;
  adminId: string;
  adminToken: string;
  /** A non-admin user; `rights` lists what they may do per module. */
  addUser(
    username: string,
    rights?: Partial<Record<ModuleName, Partial<Rights>>>,
  ): Promise<{ id: string; token: string }>;
  auth(token: string): { authorization: string };
  close(): Promise<void>;
}

export async function setupApi(opts: { backup?: BackupConfig } = {}): Promise<ApiFixture> {
  const db = await createTestDb();
  const s = await seedCompany(db);
  const adminId = await createUser(db, { username: 'boss', password: 'adminpass', isAdmin: true, canExportAudit: true });
  const adminToken = (await login(db, 'boss', 'adminpass')).token;
  const app = buildApp({ db, backup: opts.backup });
  await app.ready();
  return {
    db,
    app,
    s,
    adminId,
    adminToken,
    async addUser(username, rights = {}) {
      const id = await createUser(db, { username, password: 'pass1234' });
      for (const [module, r] of Object.entries(rights)) {
        await setRights(db, id, module as ModuleName, { ...NO_RIGHTS, ...r });
      }
      return { id, token: (await login(db, username, 'pass1234')).token };
    },
    auth: (token) => ({ authorization: `Bearer ${token}` }),
    async close() {
      await app.close();
      await db.close();
    },
  };
}
```

`packages/service/src/api/vouchers.api.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerBill } from '../outstanding/billService';
import { setBlockedGroups, setHiddenCompanies } from '../security/rights';
import { createCompany } from '../masters/companies';
import { setupApi, type ApiFixture } from '../testing/apiFixtures';

let f: ApiFixture;
beforeEach(async () => {
  f = await setupApi();
});
afterEach(async () => {
  await f.close();
});

const receiptBody = (amount = '1000.00', extra: object = {}) => ({
  companyId: f.s.companyId,
  yearId: f.s.yearId,
  bookId: f.s.cashBookId,
  kind: 'receipt',
  date: '2026-05-10',
  lines: [{ ledgerId: f.s.partyLedgerId, side: 'Cr', amount }],
  ...extra,
});

async function post(token: string, payload: object) {
  return f.app.inject({ method: 'POST', url: '/api/vouchers', headers: f.auth(token), payload });
}

describe('authentication', () => {
  it('health needs no login', async () => {
    const r = await f.app.inject({ method: 'GET', url: '/api/health' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true });
  });

  it('everything else needs a token', async () => {
    const r = await f.app.inject({ method: 'GET', url: '/api/me' });
    expect(r.statusCode).toBe(401);
    expect(r.json().code).toBe('NOT_AUTHENTICATED');
    const bad = await f.app.inject({ method: 'GET', url: '/api/me', headers: f.auth('garbage') });
    expect(bad.statusCode).toBe(401);
  });

  it('login rejects bad credentials and accepts good ones; /me shows the user', async () => {
    const bad = await f.app.inject({ method: 'POST', url: '/api/login', payload: { username: 'boss', password: 'x' } });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().code).toBe('BAD_CREDENTIALS');
    const ok = await f.app.inject({ method: 'POST', url: '/api/login', payload: { username: 'boss', password: 'adminpass' } });
    expect(ok.statusCode).toBe(200);
    const me = await f.app.inject({ method: 'GET', url: '/api/me', headers: f.auth(ok.json().token) });
    expect(me.json().actor).toMatchObject({ username: 'boss', isAdmin: true });
    expect(me.json().companies).toHaveLength(1);
    expect(me.json().rights.cash_book).toEqual({ add: false, edit: false, delete: false, print: false, find: false, show: false });
  });

  it('logout kills the token', async () => {
    const out = await f.app.inject({ method: 'POST', url: '/api/logout', headers: f.auth(f.adminToken) });
    expect(out.statusCode).toBe(204);
    const r = await f.app.inject({ method: 'GET', url: '/api/me', headers: f.auth(f.adminToken) });
    expect(r.statusCode).toBe(401);
  });
});

describe('POST /api/vouchers', () => {
  it('an admin saves a receipt', async () => {
    const r = await post(f.adminToken, receiptBody());
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ voucherNo: 1 });
  });

  it('records the signed-in user in the audit log', async () => {
    await post(f.adminToken, receiptBody());
    const rows = await f.db.query<{ user_id: string }>(`SELECT user_id FROM audit_log WHERE entity = 'voucher'`);
    expect(rows[0]?.user_id).toBe(f.adminId);
  });

  it('a user needs the right for the voucher kind', async () => {
    const clerk = await f.addUser('clerk');
    expect((await post(clerk.token, receiptBody())).statusCode).toBe(403);
    const cashier = await f.addUser('cashier', { cash_book: { add: true } });
    expect((await post(cashier.token, receiptBody())).statusCode).toBe(201);
    // cash_book rights do not cover journals
    const journal = {
      companyId: f.s.companyId,
      yearId: f.s.yearId,
      bookId: f.s.journalBookId,
      kind: 'journal',
      date: '2026-05-10',
      lines: [
        { ledgerId: f.s.partyLedgerId, side: 'Dr', amount: '5' },
        { ledgerId: f.s.discountLedgerId, side: 'Cr', amount: '5' },
      ],
    };
    expect((await post(cashier.token, journal)).statusCode).toBe(403);
  });

  it('maps an accounting error to 422 with its code', async () => {
    const r = await post(f.adminToken, {
      companyId: f.s.companyId,
      yearId: f.s.yearId,
      bookId: f.s.journalBookId,
      kind: 'journal',
      date: '2026-05-10',
      lines: [
        { ledgerId: f.s.partyLedgerId, side: 'Dr', amount: '100' },
        { ledgerId: f.s.discountLedgerId, side: 'Cr', amount: '90' },
      ],
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().code).toBe('NOT_BALANCED');
  });

  it('rejects a malformed body with 400', async () => {
    const r = await post(f.adminToken, { ...receiptBody(), lines: [] });
    expect(r.statusCode).toBe(400);
    expect(r.json().code).toBe('INVALID_INPUT');
  });

  it('refuses a hidden company and a ledger in a blocked group', async () => {
    const user = await f.addUser('cashier', { cash_book: { add: true } });
    await setBlockedGroups(f.db, user.id, [
      (await f.db.query<{ id: string }>('SELECT id FROM account_groups WHERE company_id = $1 AND code = 42', [f.s.companyId]))[0]!.id,
    ]);
    expect((await post(user.token, receiptBody())).statusCode).toBe(403);

    const other = await createCompany(f.db, { code: 'C2', name: 'Other', fyLabel: '2026-27', fyStart: '2026-04-01', fyEnd: '2027-03-31' });
    await setHiddenCompanies(f.db, user.id, [other.companyId]);
    expect((await post(user.token, { ...receiptBody(), companyId: other.companyId })).statusCode).toBe(403);
  });
});

describe('GET / PUT / DELETE /api/vouchers/:id', () => {
  async function saved() {
    return (await post(f.adminToken, receiptBody())).json() as { voucherId: string };
  }

  it('reads back what was saved', async () => {
    const { voucherId } = await saved();
    const r = await f.app.inject({ method: 'GET', url: `/api/vouchers/${voucherId}`, headers: f.auth(f.adminToken) });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ voucherNo: 1, version: 1, kind: 'receipt' });
    expect(r.json().lines[0]).toMatchObject({ ledgerName: 'Ramesh Traders', side: 'Cr', amount: '1000.00' });
  });

  it('updates with the right version and refuses a stale one with 409', async () => {
    const { voucherId } = await saved();
    const body = { version: 1, date: '2026-05-11', lines: [{ ledgerId: f.s.partyLedgerId, side: 'Cr', amount: '400.00' }] };
    const ok = await f.app.inject({ method: 'PUT', url: `/api/vouchers/${voucherId}`, headers: f.auth(f.adminToken), payload: body });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ version: 2 });
    const stale = await f.app.inject({ method: 'PUT', url: `/api/vouchers/${voucherId}`, headers: f.auth(f.adminToken), payload: body });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().code).toBe('STALE_VERSION');
  });

  it('deletes, then the voucher is gone', async () => {
    const { voucherId } = await saved();
    const del = await f.app.inject({ method: 'DELETE', url: `/api/vouchers/${voucherId}?version=1`, headers: f.auth(f.adminToken) });
    expect(del.statusCode).toBe(204);
    const gone = await f.app.inject({ method: 'GET', url: `/api/vouchers/${voucherId}`, headers: f.auth(f.adminToken) });
    expect(gone.statusCode).toBe(404);
    expect(gone.json().code).toBe('NOT_FOUND');
  });

  it('edit and delete need their own rights', async () => {
    const { voucherId } = await saved();
    const cashier = await f.addUser('cashier', { cash_book: { add: true, find: true } });
    const get = await f.app.inject({ method: 'GET', url: `/api/vouchers/${voucherId}`, headers: f.auth(cashier.token) });
    expect(get.statusCode).toBe(200);
    const del = await f.app.inject({ method: 'DELETE', url: `/api/vouchers/${voucherId}?version=1`, headers: f.auth(cashier.token) });
    expect(del.statusCode).toBe(403);
  });
});

describe('listing and pending bills', () => {
  it('lists vouchers of a company and year', async () => {
    await post(f.adminToken, receiptBody('100.00'));
    await post(f.adminToken, receiptBody('200.00'));
    const r = await f.app.inject({
      method: 'GET',
      url: `/api/companies/${f.s.companyId}/vouchers?yearId=${f.s.yearId}`,
      headers: f.auth(f.adminToken),
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().map((v: { voucherNo: number }) => v.voucherNo)).toEqual([2, 1]);
  });

  it('lists the pending bills of a ledger', async () => {
    await registerBill(f.db, {
      companyId: f.s.companyId,
      yearId: f.s.yearId,
      ledgerId: f.s.partyLedgerId,
      billNo: 'S-1',
      billDate: '2026-04-10',
      amount: '500',
      side: 'Dr',
    });
    const r = await f.app.inject({
      method: 'GET',
      url: `/api/companies/${f.s.companyId}/ledgers/${f.s.partyLedgerId}/pending-bills`,
      headers: f.auth(f.adminToken),
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject([{ billNo: 'S-1', pending: '500.00', side: 'Dr' }]);
  });
});
```

- [ ] **Step 7: Run the API tests to verify they fail**

Run: `npx vitest run packages/service/src/api/vouchers.api.test.ts`
Expected: FAIL — cannot find module `../api/app` (via `apiFixtures`).

- [ ] **Step 8: Write the API code**

`packages/service/src/api/types.ts`:
```ts
import type { FastifyRequest } from 'fastify';
import type { Actor } from '@sas/shared';
import type { Db } from '../db/types';
import type { BackupConfig } from '../ops/backup';

export interface AppDeps {
  db: Db;
  /** Needed only for the backup and restore routes. */
  backup?: BackupConfig;
  logger?: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor | null;
  }
}

export function bearerToken(req: FastifyRequest): string {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}
```

`packages/service/src/api/schemas.ts`:
```ts
import { z } from 'zod';
import { ADJUSTMENT_KINDS } from '@sas/shared';

export const uuid = z.string().uuid();
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');

const adjustment = z.object({ billId: uuid, amount: z.string(), kind: z.enum(ADJUSTMENT_KINDS) });

export const voucherLine = z.object({
  ledgerId: uuid,
  side: z.enum(['Dr', 'Cr']),
  amount: z.string(),
  narration: z.string().optional(),
  adjustments: z.array(adjustment).optional(),
});

export const saveVoucherBody = z.object({
  companyId: uuid,
  yearId: uuid,
  bookId: uuid,
  kind: z.enum(['receipt', 'payment', 'journal']),
  date: isoDate,
  narration: z.string().optional(),
  lines: z.array(voucherLine).min(1),
});

export const updateVoucherBody = z.object({
  version: z.number().int().positive(),
  date: isoDate,
  narration: z.string().optional(),
  lines: z.array(voucherLine).min(1),
});

export const loginBody = z.object({ username: z.string().min(1), password: z.string().min(1) });
```

`packages/service/src/api/routes/auth.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import { getRights, visibleCompanies } from '../../security/rights';
import { login, logout } from '../../security/users';
import { loginBody } from '../schemas';
import { bearerToken, type AppDeps } from '../types';

export function registerAuthRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.get('/api/health', async () => ({ ok: true }));

  app.post('/api/login', async (req) => {
    const b = loginBody.parse(req.body);
    return login(db, b.username, b.password);
  });

  app.post('/api/logout', async (req, reply) => {
    await logout(db, bearerToken(req));
    return reply.code(204).send();
  });

  app.get('/api/me', async (req) => {
    const actor = req.actor!;
    return { actor, rights: await getRights(db, actor.userId), companies: await visibleCompanies(db, actor) };
  });
}
```

`packages/service/src/api/routes/vouchers.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuthError, type ModuleName, type VoucherKind } from '@sas/shared';
import { listPendingBills } from '../../outstanding/billService';
import { getVoucher, listVouchers } from '../../posting/voucherQueries';
import { deleteVoucher, saveVoucher, updateVoucher } from '../../posting/voucherService';
import { assertCompanyVisible, assertLedgersVisible, assertRight, hiddenGroupIds } from '../../security/rights';
import { isoDate, saveVoucherBody, updateVoucherBody, uuid } from '../schemas';
import type { AppDeps } from '../types';

const moduleFor = (kind: VoucherKind): ModuleName => (kind === 'journal' ? 'journal' : 'cash_book');
const idParam = z.object({ id: uuid });
const companyParam = z.object({ companyId: uuid });
const listQuery = z.object({
  yearId: uuid,
  bookId: uuid.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

export function registerVoucherRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.post('/api/vouchers', async (req, reply) => {
    const b = saveVoucherBody.parse(req.body);
    const actor = req.actor!;
    await assertCompanyVisible(db, actor, b.companyId);
    await assertRight(db, actor, moduleFor(b.kind), 'add');
    await assertLedgersVisible(db, actor, b.companyId, b.lines.map((l) => l.ledgerId));
    const result = await saveVoucher(db, { ...b, actorId: actor.userId });
    return reply.code(201).send(result);
  });

  app.get('/api/vouchers/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const actor = req.actor!;
    const v = await getVoucher(db, id);
    await assertCompanyVisible(db, actor, v.companyId);
    await assertRight(db, actor, moduleFor(v.kind), 'find');
    await assertLedgersVisible(db, actor, v.companyId, v.lines.map((l) => l.ledgerId));
    return v;
  });

  app.put('/api/vouchers/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const b = updateVoucherBody.parse(req.body);
    const actor = req.actor!;
    const v = await getVoucher(db, id);
    await assertCompanyVisible(db, actor, v.companyId);
    await assertRight(db, actor, moduleFor(v.kind), 'edit');
    await assertLedgersVisible(db, actor, v.companyId, [
      ...v.lines.map((l) => l.ledgerId),
      ...b.lines.map((l) => l.ledgerId),
    ]);
    return updateVoucher(db, id, b.version, {
      date: b.date,
      narration: b.narration,
      lines: b.lines,
      actorId: actor.userId,
    });
  });

  app.delete('/api/vouchers/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { version } = z.object({ version: z.coerce.number().int().positive() }).parse(req.query);
    const actor = req.actor!;
    const v = await getVoucher(db, id);
    await assertCompanyVisible(db, actor, v.companyId);
    await assertRight(db, actor, moduleFor(v.kind), 'delete');
    await assertLedgersVisible(db, actor, v.companyId, v.lines.map((l) => l.ledgerId));
    await deleteVoucher(db, id, version, actor.userId);
    return reply.code(204).send();
  });

  app.get('/api/companies/:companyId/vouchers', async (req) => {
    const { companyId } = companyParam.parse(req.params);
    const q = listQuery.parse(req.query);
    const actor = req.actor!;
    await assertCompanyVisible(db, actor, companyId);
    try {
      await assertRight(db, actor, 'cash_book', 'find');
    } catch (e) {
      if (!(e instanceof AuthError)) throw e;
      await assertRight(db, actor, 'journal', 'find');
    }
    return listVouchers(db, { companyId, ...q, hiddenGroupIds: await hiddenGroupIds(db, actor, companyId) });
  });

  app.get('/api/companies/:companyId/ledgers/:ledgerId/pending-bills', async (req) => {
    const { companyId, ledgerId } = z.object({ companyId: uuid, ledgerId: uuid }).parse(req.params);
    const actor = req.actor!;
    await assertCompanyVisible(db, actor, companyId);
    await assertRight(db, actor, 'cash_book', 'find');
    await assertLedgersVisible(db, actor, companyId, [ledgerId]);
    return listPendingBills(db, companyId, ledgerId);
  });
}
```

`packages/service/src/api/app.ts`:
```ts
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError, AuthError, VoucherError } from '@sas/shared';
import { authenticate } from '../security/users';
import { registerAuthRoutes } from './routes/auth';
import { registerVoucherRoutes } from './routes/vouchers';
import { bearerToken, type AppDeps } from './types';

const PUBLIC_PATHS = new Set(['/api/health', '/api/login']);

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: deps.logger ?? false });
  app.decorateRequest('actor', null);

  app.addHook('onRequest', async (req) => {
    const path = req.url.split('?')[0]!;
    if (PUBLIC_PATHS.has(path)) return;
    const token = bearerToken(req);
    const actor = token ? await authenticate(deps.db, token) : null;
    if (!actor) throw new AuthError('NOT_AUTHENTICATED', 'Please log in');
    req.actor = actor;
  });

  app.setErrorHandler((error, req, reply) => {
    const err: unknown = error;
    if (err instanceof AuthError) {
      const status = err.code === 'FORBIDDEN' || err.code === 'USER_BLOCKED' ? 403 : 401;
      return reply.code(status).send({ code: err.code, message: err.message });
    }
    if (err instanceof VoucherError) {
      const status = err.code === 'STALE_VERSION' || err.code === 'ON_ACCOUNT_USED' ? 409 : 422;
      return reply.code(status).send({ code: err.code, message: err.message });
    }
    if (err instanceof AppError) {
      const status = err.code === 'NOT_FOUND' ? 404 : err.code === 'NOT_CONFIGURED' ? 501 : 422;
      return reply.code(status).send({ code: err.code, message: err.message });
    }
    if (err instanceof ZodError) {
      const message = err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
      return reply.code(400).send({ code: 'INVALID_INPUT', message });
    }
    const e = err as { statusCode?: number; code?: string; message?: string };
    if (e.code === '23505' || /duplicate key|unique constraint/i.test(e.message ?? '')) {
      return reply.code(409).send({ code: 'DUPLICATE', message: 'That name or number already exists' });
    }
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      return reply.code(e.statusCode).send({ code: 'BAD_REQUEST', message: e.message ?? 'Bad request' });
    }
    req.log.error(err);
    return reply.code(500).send({ code: 'INTERNAL', message: 'Something went wrong' });
  });

  registerAuthRoutes(app, deps);
  registerVoucherRoutes(app, deps);
  return app;
}
```

- [ ] **Step 9: Run the API tests and the whole suite**

Run: `npx vitest run packages/service/src/api packages/service/src/posting && npm run typecheck`
Expected: PASS and no type errors. Fix real failures before moving on (if `app.inject` replies 500, run the failing test alone and print `r.json()`; the cause is in the server error handler, not the test).

- [ ] **Step 10: Commit**

```bash
git add packages/service package-lock.json
git commit -m "feat(api): Fastify app with login, voucher routes and voucher queries" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: HTTP API — masters and reports

**Files:**
- Modify: `packages/service/src/masters/ledgers.ts`, `packages/service/src/masters/books.ts`, `packages/service/src/api/app.ts`, `packages/service/src/api/schemas.ts`
- Create: `packages/service/src/masters/queries.ts`, `packages/service/src/api/routes/masters.ts`, `packages/service/src/api/routes/reports.ts`
- Test: `packages/service/src/api/masters.api.test.ts`, `packages/service/src/api/reports.api.test.ts`

**Interfaces:**
- Consumes: Tasks 1–9; `createCompany`, `createLedger`, `setOpening`, `createBook` (Plan A); report functions (Tasks 4–6).
- Produces (`masters/queries.ts`, all `(q: Queryable, companyId: string, hiddenGroupIds?: string[])` unless noted):
  - `listYears(q, companyId): Promise<{ id; label; startDate; endDate; status }[]>`
  - `listGroups(q, companyId, hidden?): Promise<{ id; code; name; nature; parentId: string | null }[]>`
  - `listLedgers(q, companyId, hidden?): Promise<{ id; name; groupId; groupCode; groupName; city: string | null; gstin: string | null; status }[]>`
  - `listBooks(q, companyId): Promise<{ id; code; name; type; defaultLedgerId: string | null }[]>`
  - `BOOK_TYPES` (exported from `masters/books.ts`).
- Produces routes (all need a token; reading master lists needs only company visibility, because operators need them to fill entry screens, and blocked groups are filtered out):
  - `GET /api/companies` · `POST /api/companies` (right `company` + `add`; body `{code, name, gstin?, pan?, stateCode?, fyLabel, fyStart, fyEnd}` → 201 `{companyId, yearId}`)
  - `GET /api/companies/:companyId/years | groups | ledgers | books`
  - `POST /api/companies/:companyId/ledgers` (`account_master` + `add`; body `{groupCode, name, code?, address?, city?, stateCode?, gstin?, pan?, creditDays?}` → 201 `{id}`)
  - `POST /api/ledgers/:ledgerId/opening` (`account_master` + `edit`; body `{yearId, amount, side}` → 204; the year must be open)
  - `POST /api/companies/:companyId/books` (`book_master` + `add`; body `{code, name, type, defaultLedgerId?}` → 201 `{id}`)
  - Reports (right `reports` + `find`; query strings): `GET /api/reports/ledger?companyId&yearId&ledgerId&from&to`, `/trial-balance?companyId&yearId&asOn`, `/profit-loss`, `/balance-sheet` (same as trial balance), `/ageing?companyId&asOn[&side&ledgerId]`, `/cash-book?companyId&yearId&bookId&from&to`.
  - Every master create and the opening-balance change write an audit row in the same transaction (the company create is audited right after it commits because `createCompany` owns its transaction).

- [ ] **Step 1: Make two Plan A functions throw API-friendly errors**

In `packages/service/src/masters/ledgers.ts` change the import and the unknown-group throw:
```ts
import { AppError, toPaise, fromPaise } from '@sas/shared';
```
(replacing the `import { toPaise, fromPaise } from '@sas/shared';` line) and
```ts
  if (!group) throw new AppError('INVALID_INPUT', `Unknown account group ${input.groupCode}`);
```
In `packages/service/src/masters/books.ts` replace the `BookType` union with a list, and throw an `AppError`:
```ts
import { randomUUID } from 'node:crypto';
import { AppError } from '@sas/shared';
import type { Queryable } from '../db/types';

export const BOOK_TYPES = [
  'cash',
  'bank',
  'journal',
  'sales',
  'purchase',
  'sales_return',
  'purchase_return',
  'process',
  'production',
  'order',
  'control',
] as const;
export type BookType = (typeof BOOK_TYPES)[number];
```
and in `createBook`:
```ts
    throw new AppError('INVALID_INPUT', 'A cash or bank book needs a default ledger');
```
The Plan A master tests still pass, because they only match the message text.

- [ ] **Step 2: Write the failing API tests**

`packages/service/src/api/masters.api.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setBlockedGroups } from '../security/rights';
import { setupApi, type ApiFixture } from '../testing/apiFixtures';

let f: ApiFixture;
beforeEach(async () => {
  f = await setupApi();
});
afterEach(async () => {
  await f.close();
});

const get = (url: string, token = f.adminToken) => f.app.inject({ method: 'GET', url, headers: f.auth(token) });
const post = (url: string, payload: object, token = f.adminToken) =>
  f.app.inject({ method: 'POST', url, headers: f.auth(token), payload });

describe('lookups', () => {
  it('lists years, groups, ledgers and books of a company', async () => {
    const c = f.s.companyId;
    expect((await get(`/api/companies/${c}/years`)).json()).toMatchObject([{ label: '2026-27', status: 'open', startDate: '2026-04-01' }]);
    expect((await get(`/api/companies/${c}/groups`)).json().length).toBeGreaterThan(20);
    const ledgers = (await get(`/api/companies/${c}/ledgers`)).json() as { name: string; groupCode: number }[];
    expect(ledgers.map((l) => l.name).sort()).toEqual(['Cash', 'Discount', 'Ramesh Traders']);
    expect((await get(`/api/companies/${c}/books`)).json().map((b: { code: string }) => b.code).sort()).toEqual(['CB', 'JV']);
    expect((await get('/api/companies')).json()).toHaveLength(1);
  });

  it('hides ledgers and groups of a blocked group from that user', async () => {
    const user = await f.addUser('clerk');
    const g42 = (await f.db.query<{ id: string }>('SELECT id FROM account_groups WHERE company_id = $1 AND code = 42', [f.s.companyId]))[0]!.id;
    await setBlockedGroups(f.db, user.id, [g42]);
    const ledgers = (await get(`/api/companies/${f.s.companyId}/ledgers`, user.token)).json() as { name: string }[];
    expect(ledgers.map((l) => l.name)).not.toContain('Ramesh Traders');
    const groups = (await get(`/api/companies/${f.s.companyId}/groups`, user.token)).json() as { code: number }[];
    expect(groups.map((g) => g.code)).not.toContain(42);
  });
});

describe('creating masters', () => {
  it('creates a company and audits it', async () => {
    const r = await post('/api/companies', { code: 'C2', name: 'Second Co', fyLabel: '2026-27', fyStart: '2026-04-01', fyEnd: '2027-03-31' });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toHaveProperty('companyId');
    expect((await f.db.query(`SELECT 1 FROM audit_log WHERE entity = 'company' AND action = 'add'`)).length).toBe(1);
  });

  it('creates a ledger with an audit row; a duplicate name is 409; an unknown group is 422', async () => {
    const url = `/api/companies/${f.s.companyId}/ledgers`;
    const ok = await post(url, { groupCode: 42, name: 'Suresh Textiles', city: 'Surat', creditDays: 30 });
    expect(ok.statusCode).toBe(201);
    expect((await f.db.query(`SELECT 1 FROM audit_log WHERE entity = 'ledger' AND entity_id = $1`, [ok.json().id])).length).toBe(1);
    expect((await post(url, { groupCode: 42, name: 'SURESH TEXTILES' })).statusCode).toBe(409);
    const bad = await post(url, { groupCode: 999, name: 'X' });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().code).toBe('INVALID_INPUT');
  });

  it('needs the account_master add right, and not in a blocked group', async () => {
    const url = `/api/companies/${f.s.companyId}/ledgers`;
    const none = await f.addUser('none');
    expect((await post(url, { groupCode: 42, name: 'A' }, none.token)).statusCode).toBe(403);
    const clerk = await f.addUser('clerk', { account_master: { add: true } });
    expect((await post(url, { groupCode: 42, name: 'A' }, clerk.token)).statusCode).toBe(201);
    const g16 = (await f.db.query<{ id: string }>('SELECT id FROM account_groups WHERE company_id = $1 AND code = 16', [f.s.companyId]))[0]!.id;
    await setBlockedGroups(f.db, clerk.id, [g16]);
    expect((await post(url, { groupCode: 16, name: 'B' }, clerk.token)).statusCode).toBe(403);
  });

  it('sets an opening balance only in an open year', async () => {
    const url = `/api/ledgers/${f.s.partyLedgerId}/opening`;
    const ok = await post(url, { yearId: f.s.yearId, amount: '1500.50', side: 'Dr' });
    expect(ok.statusCode).toBe(204);
    const row = await f.db.query<{ amount: string }>('SELECT amount FROM ledger_openings WHERE ledger_id = $1', [f.s.partyLedgerId]);
    expect(row[0]?.amount).toBe('1500.50');
    await f.db.query(`UPDATE financial_years SET status = 'closed' WHERE id = $1`, [f.s.yearId]);
    const closed = await post(url, { yearId: f.s.yearId, amount: '1', side: 'Dr' });
    expect(closed.statusCode).toBe(422);
    expect(closed.json().code).toBe('YEAR_BAD_STATE');
  });

  it('creates books; a cash book needs a ledger; the ledger must be the same company\'s', async () => {
    const url = `/api/companies/${f.s.companyId}/books`;
    expect((await post(url, { code: 'JV2', name: 'Journal 2', type: 'journal' })).statusCode).toBe(201);
    expect((await post(url, { code: 'CB2', name: 'Cash 2', type: 'cash' })).statusCode).toBe(422);
    expect((await post(url, { code: 'CB2', name: 'Cash 2', type: 'cash', defaultLedgerId: f.s.cashLedgerId })).statusCode).toBe(201);
    expect((await post(url, { code: 'X', name: 'X', type: 'nonsense' })).statusCode).toBe(400);
    const other = await post('/api/companies', { code: 'C2', name: 'Second', fyLabel: '2026-27', fyStart: '2026-04-01', fyEnd: '2027-03-31' });
    const foreign = await post(`/api/companies/${other.json().companyId}/books`, {
      code: 'CB', name: 'Cash', type: 'cash', defaultLedgerId: f.s.cashLedgerId,
    });
    expect(foreign.statusCode).toBe(422);
  });
});
```

`packages/service/src/api/reports.api.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setOpening } from '../masters/ledgers';
import { registerBill } from '../outstanding/billService';
import { saveVoucher } from '../posting/voucherService';
import { setBlockedGroups } from '../security/rights';
import { setupApi, type ApiFixture } from '../testing/apiFixtures';

let f: ApiFixture;
beforeEach(async () => {
  f = await setupApi();
  await setOpening(f.db, f.s.cashLedgerId, f.s.yearId, '1000', 'Dr');
  await saveVoucher(f.db, {
    companyId: f.s.companyId,
    yearId: f.s.yearId,
    bookId: f.s.cashBookId,
    kind: 'receipt',
    date: '2026-05-10',
    lines: [{ ledgerId: f.s.partyLedgerId, side: 'Cr', amount: '500' }],
    actorId: null,
  });
  await registerBill(f.db, {
    companyId: f.s.companyId,
    yearId: f.s.yearId,
    ledgerId: f.s.partyLedgerId,
    billNo: 'S-1',
    billDate: '2026-04-10',
    amount: '800',
    side: 'Dr',
  });
});
afterEach(async () => {
  await f.close();
});

const get = (url: string, token = f.adminToken) => f.app.inject({ method: 'GET', url, headers: f.auth(token) });
const q = () => `companyId=${f.s.companyId}&yearId=${f.s.yearId}`;

describe('report routes', () => {
  it('ledger report', async () => {
    const r = await get(`/api/reports/ledger?${q()}&ledgerId=${f.s.cashLedgerId}&from=2026-04-01&to=2026-05-31`);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ ledgerName: 'Cash', closing: { amount: '1500.00', side: 'Dr' } });
  });

  it('trial balance, profit and loss, balance sheet', async () => {
    const tb = await get(`/api/reports/trial-balance?${q()}&asOn=2027-03-31`);
    expect(tb.json()).toMatchObject({ totalDebit: '1500.00', totalCredit: '500.00', difference: '1000.00' });
    expect((await get(`/api/reports/profit-loss?${q()}&asOn=2027-03-31`)).json()).toMatchObject({ netProfit: '0.00' });
    expect((await get(`/api/reports/balance-sheet?${q()}&asOn=2027-03-31`)).statusCode).toBe(200);
  });

  it('ageing', async () => {
    const r = await get(`/api/reports/ageing?companyId=${f.s.companyId}&asOn=2026-12-31`);
    expect(r.json().rows[0]).toMatchObject({ ledgerName: 'Ramesh Traders', total: '800.00', onAccount: '500.00', net: '300.00' });
  });

  it('cash book', async () => {
    const r = await get(`/api/reports/cash-book?${q()}&bookId=${f.s.cashBookId}&from=2026-05-01&to=2026-05-31`);
    expect(r.json()).toEqual([
      {
        date: '2026-05-10',
        opening: { amount: '1000.00', side: 'Dr' },
        receipts: '500.00',
        payments: '0.00',
        closing: { amount: '1500.00', side: 'Dr' },
      },
    ]);
  });

  it('rejects bad dates with 400', async () => {
    const r = await get(`/api/reports/trial-balance?${q()}&asOn=31-03-2027`);
    expect(r.statusCode).toBe(400);
  });
});

describe('report security', () => {
  it('needs the reports find right', async () => {
    const nobody = await f.addUser('nobody');
    expect((await get(`/api/reports/trial-balance?${q()}&asOn=2027-03-31`, nobody.token)).statusCode).toBe(403);
    const viewer = await f.addUser('viewer', { reports: { find: true } });
    expect((await get(`/api/reports/trial-balance?${q()}&asOn=2027-03-31`, viewer.token)).statusCode).toBe(200);
  });

  it('leaves blocked groups out of the reports and refuses their ledger report', async () => {
    const viewer = await f.addUser('viewer', { reports: { find: true } });
    const g42 = (await f.db.query<{ id: string }>('SELECT id FROM account_groups WHERE company_id = $1 AND code = 42', [f.s.companyId]))[0]!.id;
    await setBlockedGroups(f.db, viewer.id, [g42]);
    const tb = (await get(`/api/reports/trial-balance?${q()}&asOn=2027-03-31`, viewer.token)).json() as { rows: { ledgerName: string }[] };
    expect(tb.rows.map((r) => r.ledgerName)).not.toContain('Ramesh Traders');
    const ageing = (await get(`/api/reports/ageing?companyId=${f.s.companyId}&asOn=2026-12-31`, viewer.token)).json();
    expect(ageing.rows).toEqual([]);
    const ledger = await get(`/api/reports/ledger?${q()}&ledgerId=${f.s.partyLedgerId}&from=2026-04-01&to=2026-05-31`, viewer.token);
    expect(ledger.statusCode).toBe(403);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run packages/service/src/api/masters.api.test.ts packages/service/src/api/reports.api.test.ts`
Expected: FAIL — routes answer 404.

- [ ] **Step 4: Write the master queries**

`packages/service/src/masters/queries.ts`:
```ts
import type { Queryable } from '../db/types';

export async function listYears(
  q: Queryable,
  companyId: string,
): Promise<{ id: string; label: string; startDate: string; endDate: string; status: string }[]> {
  const rows = await q.query<{ id: string; label: string; start_date: string; end_date: string; status: string }>(
    'SELECT id, label, start_date, end_date, status FROM financial_years WHERE company_id = $1 ORDER BY start_date',
    [companyId],
  );
  return rows.map((r) => ({ id: r.id, label: r.label, startDate: r.start_date, endDate: r.end_date, status: r.status }));
}

export async function listGroups(
  q: Queryable,
  companyId: string,
  hidden: string[] = [],
): Promise<{ id: string; code: number; name: string; nature: string; parentId: string | null }[]> {
  const rows = await q.query<{ id: string; code: number; name: string; nature: string; parent_id: string | null }>(
    `SELECT id, code, name, nature, parent_id FROM account_groups
     WHERE company_id = $1 AND NOT (id = ANY($2::uuid[])) ORDER BY code`,
    [companyId, hidden],
  );
  return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, nature: r.nature, parentId: r.parent_id }));
}

export async function listLedgers(
  q: Queryable,
  companyId: string,
  hidden: string[] = [],
): Promise<
  { id: string; name: string; groupId: string; groupCode: number; groupName: string; city: string | null; gstin: string | null; status: string }[]
> {
  const rows = await q.query<{
    id: string;
    name: string;
    group_id: string;
    group_code: number;
    group_name: string;
    city: string | null;
    gstin: string | null;
    status: string;
  }>(
    `SELECT l.id, l.name, l.group_id, g.code AS group_code, g.name AS group_name, l.city, l.gstin, l.status
     FROM ledgers l JOIN account_groups g ON g.id = l.group_id
     WHERE l.company_id = $1 AND NOT (l.group_id = ANY($2::uuid[]))
     ORDER BY lower(l.name)`,
    [companyId, hidden],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    groupId: r.group_id,
    groupCode: r.group_code,
    groupName: r.group_name,
    city: r.city,
    gstin: r.gstin,
    status: r.status,
  }));
}

export async function listBooks(
  q: Queryable,
  companyId: string,
): Promise<{ id: string; code: string; name: string; type: string; defaultLedgerId: string | null }[]> {
  const rows = await q.query<{ id: string; code: string; name: string; type: string; default_ledger_id: string | null }>(
    'SELECT id, code, name, type, default_ledger_id FROM books WHERE company_id = $1 ORDER BY code',
    [companyId],
  );
  return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, type: r.type, defaultLedgerId: r.default_ledger_id }));
}
```

- [ ] **Step 5: Add the schemas, then the master and report routes**

Append to `packages/service/src/api/schemas.ts`:
```ts
import { BOOK_TYPES } from '../masters/books';

export const newCompanyBody = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  gstin: z.string().optional(),
  pan: z.string().optional(),
  stateCode: z.string().optional(),
  fyLabel: z.string().min(1),
  fyStart: isoDate,
  fyEnd: isoDate,
});

export const newLedgerBody = z.object({
  groupCode: z.number().int(),
  name: z.string().min(1),
  code: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  stateCode: z.string().optional(),
  gstin: z.string().optional(),
  pan: z.string().optional(),
  creditDays: z.number().int().nonnegative().optional(),
});

export const openingBody = z.object({ yearId: uuid, amount: z.string(), side: z.enum(['Dr', 'Cr']) });

export const newBookBody = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(BOOK_TYPES),
  defaultLedgerId: uuid.optional(),
});
```
(Put the `import { BOOK_TYPES } …` line with the other imports at the top of the file.)

`packages/service/src/api/routes/masters.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, AuthError } from '@sas/shared';
import { createBook } from '../../masters/books';
import { createCompany } from '../../masters/companies';
import { createLedger, setOpening } from '../../masters/ledgers';
import { listBooks, listGroups, listLedgers, listYears } from '../../masters/queries';
import { writeAudit } from '../../security/audit';
import { assertCompanyVisible, assertRight, hiddenGroupIds, visibleCompanies } from '../../security/rights';
import { newBookBody, newCompanyBody, newLedgerBody, openingBody, uuid } from '../schemas';
import type { AppDeps } from '../types';

const companyParam = z.object({ companyId: uuid });

export function registerMasterRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.get('/api/companies', async (req) => visibleCompanies(db, req.actor!));

  app.post('/api/companies', async (req, reply) => {
    const actor = req.actor!;
    await assertRight(db, actor, 'company', 'add');
    const b = newCompanyBody.parse(req.body);
    const ids = await createCompany(db, b);
    await writeAudit(db, {
      userId: actor.userId,
      companyId: ids.companyId,
      entity: 'company',
      entityId: ids.companyId,
      action: 'add',
      newValues: b,
    });
    return reply.code(201).send(ids);
  });

  app.get('/api/companies/:companyId/years', async (req) => {
    const { companyId } = companyParam.parse(req.params);
    await assertCompanyVisible(db, req.actor!, companyId);
    return listYears(db, companyId);
  });

  app.get('/api/companies/:companyId/groups', async (req) => {
    const { companyId } = companyParam.parse(req.params);
    const actor = req.actor!;
    await assertCompanyVisible(db, actor, companyId);
    return listGroups(db, companyId, await hiddenGroupIds(db, actor, companyId));
  });

  app.get('/api/companies/:companyId/ledgers', async (req) => {
    const { companyId } = companyParam.parse(req.params);
    const actor = req.actor!;
    await assertCompanyVisible(db, actor, companyId);
    return listLedgers(db, companyId, await hiddenGroupIds(db, actor, companyId));
  });

  app.get('/api/companies/:companyId/books', async (req) => {
    const { companyId } = companyParam.parse(req.params);
    await assertCompanyVisible(db, req.actor!, companyId);
    return listBooks(db, companyId);
  });

  app.post('/api/companies/:companyId/ledgers', async (req, reply) => {
    const { companyId } = companyParam.parse(req.params);
    const b = newLedgerBody.parse(req.body);
    const actor = req.actor!;
    await assertCompanyVisible(db, actor, companyId);
    await assertRight(db, actor, 'account_master', 'add');
    const hidden = await hiddenGroupIds(db, actor, companyId);
    const id = await db.transaction(async (tx) => {
      const group = await tx.query<{ id: string }>('SELECT id FROM account_groups WHERE company_id = $1 AND code = $2', [
        companyId,
        b.groupCode,
      ]);
      if (group[0] && hidden.includes(group[0].id)) {
        throw new AuthError('FORBIDDEN', 'You do not have access to that account group');
      }
      const ledgerId = await createLedger(tx, { companyId, ...b });
      await writeAudit(tx, {
        userId: actor.userId,
        companyId,
        entity: 'ledger',
        entityId: ledgerId,
        action: 'add',
        newValues: b,
      });
      return ledgerId;
    });
    return reply.code(201).send({ id });
  });

  app.post('/api/ledgers/:ledgerId/opening', async (req, reply) => {
    const { ledgerId } = z.object({ ledgerId: uuid }).parse(req.params);
    const b = openingBody.parse(req.body);
    const actor = req.actor!;
    const ledger = (
      await db.query<{ company_id: string; group_id: string }>('SELECT company_id, group_id FROM ledgers WHERE id = $1', [
        ledgerId,
      ])
    )[0];
    if (!ledger) throw new AppError('NOT_FOUND', 'Ledger not found');
    await assertCompanyVisible(db, actor, ledger.company_id);
    await assertRight(db, actor, 'account_master', 'edit');
    if ((await hiddenGroupIds(db, actor, ledger.company_id)).includes(ledger.group_id)) {
      throw new AuthError('FORBIDDEN', 'You do not have access to this account');
    }
    await db.transaction(async (tx) => {
      const year = await tx.query<{ status: string }>('SELECT status FROM financial_years WHERE id = $1 AND company_id = $2', [
        b.yearId,
        ledger.company_id,
      ]);
      if (!year[0]) throw new AppError('NOT_FOUND', 'Financial year not found');
      if (year[0].status !== 'open') {
        throw new AppError('YEAR_BAD_STATE', 'Opening balances can only be changed in an open year');
      }
      await setOpening(tx, ledgerId, b.yearId, b.amount, b.side);
      await writeAudit(tx, {
        userId: actor.userId,
        companyId: ledger.company_id,
        entity: 'ledger_opening',
        entityId: ledgerId,
        action: 'edit',
        newValues: b,
      });
    });
    return reply.code(204).send();
  });

  app.post('/api/companies/:companyId/books', async (req, reply) => {
    const { companyId } = companyParam.parse(req.params);
    const b = newBookBody.parse(req.body);
    const actor = req.actor!;
    await assertCompanyVisible(db, actor, companyId);
    await assertRight(db, actor, 'book_master', 'add');
    const id = await db.transaction(async (tx) => {
      if (b.defaultLedgerId) {
        const own = await tx.query('SELECT 1 FROM ledgers WHERE id = $1 AND company_id = $2', [b.defaultLedgerId, companyId]);
        if (own.length === 0) throw new AppError('INVALID_INPUT', 'That ledger does not belong to this company');
      }
      const bookId = await createBook(tx, { companyId, ...b });
      await writeAudit(tx, { userId: actor.userId, companyId, entity: 'book', entityId: bookId, action: 'add', newValues: b });
      return bookId;
    });
    return reply.code(201).send({ id });
  });
}
```

`packages/service/src/api/routes/reports.ts`:
```ts
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '@sas/shared';
import { outstandingAgeing } from '../../reports/ageing';
import { balanceSheet, profitAndLoss, trialBalance } from '../../reports/financial';
import { cashBookDaily, ledgerReport } from '../../reports/ledgerReport';
import { assertCompanyVisible, assertLedgersVisible, assertRight, hiddenGroupIds } from '../../security/rights';
import { isoDate, uuid } from '../schemas';
import type { AppDeps } from '../types';

const asOnQuery = z.object({ companyId: uuid, yearId: uuid, asOn: isoDate });

export function registerReportRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** Check company and reports right; return the groups this user must not see. */
  async function prepare(req: FastifyRequest, companyId: string): Promise<string[]> {
    const actor = req.actor!;
    await assertCompanyVisible(db, actor, companyId);
    await assertRight(db, actor, 'reports', 'find');
    return hiddenGroupIds(db, actor, companyId);
  }

  app.get('/api/reports/ledger', async (req) => {
    const p = z
      .object({ companyId: uuid, yearId: uuid, ledgerId: uuid, from: isoDate, to: isoDate })
      .parse(req.query);
    await prepare(req, p.companyId);
    await assertLedgersVisible(db, req.actor!, p.companyId, [p.ledgerId]);
    return ledgerReport(db, p);
  });

  for (const [path, run] of [
    ['trial-balance', trialBalance],
    ['profit-loss', profitAndLoss],
    ['balance-sheet', balanceSheet],
  ] as const) {
    app.get(`/api/reports/${path}`, async (req) => {
      const p = asOnQuery.parse(req.query);
      const hidden = await prepare(req, p.companyId);
      return run(db, { ...p, hiddenGroupIds: hidden });
    });
  }

  app.get('/api/reports/ageing', async (req) => {
    const p = z
      .object({
        companyId: uuid,
        asOn: isoDate,
        side: z.enum(['Dr', 'Cr']).optional(),
        ledgerId: uuid.optional(),
      })
      .parse(req.query);
    const hidden = await prepare(req, p.companyId);
    return outstandingAgeing(db, { ...p, hiddenGroupIds: hidden });
  });

  app.get('/api/reports/cash-book', async (req) => {
    const p = z
      .object({ companyId: uuid, yearId: uuid, bookId: uuid, from: isoDate, to: isoDate })
      .parse(req.query);
    await prepare(req, p.companyId);
    const book = await db.query<{ default_ledger_id: string | null }>(
      'SELECT default_ledger_id FROM books WHERE id = $1 AND company_id = $2',
      [p.bookId, p.companyId],
    );
    if (!book[0]) throw new AppError('NOT_FOUND', 'Book not found');
    if (book[0].default_ledger_id) await assertLedgersVisible(db, req.actor!, p.companyId, [book[0].default_ledger_id]);
    return cashBookDaily(db, p);
  });
}
```

Register both in `packages/service/src/api/app.ts`: add
```ts
import { registerMasterRoutes } from './routes/masters';
import { registerReportRoutes } from './routes/reports';
```
and, after `registerVoucherRoutes(app, deps);`,
```ts
  registerMasterRoutes(app, deps);
  registerReportRoutes(app, deps);
```

- [ ] **Step 6: Run the whole suite**

Run: `npm test && npm run typecheck`
Expected: PASS, no type errors. Notes for failures: a duplicate ledger name must answer `409` (the error handler checks the Postgres unique-violation code or message); in `reports.api.test.ts` the trial balance deliberately does not balance (`difference 1000.00`) because the only opening is the cash ledger's.

- [ ] **Step 7: Commit**

```bash
git add packages/service
git commit -m "feat(api): master data and report routes with rights and hidden-group filtering" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: HTTP API — administration

**Files:**
- Create: `packages/service/src/api/routes/admin.ts`
- Modify: `packages/service/src/api/schemas.ts`, `packages/service/src/api/app.ts`
- Test: `packages/service/src/api/admin.api.test.ts`

**Interfaces:**
- Consumes: Tasks 1–10 (`createUser`, `listUsers`, `setUserStatus`, `setRights`, `getRights`, `setBlockedGroups`, `setHiddenCompanies`, `setFreezeDate`, `closeYear`, `reopenYear`, `lockYear`, `exportAudit`, `backupDatabase`, `pruneBackups`, `restoreDatabase`, `writeAudit`).
- Produces routes (all `users` routes need `users` + the named action; the others need `utilities` or an admin):
  - `POST /api/users` (`users`+`add`; `{username, password, isAdmin?, email?, canExportAudit?}`) → 201 `{id}`
  - `GET /api/users` (`users`+`find`)
  - `PUT /api/users/:id/status` (`users`+`edit`; `{status: 'active'|'blocked'}`) → 204
  - `GET /api/users/:id/rights` (`users`+`find`) · `PUT /api/users/:id/rights` (`users`+`edit`; `{rights: {<module>: {add,edit,delete,print,find,show}}}`) → 204
  - `PUT /api/users/:id/blocked-groups` (`{groupIds: uuid[]}`) · `PUT /api/users/:id/hidden-companies` (`{companyIds: uuid[]}`) → 204 (`users`+`edit`)
  - `POST /api/companies/:companyId/freeze` (`{date: 'YYYY-MM-DD' | null}`) → 204
  - `POST /api/years/:yearId/close` (`{companyId, next: {label, start, end}}`) → result of `closeYear`; `POST /api/years/:yearId/reopen` and `/lock` (`{companyId}`) → 204
  - `GET /api/audit?companyId&from&to&entity` → rows (needs the audit-export right)
  - `POST /api/backup` (`utilities`+`add`) → `{file, removed: string[]}` (keeps the newest 30); `POST /api/restore` (`{file, adminPassword}`) → 204 (admin only)
  - Backup and restore answer `501 NOT_CONFIGURED` when the app was built without `deps.backup`.
  - User, rights, block, hide and status changes write audit rows (`entity 'user'`).

- [ ] **Step 1: Write the failing tests**

`packages/service/src/api/admin.api.test.ts`:
```ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BackupConfig } from '../ops/backup';
import { setupApi, type ApiFixture } from '../testing/apiFixtures';

let f: ApiFixture;
let dir: string;
let calls: { cmd: string; args: string[] }[];
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sas-api-backup-'));
  calls = [];
  const backup: BackupConfig = {
    conn: { host: 'h', port: 5432, user: 'u', password: 'p', database: 'd' },
    dir,
    runner: {
      async run(cmd, args) {
        calls.push({ cmd, args });
        if (cmd === 'pg_dump') await writeFile(args[args.indexOf('--file') + 1]!, 'dump');
      },
    },
  };
  f = await setupApi({ backup });
});
afterEach(async () => {
  await f.close();
  await rm(dir, { recursive: true, force: true });
});

const send = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object, token = f.adminToken) =>
  f.app.inject({ method, url, headers: f.auth(token), payload });

describe('users', () => {
  it('an admin creates a user who can then log in; creation is audited', async () => {
    const r = await send('POST', '/api/users', { username: 'asha', password: 'pass1234', email: 'a@x.in' });
    expect(r.statusCode).toBe(201);
    const login = await f.app.inject({ method: 'POST', url: '/api/login', payload: { username: 'asha', password: 'pass1234' } });
    expect(login.statusCode).toBe(200);
    expect((await f.db.query(`SELECT 1 FROM audit_log WHERE entity = 'user' AND action = 'add'`)).length).toBe(1);
    const list = await send('GET', '/api/users');
    expect(list.json().map((u: { username: string }) => u.username).sort()).toEqual(['asha', 'boss']);
    expect(JSON.stringify(list.json())).not.toContain('scrypt');
  });

  it('a normal user cannot manage users', async () => {
    const clerk = await f.addUser('clerk');
    expect((await send('POST', '/api/users', { username: 'x1', password: 'pass1234' }, clerk.token)).statusCode).toBe(403);
    expect((await send('GET', '/api/users', undefined, clerk.token)).statusCode).toBe(403);
  });

  it('a short password or duplicate username is 422', async () => {
    expect((await send('POST', '/api/users', { username: 'asha', password: '123' })).statusCode).toBe(422);
    await send('POST', '/api/users', { username: 'asha', password: 'pass1234' });
    expect((await send('POST', '/api/users', { username: 'ASHA', password: 'pass1234' })).statusCode).toBe(422);
  });

  it('blocking a user stops their login and kills their token', async () => {
    const clerk = await f.addUser('clerk');
    expect((await send('PUT', `/api/users/${clerk.id}/status`, { status: 'blocked' })).statusCode).toBe(204);
    expect((await send('GET', '/api/me', undefined, clerk.token)).statusCode).toBe(401);
    const login = await f.app.inject({ method: 'POST', url: '/api/login', payload: { username: 'clerk', password: 'pass1234' } });
    expect(login.statusCode).toBe(403);
    expect(login.json().code).toBe('USER_BLOCKED');
  });

  it('sets and reads rights, which then take effect', async () => {
    const clerk = await f.addUser('clerk');
    const body = { rights: { cash_book: { add: true, edit: false, delete: false, print: true, find: true, show: true } } };
    expect((await send('PUT', `/api/users/${clerk.id}/rights`, body)).statusCode).toBe(204);
    const rights = (await send('GET', `/api/users/${clerk.id}/rights`)).json();
    expect(rights.cash_book).toEqual(body.rights.cash_book);
    expect(rights.journal).toEqual({ add: false, edit: false, delete: false, print: false, find: false, show: false });
    const v = await send(
      'POST',
      '/api/vouchers',
      {
        companyId: f.s.companyId,
        yearId: f.s.yearId,
        bookId: f.s.cashBookId,
        kind: 'receipt',
        date: '2026-05-10',
        lines: [{ ledgerId: f.s.partyLedgerId, side: 'Cr', amount: '10' }],
      },
      clerk.token,
    );
    expect(v.statusCode).toBe(201);
    expect((await send('PUT', `/api/users/${clerk.id}/rights`, { rights: { nonsense: body.rights.cash_book } })).statusCode).toBe(400);
  });

  it('sets blocked groups and hidden companies', async () => {
    const clerk = await f.addUser('clerk');
    const g42 = (await f.db.query<{ id: string }>('SELECT id FROM account_groups WHERE company_id = $1 AND code = 42', [f.s.companyId]))[0]!.id;
    expect((await send('PUT', `/api/users/${clerk.id}/blocked-groups`, { groupIds: [g42] })).statusCode).toBe(204);
    expect((await send('PUT', `/api/users/${clerk.id}/hidden-companies`, { companyIds: [f.s.companyId] })).statusCode).toBe(204);
    expect((await send('GET', '/api/me', undefined, clerk.token)).json().companies).toEqual([]);
    expect((await f.db.query(`SELECT 1 FROM audit_log WHERE entity = 'user' AND action = 'edit'`)).length).toBeGreaterThanOrEqual(2);
  });
});

describe('freeze and year-end', () => {
  it('freezing blocks vouchers through the API', async () => {
    expect((await send('POST', `/api/companies/${f.s.companyId}/freeze`, { date: '2026-06-30' })).statusCode).toBe(204);
    const r = await send('POST', '/api/vouchers', {
      companyId: f.s.companyId,
      yearId: f.s.yearId,
      bookId: f.s.cashBookId,
      kind: 'receipt',
      date: '2026-06-01',
      lines: [{ ledgerId: f.s.partyLedgerId, side: 'Cr', amount: '10' }],
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().code).toBe('PERIOD_FROZEN');
    expect((await send('POST', `/api/companies/${f.s.companyId}/freeze`, { date: null })).statusCode).toBe(204);
  });

  it('closes, reopens and locks a year', async () => {
    const next = { label: '2027-28', start: '2027-04-01', end: '2028-03-31' };
    const closed = await send('POST', `/api/years/${f.s.yearId}/close`, { companyId: f.s.companyId, next });
    expect(closed.statusCode).toBe(200);
    expect(closed.json()).toMatchObject({ netProfit: '0.00' });
    expect((await send('POST', `/api/years/${f.s.yearId}/reopen`, { companyId: f.s.companyId })).statusCode).toBe(204);
    await send('POST', `/api/years/${f.s.yearId}/close`, { companyId: f.s.companyId, next });
    expect((await send('POST', `/api/years/${f.s.yearId}/lock`, { companyId: f.s.companyId })).statusCode).toBe(204);
    const again = await send('POST', `/api/years/${f.s.yearId}/reopen`, { companyId: f.s.companyId });
    expect(again.statusCode).toBe(422);
    expect(again.json().code).toBe('YEAR_BAD_STATE');
  });

  it('a user without the utilities right cannot close a year', async () => {
    const clerk = await f.addUser('clerk');
    const next = { label: '2027-28', start: '2027-04-01', end: '2028-03-31' };
    expect((await send('POST', `/api/years/${f.s.yearId}/close`, { companyId: f.s.companyId, next }, clerk.token)).statusCode).toBe(403);
  });
});

describe('audit export', () => {
  it('returns the log to an admin with the export right, and nobody else', async () => {
    await send('POST', '/api/vouchers', {
      companyId: f.s.companyId,
      yearId: f.s.yearId,
      bookId: f.s.cashBookId,
      kind: 'receipt',
      date: '2026-05-10',
      lines: [{ ledgerId: f.s.partyLedgerId, side: 'Cr', amount: '10' }],
    });
    const r = await send('GET', `/api/audit?companyId=${f.s.companyId}&entity=voucher`);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject([{ entity: 'voucher', action: 'add', username: 'boss' }]);
    const clerk = await f.addUser('clerk', { users: { find: true }, reports: { find: true } });
    expect((await send('GET', `/api/audit?companyId=${f.s.companyId}`, undefined, clerk.token)).statusCode).toBe(403);
  });
});

describe('backup and restore', () => {
  it('backs up through the runner and prunes old files', async () => {
    const r = await send('POST', '/api/backup', {});
    expect(r.statusCode).toBe(200);
    expect(r.json().file).toMatch(/sas-\d{8}-\d{6}\.dump$/);
    expect(calls[0]?.cmd).toBe('pg_dump');
  });

  it('restores only with the admin password', async () => {
    const file = (await send('POST', '/api/backup', {})).json().file as string;
    const wrong = await send('POST', '/api/restore', { file, adminPassword: 'nope' });
    expect(wrong.statusCode).toBe(403);
    expect(calls.filter((c) => c.cmd === 'pg_restore')).toHaveLength(0);
    const ok = await send('POST', '/api/restore', { file, adminPassword: 'adminpass' });
    expect(ok.statusCode).toBe(204);
    expect(calls.filter((c) => c.cmd === 'pg_restore')).toHaveLength(1);
  });

  it('a normal user cannot back up or restore', async () => {
    const clerk = await f.addUser('clerk');
    expect((await send('POST', '/api/backup', {}, clerk.token)).statusCode).toBe(403);
    expect((await send('POST', '/api/restore', { file: join(dir, 'x'), adminPassword: 'pass1234' }, clerk.token)).statusCode).toBe(403);
  });
});

describe('backup not configured', () => {
  it('answers 501', async () => {
    const bare = await setupApi();
    try {
      const r = await bare.app.inject({ method: 'POST', url: '/api/backup', headers: bare.auth(bare.adminToken), payload: {} });
      expect(r.statusCode).toBe(501);
      expect(r.json().code).toBe('NOT_CONFIGURED');
    } finally {
      await bare.close();
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/service/src/api/admin.api.test.ts`
Expected: FAIL — routes answer 404.

- [ ] **Step 3: Write the schemas and routes**

Append to `packages/service/src/api/schemas.ts` (add `MODULES` to the existing `@sas/shared` import: `import { ADJUSTMENT_KINDS, MODULES } from '@sas/shared';`):
```ts
export const newUserBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  isAdmin: z.boolean().optional(),
  email: z.string().optional(),
  canExportAudit: z.boolean().optional(),
});

export const statusBody = z.object({ status: z.enum(['active', 'blocked']) });

const rightsShape = z.object({
  add: z.boolean(),
  edit: z.boolean(),
  delete: z.boolean(),
  print: z.boolean(),
  find: z.boolean(),
  show: z.boolean(),
});
export const setRightsBody = z.object({ rights: z.record(z.enum(MODULES), rightsShape) });

export const blockedGroupsBody = z.object({ groupIds: z.array(uuid) });
export const hiddenCompaniesBody = z.object({ companyIds: z.array(uuid) });
export const freezeBody = z.object({ date: isoDate.nullable() });

export const closeYearBody = z.object({
  companyId: uuid,
  next: z.object({ label: z.string().min(1), start: isoDate, end: isoDate }),
});
export const companyBody = z.object({ companyId: uuid });
export const restoreBody = z.object({ file: z.string().min(1), adminPassword: z.string().min(1) });
```

`packages/service/src/api/routes/admin.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, type ModuleName } from '@sas/shared';
import { setFreezeDate } from '../../ops/companyAdmin';
import { backupDatabase, pruneBackups, restoreDatabase, type BackupConfig } from '../../ops/backup';
import { closeYear, lockYear, reopenYear } from '../../ops/yearEnd';
import { exportAudit, writeAudit } from '../../security/audit';
import {
  assertCompanyVisible,
  assertRight,
  getRights,
  setBlockedGroups,
  setHiddenCompanies,
  setRights,
} from '../../security/rights';
import { createUser, listUsers, setUserStatus } from '../../security/users';
import {
  blockedGroupsBody,
  closeYearBody,
  companyBody,
  freezeBody,
  hiddenCompaniesBody,
  isoDate,
  newUserBody,
  restoreBody,
  setRightsBody,
  statusBody,
  uuid,
} from '../schemas';
import type { AppDeps } from '../types';

const idParam = z.object({ id: uuid });
const KEEP_BACKUPS = 30;

export function registerAdminRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  function backupConfig(): BackupConfig {
    if (!deps.backup) throw new AppError('NOT_CONFIGURED', 'Backup is not configured on this server');
    return deps.backup;
  }

  async function auditUser(actorId: string, userId: string, action: string, newValues: unknown): Promise<void> {
    await writeAudit(db, { userId: actorId, companyId: null, entity: 'user', entityId: userId, action, newValues });
  }

  // ---- users ----
  app.post('/api/users', async (req, reply) => {
    const actor = req.actor!;
    await assertRight(db, actor, 'users', 'add');
    const b = newUserBody.parse(req.body);
    const id = await db.transaction(async (tx) => {
      const userId = await createUser(tx, b);
      await writeAudit(tx, {
        userId: actor.userId,
        companyId: null,
        entity: 'user',
        entityId: userId,
        action: 'add',
        newValues: { username: b.username, isAdmin: b.isAdmin ?? false },
      });
      return userId;
    });
    return reply.code(201).send({ id });
  });

  app.get('/api/users', async (req) => {
    await assertRight(db, req.actor!, 'users', 'find');
    return listUsers(db);
  });

  app.put('/api/users/:id/status', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const b = statusBody.parse(req.body);
    const actor = req.actor!;
    await assertRight(db, actor, 'users', 'edit');
    await db.transaction(async (tx) => {
      await setUserStatus(tx, id, b.status);
      await writeAudit(tx, { userId: actor.userId, companyId: null, entity: 'user', entityId: id, action: 'edit', newValues: b });
    });
    return reply.code(204).send();
  });

  app.get('/api/users/:id/rights', async (req) => {
    const { id } = idParam.parse(req.params);
    await assertRight(db, req.actor!, 'users', 'find');
    return getRights(db, id);
  });

  app.put('/api/users/:id/rights', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const b = setRightsBody.parse(req.body);
    const actor = req.actor!;
    await assertRight(db, actor, 'users', 'edit');
    await db.transaction(async (tx) => {
      for (const [module, rights] of Object.entries(b.rights)) {
        await setRights(tx, id, module as ModuleName, rights);
      }
      await writeAudit(tx, { userId: actor.userId, companyId: null, entity: 'user', entityId: id, action: 'edit', newValues: { rights: b.rights } });
    });
    return reply.code(204).send();
  });

  app.put('/api/users/:id/blocked-groups', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const b = blockedGroupsBody.parse(req.body);
    const actor = req.actor!;
    await assertRight(db, actor, 'users', 'edit');
    await setBlockedGroups(db, id, b.groupIds);
    await auditUser(actor.userId, id, 'edit', { blockedGroups: b.groupIds });
    return reply.code(204).send();
  });

  app.put('/api/users/:id/hidden-companies', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const b = hiddenCompaniesBody.parse(req.body);
    const actor = req.actor!;
    await assertRight(db, actor, 'users', 'edit');
    await setHiddenCompanies(db, id, b.companyIds);
    await auditUser(actor.userId, id, 'edit', { hiddenCompanies: b.companyIds });
    return reply.code(204).send();
  });

  // ---- freeze and year-end ----
  app.post('/api/companies/:companyId/freeze', async (req, reply) => {
    const { companyId } = z.object({ companyId: uuid }).parse(req.params);
    const b = freezeBody.parse(req.body);
    await assertCompanyVisible(db, req.actor!, companyId);
    await setFreezeDate(db, req.actor!, companyId, b.date);
    return reply.code(204).send();
  });

  app.post('/api/years/:yearId/close', async (req) => {
    const { yearId } = z.object({ yearId: uuid }).parse(req.params);
    const b = closeYearBody.parse(req.body);
    await assertCompanyVisible(db, req.actor!, b.companyId);
    return closeYear(db, req.actor!, { companyId: b.companyId, yearId, next: b.next });
  });

  app.post('/api/years/:yearId/reopen', async (req, reply) => {
    const { yearId } = z.object({ yearId: uuid }).parse(req.params);
    const b = companyBody.parse(req.body);
    await assertCompanyVisible(db, req.actor!, b.companyId);
    await reopenYear(db, req.actor!, b.companyId, yearId);
    return reply.code(204).send();
  });

  app.post('/api/years/:yearId/lock', async (req, reply) => {
    const { yearId } = z.object({ yearId: uuid }).parse(req.params);
    const b = companyBody.parse(req.body);
    await assertCompanyVisible(db, req.actor!, b.companyId);
    await lockYear(db, req.actor!, b.companyId, yearId);
    return reply.code(204).send();
  });

  // ---- audit ----
  app.get('/api/audit', async (req) => {
    const q = z
      .object({ companyId: uuid, from: isoDate.optional(), to: isoDate.optional(), entity: z.string().optional() })
      .parse(req.query);
    await assertCompanyVisible(db, req.actor!, q.companyId);
    return exportAudit(db, req.actor!, q);
  });

  // ---- backup ----
  app.post('/api/backup', async (req) => {
    const cfg = backupConfig();
    await assertRight(db, req.actor!, 'utilities', 'add');
    const file = await backupDatabase(cfg);
    const removed = await pruneBackups(cfg.dir, KEEP_BACKUPS);
    return { file, removed };
  });

  app.post('/api/restore', async (req, reply) => {
    const cfg = backupConfig();
    const b = restoreBody.parse(req.body);
    await restoreDatabase(db, cfg, req.actor!, b.adminPassword, b.file);
    return reply.code(204).send();
  });
}
```

Register in `packages/service/src/api/app.ts`: add `import { registerAdminRoutes } from './routes/admin';` and, after `registerReportRoutes(app, deps);`,
```ts
  registerAdminRoutes(app, deps);
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test && npm run typecheck`
Expected: PASS, no type errors. Notes: `setRightsBody` with an unknown module name must be a `400` (zod rejects the key); a non-admin hitting `/api/restore` gets `403` from `restoreDatabase` before the file is looked at.

- [ ] **Step 5: Commit**

```bash
git add packages/service
git commit -m "feat(api): user, rights, freeze, year-end, audit and backup routes" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Server entry point, development mode and a real-PostgreSQL concurrency test

**Files:**
- Modify: `packages/service/package.json` (script + `tsx`), `package.json` (root script), `.gitignore`, `packages/service/src/testing/pglite.ts`
- Create: `packages/service/src/server/bootstrap.ts`, `packages/service/src/server/main.ts`
- Modify: `packages/service/src/ops/backup.ts` (add `pgConnFromUrl`)
- Test: `packages/service/src/server/bootstrap.test.ts`, `packages/service/src/ops/pgConn.test.ts`, `packages/service/src/posting/numbering.pg.test.ts`

**Interfaces:**
- Consumes: `buildApp`, `createPgDb`, `migrate`, `createUser`, `execRunner`, `BackupConfig`.
- Produces:
  - `bootstrapAdmin(db: Db, username: string, password: string): Promise<boolean>` — creates the first administrator only when no user exists; returns whether it did.
  - `pgConnFromUrl(url: string): PgConn` — parses `postgres://user:pass@host:port/dbname`.
  - `createPgliteDb(dataDir?: string): Promise<Db>` — a folder path makes it persist (development use only).
  - Environment variables read by `server/main.ts`: `DATABASE_URL` (production PostgreSQL) **or** `SAS_DEV_PGLITE_DIR` (development only, no PostgreSQL needed); `PORT` (default `4100`); `HOST` (default `127.0.0.1`; set `0.0.0.0` on the office server so other PCs can connect); `ADMIN_USERNAME` (default `admin`) and `ADMIN_PASSWORD` (required on first start); `BACKUP_DIR` (enables the backup routes; needs `DATABASE_URL`).

- [ ] **Step 1: Write the failing tests**

`packages/service/src/server/bootstrap.test.ts`:
```ts
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
```

`packages/service/src/ops/pgConn.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { pgConnFromUrl } from './backup';

describe('pgConnFromUrl', () => {
  it('parses a full URL, decoding the password', () => {
    expect(pgConnFromUrl('postgres://sas:p%40ss%2Fw@db.office:6543/sasdb')).toEqual({
      host: 'db.office',
      port: 6543,
      user: 'sas',
      password: 'p@ss/w',
      database: 'sasdb',
    });
  });
  it('defaults the port', () => {
    expect(pgConnFromUrl('postgresql://u:p@localhost/d').port).toBe(5432);
  });
  it('rejects a URL without a database name', () => {
    expect(() => pgConnFromUrl('postgres://u:p@localhost')).toThrow(/database/i);
  });
});
```

`packages/service/src/posting/numbering.pg.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/service/src/server packages/service/src/ops/pgConn.test.ts packages/service/src/posting/numbering.pg.test.ts`
Expected: the first two files FAIL (missing modules); the third reports 1 skipped.

- [ ] **Step 3: Write the implementation**

`packages/service/src/server/bootstrap.ts`:
```ts
import type { Db } from '../db/types';
import { createUser } from '../security/users';

/** On a brand-new installation there is no user yet: create the first administrator. */
export async function bootstrapAdmin(db: Db, username: string, password: string): Promise<boolean> {
  const count = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM users');
  if ((count[0]?.n ?? 0) > 0) return false;
  await createUser(db, { username, password, isAdmin: true, canExportAudit: true });
  return true;
}
```

Append to `packages/service/src/ops/backup.ts`:
```ts
/** postgres://user:pass@host:port/dbname -> connection parts. */
export function pgConnFromUrl(url: string): PgConn {
  const u = new URL(url);
  const database = u.pathname.replace(/^\//, '');
  if (!database) throw new AppError('INVALID_INPUT', 'The database URL has no database name');
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database,
  };
}
```

Replace `packages/service/src/testing/pglite.ts` so it can persist to a folder (development only):
```ts
import { PGlite } from '@electric-sql/pglite';
import type { Db, Queryable } from '../db/types';

/**
 * Postgres compiled to WASM. Tests use it in memory; development mode can pass a folder to keep data.
 * DATE and NUMERIC are returned as strings, like production.
 */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const options = {
    parsers: {
      1082: (v: string) => v, // date
      1700: (v: string) => v, // numeric
    },
  };
  const pg = dataDir ? new PGlite(dataDir, options) : new PGlite(options);
  await pg.waitReady;
  return {
    async query<T>(sql: string, params?: unknown[]) {
      const r = await pg.query<T>(sql, params as any[]);
      return r.rows;
    },
    async exec(sql: string) {
      await pg.exec(sql);
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      return pg.transaction(async (t) =>
        fn({
          async query<R>(sql: string, params?: unknown[]) {
            const r = await t.query<R>(sql, params as any[]);
            return r.rows;
          },
          async exec(sql: string) {
            await t.exec(sql);
          },
        }),
      );
    },
    close: () => pg.close(),
  };
}
```

`packages/service/src/server/main.ts`:
```ts
import { buildApp } from '../api/app';
import { createPgDb } from '../db/pg';
import { migrate } from '../db/migrate';
import type { Db } from '../db/types';
import { execRunner, pgConnFromUrl, type BackupConfig } from '../ops/backup';
import { bootstrapAdmin } from './bootstrap';

async function openDatabase(): Promise<Db> {
  if (process.env.DATABASE_URL) return createPgDb(process.env.DATABASE_URL);
  if (process.env.SAS_DEV_PGLITE_DIR) {
    // Development only: an embedded Postgres, so no installation is needed.
    const { createPgliteDb } = await import('../testing/pglite');
    return createPgliteDb(process.env.SAS_DEV_PGLITE_DIR);
  }
  console.error('Set DATABASE_URL (PostgreSQL) or, for development only, SAS_DEV_PGLITE_DIR.');
  process.exit(1);
}

const db = await openDatabase();
await migrate(db);

const adminPassword = process.env.ADMIN_PASSWORD;
if (adminPassword && (await bootstrapAdmin(db, process.env.ADMIN_USERNAME ?? 'admin', adminPassword))) {
  console.log('Created the first administrator.');
}
const users = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM users');
if ((users[0]?.n ?? 0) === 0) {
  console.error('No users exist yet. Start once with ADMIN_PASSWORD set to create the first administrator.');
  process.exit(1);
}

let backup: BackupConfig | undefined;
if (process.env.BACKUP_DIR && process.env.DATABASE_URL) {
  backup = { conn: pgConnFromUrl(process.env.DATABASE_URL), dir: process.env.BACKUP_DIR, runner: execRunner() };
}

const app = buildApp({ db, backup, logger: true });
const port = Number(process.env.PORT ?? 4100);
const host = process.env.HOST ?? '127.0.0.1';
await app.listen({ port, host });

const stop = async () => {
  await app.close();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
```

In `packages/service/package.json` add under `"devDependencies"`: `"tsx": "^4.19.2"` and add a `"scripts"` block:
```json
  "scripts": {
    "start": "tsx src/server/main.ts"
  },
```
In the root `package.json` `"scripts"` add: `"start:service": "npm run start -w @sas/service"`. Add these lines to `.gitignore`:
```
.devdata/
backups/
```
Then run `npm install` so `tsx` is installed.

- [ ] **Step 4: Run the whole suite and the type-check**

Run: `npm test && npm run typecheck`
Expected: PASS everywhere, with `numbering.pg.test.ts` reported as skipped.

- [ ] **Step 5: Smoke-test the real server (development mode, no PostgreSQL)**

Run in one terminal (it keeps running):
```bash
SAS_DEV_PGLITE_DIR=./.devdata ADMIN_PASSWORD=admin12345 npm run start:service
```
Expected: log lines `Created the first administrator.` and `Server listening at http://127.0.0.1:4100`.

In a second terminal:
```bash
curl -s http://127.0.0.1:4100/api/health
curl -s -X POST http://127.0.0.1:4100/api/login -H "content-type: application/json" -d '{"username":"admin","password":"admin12345"}'
curl -s http://127.0.0.1:4100/api/me
```
Expected: `{"ok":true}`; then a JSON object with `token` and `actor.isAdmin:true`; then `{"code":"NOT_AUTHENTICATED","message":"Please log in"}`. Stop the server with Ctrl+C, restart it, and log in again to confirm the data in `.devdata/` persisted (no "Created the first administrator" line the second time).

- [ ] **Step 6: Optional — run the concurrency test on a real PostgreSQL**

If a PostgreSQL is available, create an empty database named for tests (for example `sas_test`) and run:
```bash
TEST_DATABASE_URL=postgres://postgres:password@localhost:5432/sas_test npx vitest run packages/service/src/posting/numbering.pg.test.ts
```
Expected: PASS — 20 concurrent saves give numbers 1 to 20 with no duplicates. Never point this at a database that holds real data: the test drops the whole `public` schema.

- [ ] **Step 7: Manual check of backup and restore on a real PostgreSQL**

On a machine with PostgreSQL installed (`pg_dump` and `pg_restore` on the PATH), start the server with `DATABASE_URL=… BACKUP_DIR=./backups ADMIN_PASSWORD=… npm run start:service`, then:
```bash
TOKEN=$(curl -s -X POST localhost:4100/api/login -H "content-type: application/json" -d '{"username":"admin","password":"…"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).token")
curl -s -X POST localhost:4100/api/backup -H "authorization: Bearer $TOKEN" -H "content-type: application/json" -d '{}'
```
Expected: `{"file":".../backups/sas-<date>-<time>.dump","removed":[]}` and the file exists. Create a company, then restore with `POST /api/restore {"file":"<that path>","adminPassword":"…"}` and confirm the company is gone. Record the result in the PR description; this step cannot be automated here.

- [ ] **Step 8: Commit and push**

```bash
git add package.json package-lock.json .gitignore packages/service
git commit -m "feat(server): entry point, first-admin bootstrap, dev mode and PostgreSQL concurrency test" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

---

## Self-review against the spec

| Spec requirement | Covered by |
|---|---|
| Users with hashed passwords (5) | Task 1 |
| Rights per module: add, edit, delete, print, find, show-in-menu (5) | Task 2 (`user_rights`, `assertRight`) |
| Block account groups and hide companies, also in reports (5) | Task 2; applied in Tasks 4–6 (`hiddenGroupIds`) and Tasks 9–10 routes |
| Server checks every request (5) | Tasks 9–11: auth hook plus `assertRight`/`assertCompanyVisible`/`assertLedgersVisible` per route |
| Audit log: user, time, old and new values; cannot be edited; separate export right (5) | Task 3 (append-only triggers, `exportAudit`); master and admin audits in Tasks 7, 10, 11 |
| Freeze date (5) | Task 7 `setFreezeDate` (enforcement already in Plan A `assertPostable`) |
| Year-end closing: balances, pending bills, re-runnable until locked (5) | Task 7 `closeYear`/`reopenYear`/`lockYear` |
| Backup and restore with admin password (5) | Task 8 and Task 11 routes |
| Reports: ledger, cash/bank book and rojmel, trial balance, P&L, balance sheet, ageing (4) | Tasks 4–6 |
| Not syncing security tables yet | Deliberate: `users`, `sessions` and `audit_log` carry no change-log triggers; sub-project 5 decides what leaves the office |
| Missing-entry check, journal book listing, main-group merged ledger (4) | Not in this plan (see below) |

**Not in this plan:**
- The desktop app, keyboard-first screens, shortcut registry and Help tab (F1), login screen, installers, CORS/HTTPS decisions for LAN access — **Plan C**.
- Reports from the spec's list that need later sub-projects: stock, mill/job-work, GST (sub-projects 2 to 4).
- From the foundation list, deliberately postponed because no screen needs them yet: the merged main-group ledger (the `main_group_id` column exists but has no table), the missing-entry (numbering gaps) check, the journal-book listing report, and Add/Less ledger auto-posting of discounts.
- A scheduler that calls `POST /api/backup` automatically; the route and pruning exist, scheduling belongs with the installer in Plan C.

**Known limits:**
- Ageing uses today's pending amounts, not the pending amounts on the as-on date.
- Closing stock is not part of the profit and loss or balance sheet until sub-project 2 adds items.
- `createCompany` runs in its own transaction, so its audit row is written just after it commits rather than inside it.
- The real `pg_dump`/`pg_restore` calls and the concurrency test need a real PostgreSQL and are manual checks (Task 12, Steps 6 and 7).

