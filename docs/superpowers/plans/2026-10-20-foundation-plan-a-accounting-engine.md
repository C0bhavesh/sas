# Foundation Plan A: Accounting Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tested core of the accounting system: exact-money type, voucher validation, PostgreSQL schema with change log, company/group/ledger/book masters, the posting engine with safe numbering, and bill-wise outstanding with adjustments and on-account money.

**Architecture:** An npm-workspaces monorepo with two packages for now. `@sas/shared` holds pure TypeScript (money, voucher rules) used by both the service and, later, the desktop app. `@sas/service` holds the database layer and all business rules; every function takes a small `Queryable` interface so the same code runs on real PostgreSQL (`pg`) in production and on PGlite (Postgres compiled to WASM, no install needed) in tests.

**Tech Stack:** Node 24, TypeScript 5, vitest 2, `pg` (production driver), `@electric-sql/pglite` (test database), PostgreSQL SQL (plpgsql triggers, `NUMERIC(18,2)`, UUID keys).

**Design spec:** `docs/superpowers/specs/2026-10-20-accounting-foundation-design.md` (sections 3, 4 and 7).

## Global Constraints

- Language: TypeScript everywhere, `strict` on, ES modules (`"type": "module"`).
- Money: never floating-point. In code use `bigint` paise (`Paise`); in the database use `NUMERIC(18,2)`; in API/JSON use decimal strings such as `"1234.50"`.
- Every table has `id uuid PRIMARY KEY` generated in code (`crypto.randomUUID()`), never auto-numbers, so rows can be synced later. Exceptions: `counters`, `schema_migrations`, `change_log`.
- Every business-data row carries `company_id`; year-bound rows also carry `year_id`.
- A voucher save, edit or delete is exactly one database transaction.
- Voucher numbers come from the `counters` table inside the save transaction; a failed save must not consume a number.
- No business logic in the desktop app (later plan); the service is the only database writer.
- English UI strings and error messages only.
- Dates are `YYYY-MM-DD` strings in code (never JS `Date`); the database date type is parsed to string.
- Commit after every task. Commit messages end with: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## File Structure

```
package.json                         workspaces + scripts
tsconfig.base.json                   shared compiler options
vitest.config.ts                     test discovery
README.md                            one-page project intro
packages/shared/
  package.json  tsconfig.json
  src/index.ts                       re-exports
  src/money.ts                       Paise, toPaise, fromPaise, sumPaise, roundToRupee
  src/errors.ts                      VoucherError + codes
  src/voucher.ts                     voucher/line/adjustment types, buildEntries()
  src/money.test.ts  src/voucher.test.ts
packages/service/
  package.json  tsconfig.json
  src/db/types.ts                    Queryable, Db
  src/db/pg.ts                       production Db over pg.Pool
  src/db/migrate.ts                  migration runner
  src/db/migrations/001_init.sql     full schema + change-log triggers
  src/testing/pglite.ts              Db over PGlite (tests only)
  src/testing/testDb.ts              createTestDb()
  src/testing/fixtures.ts            seedCompany()
  src/db/migrate.test.ts
  src/masters/groups.ts              DEFAULT_GROUPS, seedAccountGroups
  src/masters/companies.ts           createCompany
  src/masters/ledgers.ts             createLedger, setOpening
  src/masters/books.ts               createBook
  src/masters/masters.test.ts
  src/posting/numbering.ts           nextNumber
  src/posting/voucherService.ts      saveVoucher, updateVoucher, deleteVoucher
  src/posting/voucherService.test.ts
  src/outstanding/billService.ts     registerBill, pendingOf, listPendingBills, applyLineAdjustments, removeVoucherBillLinks, applyOnAccount
  src/outstanding/billService.test.ts
```

---

### Task 1: Monorepo scaffold and exact-money type

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `README.md`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`
- Create: `packages/shared/src/money.ts`, `packages/shared/src/index.ts`
- Test: `packages/shared/src/money.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (`@sas/shared`): `type Paise = bigint`; `toPaise(input: string): Paise` (throws `Error` on invalid text); `fromPaise(p: Paise): string` (always two decimals); `sumPaise(values: Paise[]): Paise`; `roundToRupee(p: Paise): Paise` (half away from zero).

- [ ] **Step 1: Create the root files**

`package.json`:
```json
{
  "name": "sas",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p packages/shared && tsc --noEmit -p packages/service"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "types": ["node"]
  }
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
```

`README.md`:
```markdown
# SAS — Textile Accounting Software

Desktop accounting software for Surat textile traders (JSM/Tamana class).

- Feature list: `Accounting_Software_Feature_Spec.md`
- Foundation design: `docs/superpowers/specs/2026-10-20-accounting-foundation-design.md`
- Implementation plans: `docs/superpowers/plans/`

Packages: `packages/shared` (pure rules), `packages/service` (database and business logic).

Run tests: `npm install && npm test`
```

`packages/shared/package.json`:
```json
{
  "name": "@sas/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts"
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

- [ ] **Step 2: Write the failing test**

`packages/shared/src/money.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { fromPaise, roundToRupee, sumPaise, toPaise } from './money';

describe('toPaise', () => {
  it('parses whole and decimal amounts exactly', () => {
    expect(toPaise('123.45')).toBe(12345n);
    expect(toPaise('5')).toBe(500n);
    expect(toPaise('5.5')).toBe(550n);
    expect(toPaise('0.07')).toBe(7n);
  });
  it('parses negatives', () => {
    expect(toPaise('-0.05')).toBe(-5n);
    expect(toPaise('-10')).toBe(-1000n);
  });
  it('rejects bad input', () => {
    expect(() => toPaise('1.234')).toThrow();
    expect(() => toPaise('')).toThrow();
    expect(() => toPaise('abc')).toThrow();
    expect(() => toPaise('1,000')).toThrow();
  });
});

describe('fromPaise', () => {
  it('always prints two decimals', () => {
    expect(fromPaise(12345n)).toBe('123.45');
    expect(fromPaise(500n)).toBe('5.00');
    expect(fromPaise(7n)).toBe('0.07');
    expect(fromPaise(-5n)).toBe('-0.05');
    expect(fromPaise(0n)).toBe('0.00');
  });
});

describe('sumPaise', () => {
  it('adds exactly where floats would not', () => {
    // 0.1 + 0.2 !== 0.3 in floating point
    expect(sumPaise([toPaise('0.10'), toPaise('0.20')])).toBe(toPaise('0.30'));
    expect(sumPaise([])).toBe(0n);
  });
});

describe('roundToRupee', () => {
  it('rounds half away from zero to whole rupees', () => {
    expect(roundToRupee(150n)).toBe(200n);
    expect(roundToRupee(149n)).toBe(100n);
    expect(roundToRupee(-150n)).toBe(-200n);
    expect(roundToRupee(-149n)).toBe(-100n);
    expect(roundToRupee(0n)).toBe(0n);
  });
});
```

- [ ] **Step 3: Install and run the test to verify it fails**

Run: `npm install && npx vitest run packages/shared/src/money.test.ts`
Expected: FAIL — cannot find module `./money`.

- [ ] **Step 4: Write the implementation**

`packages/shared/src/money.ts`:
```ts
export type Paise = bigint;

const AMOUNT_RE = /^-?\d+(\.\d{1,2})?$/;

/** Parse a decimal string such as "123.45" into paise. Throws on anything else. */
export function toPaise(input: string): Paise {
  const s = input.trim();
  if (!AMOUNT_RE.test(s)) throw new Error(`Invalid amount: "${input}"`);
  const neg = s.startsWith('-');
  const [whole, frac = ''] = (neg ? s.slice(1) : s).split('.');
  const paise = BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'));
  return neg ? -paise : paise;
}

/** Format paise as a decimal string with exactly two decimals. */
export function fromPaise(p: Paise): string {
  const neg = p < 0n;
  const abs = neg ? -p : p;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${neg ? '-' : ''}${whole}.${frac}`;
}

export function sumPaise(values: Paise[]): Paise {
  return values.reduce((a, b) => a + b, 0n);
}

/** Round to whole rupees, half away from zero. */
export function roundToRupee(p: Paise): Paise {
  const neg = p < 0n;
  const abs = neg ? -p : p;
  const rounded = ((abs + 50n) / 100n) * 100n;
  return neg ? -rounded : rounded;
}
```

`packages/shared/src/index.ts`:
```ts
export * from './money';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/shared/src/money.test.ts`
Expected: PASS — 4 describe blocks, all tests green.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.base.json vitest.config.ts README.md packages/shared
git commit -m "feat: monorepo scaffold and exact money type" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Voucher rules (pure) — building balanced ledger entries

**Files:**
- Create: `packages/shared/src/errors.ts`, `packages/shared/src/voucher.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/voucher.test.ts`

**Interfaces:**
- Consumes: `toPaise`, `fromPaise`, `sumPaise`, `Paise` from Task 1.
- Produces (`@sas/shared`):
  - `type VoucherKind = 'receipt' | 'payment' | 'journal'`
  - `type Side = 'Dr' | 'Cr'`
  - `const ADJUSTMENT_KINDS = ['cash','discount','rd','rg','claim','bc','interest','close'] as const`; `type AdjustmentKind`
  - `interface BillAdjustmentInput { billId: string; amount: string; kind: AdjustmentKind }`
  - `interface VoucherLineInput { ledgerId: string; side: Side; amount: string; narration?: string; adjustments?: BillAdjustmentInput[] }`
  - `interface LedgerEntry { ledgerId: string; debit: Paise; credit: Paise }`
  - `buildEntries(kind: VoucherKind, bookLedgerId: string | null, lines: VoucherLineInput[]): LedgerEntry[]`
  - `class VoucherError extends Error { code: VoucherErrorCode }` and `type VoucherErrorCode` (all codes used anywhere in this plan).

- [ ] **Step 1: Write the failing test**

`packages/shared/src/voucher.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { VoucherError } from './errors';
import { buildEntries } from './voucher';

const CASH = 'cash-ledger';
const A = 'party-a';
const B = 'party-b';

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as VoucherError).code;
  }
  return undefined;
}

describe('buildEntries — receipt', () => {
  it('credits each party and debits the cash/bank ledger with the total', () => {
    const entries = buildEntries('receipt', CASH, [
      { ledgerId: A, side: 'Cr', amount: '1000.00' },
      { ledgerId: B, side: 'Cr', amount: '250.50' },
    ]);
    expect(entries).toEqual([
      { ledgerId: A, debit: 0n, credit: 100000n },
      { ledgerId: B, debit: 0n, credit: 25050n },
      { ledgerId: CASH, debit: 125050n, credit: 0n },
    ]);
  });
  it('rejects a debit line in a receipt', () => {
    expect(code(() => buildEntries('receipt', CASH, [{ ledgerId: A, side: 'Dr', amount: '10' }]))).toBe('WRONG_SIDE');
  });
  it('needs the book ledger', () => {
    expect(code(() => buildEntries('receipt', null, [{ ledgerId: A, side: 'Cr', amount: '10' }]))).toBe(
      'BOOK_LEDGER_REQUIRED',
    );
  });
});

describe('buildEntries — payment', () => {
  it('debits the party and credits the cash/bank ledger', () => {
    const entries = buildEntries('payment', CASH, [{ ledgerId: A, side: 'Dr', amount: '300' }]);
    expect(entries).toEqual([
      { ledgerId: A, debit: 30000n, credit: 0n },
      { ledgerId: CASH, debit: 0n, credit: 30000n },
    ]);
  });
});

describe('buildEntries — journal', () => {
  it('accepts a balanced journal as entered', () => {
    const entries = buildEntries('journal', null, [
      { ledgerId: A, side: 'Dr', amount: '100.00' },
      { ledgerId: B, side: 'Cr', amount: '60.00' },
      { ledgerId: CASH, side: 'Cr', amount: '40.00' },
    ]);
    expect(entries).toHaveLength(3);
    expect(entries.reduce((s, e) => s + e.debit, 0n)).toBe(entries.reduce((s, e) => s + e.credit, 0n));
  });
  it('rejects an unbalanced journal', () => {
    expect(
      code(() =>
        buildEntries('journal', null, [
          { ledgerId: A, side: 'Dr', amount: '100.00' },
          { ledgerId: B, side: 'Cr', amount: '99.99' },
        ]),
      ),
    ).toBe('NOT_BALANCED');
  });
  it('rejects a one-line journal', () => {
    expect(code(() => buildEntries('journal', null, [{ ledgerId: A, side: 'Dr', amount: '1' }]))).toBe(
      'TOO_FEW_LINES',
    );
  });
});

describe('buildEntries — common checks', () => {
  it('rejects no lines', () => {
    expect(code(() => buildEntries('journal', null, []))).toBe('EMPTY_LINES');
  });
  it('rejects zero, negative and malformed amounts', () => {
    for (const amount of ['0', '0.00', '-5', 'abc', '1.234']) {
      expect(code(() => buildEntries('payment', CASH, [{ ledgerId: A, side: 'Dr', amount }]))).toBe('BAD_AMOUNT');
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/shared/src/voucher.test.ts`
Expected: FAIL — cannot find module `./errors` / `./voucher`.

- [ ] **Step 3: Write the implementation**

`packages/shared/src/errors.ts`:
```ts
export type VoucherErrorCode =
  // pure rules (shared)
  | 'EMPTY_LINES'
  | 'TOO_FEW_LINES'
  | 'BAD_AMOUNT'
  | 'WRONG_SIDE'
  | 'NOT_BALANCED'
  | 'BOOK_LEDGER_REQUIRED'
  // service rules
  | 'BAD_DATE'
  | 'YEAR_NOT_FOUND'
  | 'YEAR_LOCKED'
  | 'DATE_OUT_OF_YEAR'
  | 'PERIOD_FROZEN'
  | 'BOOK_NOT_FOUND'
  | 'BOOK_KIND_MISMATCH'
  | 'LEDGER_INVALID'
  | 'VOUCHER_NOT_FOUND'
  | 'STALE_VERSION'
  | 'ADJUSTMENT_INVALID'
  | 'ADJUSTMENT_EXCEEDS_LINE'
  | 'ON_ACCOUNT_USED';

export class VoucherError extends Error {
  constructor(
    public readonly code: VoucherErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'VoucherError';
  }
}
```

`packages/shared/src/voucher.ts`:
```ts
import { VoucherError } from './errors';
import { fromPaise, sumPaise, toPaise, type Paise } from './money';

export type VoucherKind = 'receipt' | 'payment' | 'journal';
export type Side = 'Dr' | 'Cr';

export const ADJUSTMENT_KINDS = ['cash', 'discount', 'rd', 'rg', 'claim', 'bc', 'interest', 'close'] as const;
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number];

export interface BillAdjustmentInput {
  billId: string;
  amount: string;
  kind: AdjustmentKind;
}

export interface VoucherLineInput {
  ledgerId: string;
  side: Side;
  amount: string;
  narration?: string;
  adjustments?: BillAdjustmentInput[];
}

export interface LedgerEntry {
  ledgerId: string;
  debit: Paise;
  credit: Paise;
}

interface ParsedLine {
  ledgerId: string;
  side: Side;
  amt: Paise;
}

function parseLine(l: VoucherLineInput): ParsedLine {
  let amt: Paise;
  try {
    amt = toPaise(l.amount);
  } catch {
    throw new VoucherError('BAD_AMOUNT', `Invalid amount "${l.amount}"`);
  }
  if (amt <= 0n) throw new VoucherError('BAD_AMOUNT', 'Amount must be greater than zero');
  return { ledgerId: l.ledgerId, side: l.side, amt };
}

function toEntry(p: ParsedLine): LedgerEntry {
  return p.side === 'Dr'
    ? { ledgerId: p.ledgerId, debit: p.amt, credit: 0n }
    : { ledgerId: p.ledgerId, debit: 0n, credit: p.amt };
}

/**
 * Turn what the operator typed into the full double-entry postings.
 * Receipt: party lines are credits, contra debit on the cash/bank ledger.
 * Payment: party lines are debits, contra credit on the cash/bank ledger.
 * Journal: lines as typed, debits must equal credits.
 */
export function buildEntries(
  kind: VoucherKind,
  bookLedgerId: string | null,
  lines: VoucherLineInput[],
): LedgerEntry[] {
  if (lines.length === 0) throw new VoucherError('EMPTY_LINES', 'A voucher needs at least one line');
  const parsed = lines.map(parseLine);

  if (kind === 'journal') {
    if (parsed.length < 2) throw new VoucherError('TOO_FEW_LINES', 'A journal needs at least two lines');
    const dr = sumPaise(parsed.filter((p) => p.side === 'Dr').map((p) => p.amt));
    const cr = sumPaise(parsed.filter((p) => p.side === 'Cr').map((p) => p.amt));
    if (dr !== cr) {
      throw new VoucherError('NOT_BALANCED', `Debits ${fromPaise(dr)} and credits ${fromPaise(cr)} differ`);
    }
    return parsed.map(toEntry);
  }

  if (!bookLedgerId) throw new VoucherError('BOOK_LEDGER_REQUIRED', 'This book has no cash/bank ledger');
  const partySide: Side = kind === 'receipt' ? 'Cr' : 'Dr';
  if (parsed.some((p) => p.side !== partySide)) {
    throw new VoucherError('WRONG_SIDE', `A ${kind} can only have ${partySide} party lines`);
  }
  const total = sumPaise(parsed.map((p) => p.amt));
  const contra: LedgerEntry =
    kind === 'receipt'
      ? { ledgerId: bookLedgerId, debit: total, credit: 0n }
      : { ledgerId: bookLedgerId, debit: 0n, credit: total };
  return [...parsed.map(toEntry), contra];
}
```

`packages/shared/src/index.ts`:
```ts
export * from './money';
export * from './errors';
export * from './voucher';
```

- [ ] **Step 4: Run all shared tests**

Run: `npx vitest run packages/shared`
Expected: PASS — money and voucher tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): voucher rules and balanced entry builder" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Database layer, migrations, schema and change log

**Files:**
- Create: `packages/service/package.json`, `packages/service/tsconfig.json`
- Create: `packages/service/src/db/types.ts`, `packages/service/src/db/pg.ts`, `packages/service/src/db/migrate.ts`
- Create: `packages/service/src/db/migrations/001_init.sql`
- Create: `packages/service/src/testing/pglite.ts`, `packages/service/src/testing/testDb.ts`
- Test: `packages/service/src/db/migrate.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (the service imports `@sas/shared` from Task 4 on).
- Produces (`packages/service/src/db/types.ts`):
  ```ts
  export interface Queryable {
    query<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<T[]>;
    exec(sql: string): Promise<void>;
  }
  export interface Db extends Queryable {
    transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
    close(): Promise<void>;
  }
  ```
  `createPgDb(connectionString: string): Db`, `migrate(db: Db): Promise<void>`, `createPgliteDb(): Promise<Db>`, `createTestDb(): Promise<Db>` (fresh, migrated, in-memory).
  Schema tables used by later tasks — column names exactly as in `001_init.sql` below.

- [ ] **Step 1: Create the service package files**

`packages/service/package.json`:
```json
{
  "name": "@sas/service",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@sas/shared": "*",
    "pg": "^8.13.1"
  },
  "devDependencies": {
    "@electric-sql/pglite": "^0.2.17",
    "@types/pg": "^8.11.10"
  }
}
```

`packages/service/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

Run: `npm install`
Expected: installs `pg`, `@electric-sql/pglite`, links `@sas/shared`.

- [ ] **Step 2: Write the failing test**

`packages/service/src/db/migrate.test.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from './migrate';
import type { Db } from './types';
import { createTestDb } from '../testing/testDb';

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});
afterEach(async () => {
  await db.close();
});

describe('migrate', () => {
  it('creates the schema and records the migration', async () => {
    const tables = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const names = tables.map((t) => t.table_name);
    for (const t of [
      'companies',
      'financial_years',
      'account_groups',
      'ledgers',
      'ledger_openings',
      'books',
      'counters',
      'vouchers',
      'voucher_lines',
      'ledger_entries',
      'outstanding_bills',
      'bill_adjustments',
      'on_account',
      'change_log',
    ]) {
      expect(names).toContain(t);
    }
    const applied = await db.query<{ name: string }>('SELECT name FROM schema_migrations');
    expect(applied.map((a) => a.name)).toContain('001_init.sql');
  });

  it('is safe to run twice', async () => {
    await migrate(db);
    const applied = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM schema_migrations');
    expect(applied[0]?.n).toBe(1);
  });
});

describe('change log', () => {
  it('records insert, update and delete of a synced table', async () => {
    const id = randomUUID();
    await db.query(`INSERT INTO companies(id, code, name) VALUES ($1, 'X', 'X Co')`, [id]);
    await db.query(`UPDATE companies SET name = 'Y Co' WHERE id = $1`, [id]);
    await db.query(`DELETE FROM companies WHERE id = $1`, [id]);
    const rows = await db.query<{ op: string; table_name: string }>(
      `SELECT op, table_name FROM change_log WHERE row_id = $1 ORDER BY id`,
      [id],
    );
    expect(rows.map((r) => r.op)).toEqual(['I', 'U', 'D']);
    expect(rows.every((r) => r.table_name === 'companies')).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run packages/service/src/db/migrate.test.ts`
Expected: FAIL — cannot find module `../testing/testDb`.

- [ ] **Step 4: Write the db interfaces, drivers and runner**

`packages/service/src/db/types.ts`:
```ts
export interface Queryable {
  query<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Run one or more statements with no parameters (used by migrations). */
  exec(sql: string): Promise<void>;
}

export interface Db extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
```

`packages/service/src/db/pg.ts`:
```ts
import pg from 'pg';
import type { Db, Queryable } from './types';

// Return DATE columns as 'YYYY-MM-DD' strings, not JS Date objects.
pg.types.setTypeParser(1082, (v: string) => v);

export function createPgDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString });
  return {
    async query<T>(sql: string, params?: unknown[]) {
      const r = await pool.query(sql, params as any[]);
      return r.rows as T[];
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tx: Queryable = {
          async query<R>(sql: string, params?: unknown[]) {
            const r = await client.query(sql, params as any[]);
            return r.rows as R[];
          },
          async exec(sql: string) {
            await client.query(sql);
          },
        };
        const result = await fn(tx);
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
```

`packages/service/src/db/migrate.ts`:
```ts
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './types';

const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations', import.meta.url));

/** Apply every not-yet-applied .sql file in migrations/, in name order, each in its own transaction. */
export async function migrate(db: Db): Promise<void> {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  const done = await db.query<{ name: string }>('SELECT name FROM schema_migrations');
  const applied = new Set(done.map((r) => r.name));
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
    });
  }
}
```

`packages/service/src/testing/pglite.ts`:
```ts
import { PGlite } from '@electric-sql/pglite';
import type { Db, Queryable } from '../db/types';

/** In-memory Postgres for tests. DATE and NUMERIC are returned as strings, like production. */
export async function createPgliteDb(): Promise<Db> {
  const pg = new PGlite({
    parsers: {
      1082: (v: string) => v, // date
      1700: (v: string) => v, // numeric
    },
  });
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

`packages/service/src/testing/testDb.ts`:
```ts
import { migrate } from '../db/migrate';
import type { Db } from '../db/types';
import { createPgliteDb } from './pglite';

/** A fresh, fully migrated in-memory database. Close it in afterEach. */
export async function createTestDb(): Promise<Db> {
  const db = await createPgliteDb();
  await migrate(db);
  return db;
}
```

- [ ] **Step 5: Write the schema**

`packages/service/src/db/migrations/001_init.sql`:
```sql
-- Foundation schema. All money is NUMERIC(18,2). All business rows have a uuid id generated by the service.

CREATE TABLE companies (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  gstin text,
  pan text,
  state_code text,
  address text,
  freeze_date date,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE financial_years (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  label text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'locked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, label),
  CHECK (end_date > start_date)
);

CREATE TABLE account_groups (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  code int NOT NULL,
  name text NOT NULL,
  nature text NOT NULL CHECK (nature IN ('asset', 'liability', 'income', 'expense')),
  parent_id uuid REFERENCES account_groups(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE TABLE ledgers (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  group_id uuid NOT NULL REFERENCES account_groups(id),
  code text,
  name text NOT NULL,
  alias text,
  address text,
  city text,
  state_code text,
  gstin text,
  pan text,
  credit_days int,
  broker_ledger_id uuid REFERENCES ledgers(id),
  main_group_id uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ledgers_company_name ON ledgers (company_id, lower(name));

CREATE TABLE ledger_openings (
  id uuid PRIMARY KEY,
  ledger_id uuid NOT NULL REFERENCES ledgers(id),
  year_id uuid NOT NULL REFERENCES financial_years(id),
  amount NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
  side text NOT NULL CHECK (side IN ('Dr', 'Cr')),
  UNIQUE (ledger_id, year_id)
);

CREATE TABLE books (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  code text NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN (
    'cash', 'bank', 'journal', 'sales', 'purchase', 'sales_return', 'purchase_return',
    'process', 'production', 'order', 'control')),
  default_ledger_id uuid REFERENCES ledgers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

-- Per book and year voucher counter. Not synced.
CREATE TABLE counters (
  company_id uuid NOT NULL,
  year_id uuid NOT NULL,
  book_id uuid NOT NULL,
  last_no int NOT NULL,
  PRIMARY KEY (company_id, year_id, book_id)
);

CREATE TABLE vouchers (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  year_id uuid NOT NULL REFERENCES financial_years(id),
  book_id uuid NOT NULL REFERENCES books(id),
  kind text NOT NULL CHECK (kind IN ('receipt', 'payment', 'journal')),
  voucher_no int NOT NULL,
  voucher_date date NOT NULL,
  narration text,
  version int NOT NULL DEFAULT 1,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  modified_by uuid,
  modified_at timestamptz,
  UNIQUE (company_id, year_id, book_id, voucher_no)
);

-- What the operator typed.
CREATE TABLE voucher_lines (
  id uuid PRIMARY KEY,
  voucher_id uuid NOT NULL REFERENCES vouchers(id),
  line_no int NOT NULL,
  ledger_id uuid NOT NULL REFERENCES ledgers(id),
  debit NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  narration text,
  CHECK (debit = 0 OR credit = 0)
);

-- The full double-entry postings. Every report reads this table.
CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  year_id uuid NOT NULL REFERENCES financial_years(id),
  voucher_id uuid NOT NULL REFERENCES vouchers(id),
  ledger_id uuid NOT NULL REFERENCES ledgers(id),
  entry_date date NOT NULL,
  debit NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (credit >= 0)
);
CREATE INDEX ledger_entries_ledger_date ON ledger_entries (company_id, ledger_id, entry_date);
CREATE INDEX ledger_entries_voucher ON ledger_entries (voucher_id);

-- A bill that stays outstanding until adjusted. 'side' is the side the bill sits on the party's ledger
-- (a sales bill is Dr on the debtor; a purchase bill is Cr on the creditor).
CREATE TABLE outstanding_bills (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  year_id uuid NOT NULL REFERENCES financial_years(id),
  ledger_id uuid NOT NULL REFERENCES ledgers(id),
  bill_no text NOT NULL,
  bill_date date NOT NULL,
  due_date date,
  original_amount NUMERIC(18,2) NOT NULL CHECK (original_amount > 0),
  side text NOT NULL CHECK (side IN ('Dr', 'Cr')),
  source_voucher_id uuid REFERENCES vouchers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, ledger_id, bill_no, side)
);

-- Money that has not been matched to a bill yet.
CREATE TABLE on_account (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  year_id uuid NOT NULL REFERENCES financial_years(id),
  voucher_id uuid NOT NULL REFERENCES vouchers(id),
  ledger_id uuid NOT NULL REFERENCES ledgers(id),
  side text NOT NULL CHECK (side IN ('Dr', 'Cr')),
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0)
);

-- pending(bill) = original_amount - SUM(bill_adjustments.amount).
-- Either voucher_id/voucher_line_id is set (settled by a voucher line) or on_account_id is set (settled from on-account money).
CREATE TABLE bill_adjustments (
  id uuid PRIMARY KEY,
  bill_id uuid NOT NULL REFERENCES outstanding_bills(id),
  voucher_id uuid REFERENCES vouchers(id),
  voucher_line_id uuid REFERENCES voucher_lines(id),
  on_account_id uuid REFERENCES on_account(id),
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  kind text NOT NULL CHECK (kind IN ('cash', 'discount', 'rd', 'rg', 'claim', 'bc', 'interest', 'close')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((voucher_id IS NOT NULL AND voucher_line_id IS NOT NULL AND on_account_id IS NULL)
      OR (voucher_id IS NULL AND voucher_line_id IS NULL AND on_account_id IS NOT NULL))
);
CREATE INDEX bill_adjustments_bill ON bill_adjustments (bill_id);
CREATE INDEX bill_adjustments_voucher ON bill_adjustments (voucher_id);

-- Change log for the future cloud sync: one row per insert/update/delete of a synced table.
CREATE TABLE change_log (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  op text NOT NULL CHECK (op IN ('I', 'U', 'D')),
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION log_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO change_log(table_name, row_id, op) VALUES (TG_TABLE_NAME, OLD.id, 'D');
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO change_log(table_name, row_id, op) VALUES (TG_TABLE_NAME, NEW.id, 'U');
    RETURN NEW;
  ELSE
    INSERT INTO change_log(table_name, row_id, op) VALUES (TG_TABLE_NAME, NEW.id, 'I');
    RETURN NEW;
  END IF;
END
$$;

CREATE TRIGGER trg_companies_log AFTER INSERT OR UPDATE OR DELETE ON companies FOR EACH ROW EXECUTE FUNCTION log_change();
CREATE TRIGGER trg_financial_years_log AFTER INSERT OR UPDATE OR DELETE ON financial_years FOR EACH ROW EXECUTE FUNCTION log_change();
CREATE TRIGGER trg_account_groups_log AFTER INSERT OR UPDATE OR DELETE ON account_groups FOR EACH ROW EXECUTE FUNCTION log_change();
CREATE TRIGGER trg_ledgers_log AFTER INSERT OR UPDATE OR DELETE ON ledgers FOR EACH ROW EXECUTE FUNCTION log_change();
CREATE TRIGGER trg_ledger_openings_log AFTER INSERT OR UPDATE OR DELETE ON ledger_openings FOR EACH ROW EXECUTE FUNCTION log_change();
CREATE TRIGGER trg_books_log AFTER INSERT OR UPDATE OR DELETE ON books FOR EACH ROW EXECUTE FUNCTION log_change();
CREATE TRIGGER trg_vouchers_log AFTER INSERT OR UPDATE OR DELETE ON vouchers FOR EACH ROW EXECUTE FUNCTION log_change();
CREATE TRIGGER trg_voucher_lines_log AFTER INSERT OR UPDATE OR DELETE ON voucher_lines FOR EACH ROW EXECUTE FUNCTION log_change();
CREATE TRIGGER trg_ledger_entries_log AFTER INSERT OR UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION log_change();
CREATE TRIGGER trg_outstanding_bills_log AFTER INSERT OR UPDATE OR DELETE ON outstanding_bills FOR EACH ROW EXECUTE FUNCTION log_change();
CREATE TRIGGER trg_on_account_log AFTER INSERT OR UPDATE OR DELETE ON on_account FOR EACH ROW EXECUTE FUNCTION log_change();
CREATE TRIGGER trg_bill_adjustments_log AFTER INSERT OR UPDATE OR DELETE ON bill_adjustments FOR EACH ROW EXECUTE FUNCTION log_change();
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run packages/service/src/db/migrate.test.ts`
Expected: PASS — 3 tests (schema created, idempotent, change log I/U/D).

- [ ] **Step 7: Commit**

```bash
git add packages/service package-lock.json
git commit -m "feat(service): database layer, schema and change log" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Masters — company, financial year, groups, ledgers, books

**Files:**
- Create: `packages/service/src/masters/groups.ts`, `companies.ts`, `ledgers.ts`, `books.ts`
- Create: `packages/service/src/testing/fixtures.ts`
- Test: `packages/service/src/masters/masters.test.ts`

**Interfaces:**
- Consumes: `Db`, `Queryable` (Task 3); `Side` (Task 2); `createTestDb` (Task 3).
- Produces:
  - `DEFAULT_GROUPS: { code: number; name: string; nature: 'asset'|'liability'|'income'|'expense'; parentCode?: number }[]`
  - `seedAccountGroups(tx: Queryable, companyId: string): Promise<void>`
  - `createCompany(db: Db, input: NewCompany): Promise<{ companyId: string; yearId: string }>` where `NewCompany = { code: string; name: string; gstin?: string; pan?: string; stateCode?: string; fyLabel: string; fyStart: string; fyEnd: string }`
  - `createLedger(q: Queryable, input: NewLedger): Promise<string>` where `NewLedger = { companyId: string; groupCode: number; name: string; code?: string; address?: string; city?: string; stateCode?: string; gstin?: string; pan?: string; creditDays?: number }`
  - `setOpening(q: Queryable, ledgerId: string, yearId: string, amount: string, side: Side): Promise<void>`
  - `createBook(q: Queryable, input: NewBook): Promise<string>` where `NewBook = { companyId: string; code: string; name: string; type: BookType; defaultLedgerId?: string }`; `BookType` is the union of the types allowed in the `books.type` check.
  - `seedCompany(db: Db): Promise<SeededCompany>` with `SeededCompany = { companyId, yearId, cashLedgerId, partyLedgerId, discountLedgerId, cashBookId, journalBookId }` (all `string`).

- [ ] **Step 1: Write the failing test**

`packages/service/src/masters/masters.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/types';
import { createTestDb } from '../testing/testDb';
import { createBook } from './books';
import { createCompany } from './companies';
import { DEFAULT_GROUPS } from './groups';
import { createLedger, setOpening } from './ledgers';

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});
afterEach(async () => {
  await db.close();
});

async function newCompany() {
  return createCompany(db, {
    code: 'C1',
    name: 'Test Textiles',
    fyLabel: '2026-27',
    fyStart: '2026-04-01',
    fyEnd: '2027-03-31',
  });
}

describe('createCompany', () => {
  it('creates the company, an open year and the standard groups', async () => {
    const { companyId, yearId } = await newCompany();
    const years = await db.query<{ status: string }>('SELECT status FROM financial_years WHERE id = $1', [yearId]);
    expect(years[0]?.status).toBe('open');
    const groups = await db.query<{ code: number }>('SELECT code FROM account_groups WHERE company_id = $1', [
      companyId,
    ]);
    expect(groups).toHaveLength(DEFAULT_GROUPS.length);
    const debtors = await db.query<{ nature: string }>(
      'SELECT nature FROM account_groups WHERE company_id = $1 AND code = 42',
      [companyId],
    );
    expect(debtors[0]?.nature).toBe('asset');
  });

  it('links Creditors-for-Others (34) under Sundry Creditors (35)', async () => {
    const { companyId } = await newCompany();
    const rows = await db.query<{ parent_code: number }>(
      `SELECT p.code AS parent_code FROM account_groups c JOIN account_groups p ON p.id = c.parent_id
       WHERE c.company_id = $1 AND c.code = 34`,
      [companyId],
    );
    expect(rows[0]?.parent_code).toBe(35);
  });

  it('rejects a duplicate company code', async () => {
    await newCompany();
    await expect(newCompany()).rejects.toThrow();
  });
});

describe('createLedger / setOpening', () => {
  it('creates a ledger under a group and stores an opening balance', async () => {
    const { companyId, yearId } = await newCompany();
    const ledgerId = await createLedger(db, { companyId, groupCode: 42, name: 'Ramesh Traders', city: 'Surat' });
    await setOpening(db, ledgerId, yearId, '1500.50', 'Dr');
    const rows = await db.query<{ amount: string; side: string }>(
      'SELECT amount, side FROM ledger_openings WHERE ledger_id = $1',
      [ledgerId],
    );
    expect(rows[0]).toEqual({ amount: '1500.50', side: 'Dr' });
  });

  it('setOpening twice replaces the earlier value', async () => {
    const { companyId, yearId } = await newCompany();
    const ledgerId = await createLedger(db, { companyId, groupCode: 42, name: 'A' });
    await setOpening(db, ledgerId, yearId, '10', 'Dr');
    await setOpening(db, ledgerId, yearId, '20', 'Cr');
    const rows = await db.query<{ amount: string; side: string }>(
      'SELECT amount, side FROM ledger_openings WHERE ledger_id = $1',
      [ledgerId],
    );
    expect(rows).toEqual([{ amount: '20.00', side: 'Cr' }]);
  });

  it('rejects an unknown group and a duplicate name (case-insensitive)', async () => {
    const { companyId } = await newCompany();
    await expect(createLedger(db, { companyId, groupCode: 999, name: 'X' })).rejects.toThrow(/group/i);
    await createLedger(db, { companyId, groupCode: 42, name: 'Ramesh' });
    await expect(createLedger(db, { companyId, groupCode: 42, name: 'RAMESH' })).rejects.toThrow();
  });
});

describe('createBook', () => {
  it('requires a default ledger for cash and bank books', async () => {
    const { companyId } = await newCompany();
    await expect(createBook(db, { companyId, code: 'CB', name: 'Cash Book', type: 'cash' })).rejects.toThrow(
      /ledger/i,
    );
    const cash = await createLedger(db, { companyId, groupCode: 16, name: 'Cash' });
    const id = await createBook(db, { companyId, code: 'CB', name: 'Cash Book', type: 'cash', defaultLedgerId: cash });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('creates a journal book without a ledger', async () => {
    const { companyId } = await newCompany();
    const id = await createBook(db, { companyId, code: 'JV', name: 'Journal', type: 'journal' });
    expect(id).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/service/src/masters/masters.test.ts`
Expected: FAIL — cannot find module `./books`.

- [ ] **Step 3: Write the implementation**

`packages/service/src/masters/groups.ts`:
```ts
import { randomUUID } from 'node:crypto';
import type { Queryable } from '../db/types';

export type Nature = 'asset' | 'liability' | 'income' | 'expense';

export interface DefaultGroup {
  code: number;
  name: string;
  nature: Nature;
  parentCode?: number;
}

// Standard group list taken from the JSM feature spec, section 2.2.
export const DEFAULT_GROUPS: DefaultGroup[] = [
  { code: 1, name: 'Fixed Assets', nature: 'asset' },
  { code: 2, name: 'Investments', nature: 'asset' },
  { code: 3, name: 'Current Assets', nature: 'asset' },
  { code: 4, name: 'Misc. Expenses (Assets)', nature: 'asset' },
  { code: 5, name: 'Capital Account', nature: 'liability' },
  { code: 6, name: 'Current Liabilities', nature: 'liability' },
  { code: 7, name: 'Loan (Liabilities)', nature: 'liability' },
  { code: 8, name: 'Suspense Account', nature: 'liability' },
  { code: 9, name: 'Branch / Division', nature: 'liability' },
  { code: 16, name: 'Cash-in-Hand', nature: 'asset' },
  { code: 17, name: 'Bank Balance', nature: 'asset' },
  { code: 19, name: 'Loan & Advance (Assets)', nature: 'asset' },
  { code: 21, name: 'Stock-in-Hand', nature: 'asset' },
  { code: 22, name: 'Reserves & Surplus', nature: 'liability' },
  { code: 23, name: 'Duties & Taxes', nature: 'liability' },
  { code: 24, name: 'Provisions', nature: 'liability' },
  { code: 26, name: 'Bank O/D Account', nature: 'liability' },
  { code: 27, name: 'Secured Loans', nature: 'liability' },
  { code: 28, name: 'Unsecured Loan', nature: 'liability' },
  { code: 29, name: 'Trading Income', nature: 'income' },
  { code: 30, name: 'Profit & Loss Income', nature: 'income' },
  { code: 31, name: 'Trading Expense', nature: 'expense' },
  { code: 32, name: 'Profit & Loss Expense', nature: 'expense' },
  { code: 35, name: 'Sundry Creditors', nature: 'liability' },
  { code: 34, name: 'Creditors for Others', nature: 'liability', parentCode: 35 },
  { code: 38, name: 'Creditors for Process', nature: 'liability', parentCode: 35 },
  { code: 39, name: 'Creditors for Brokerage', nature: 'liability', parentCode: 35 },
  { code: 40, name: 'Creditors for Salary', nature: 'liability', parentCode: 35 },
  { code: 48, name: 'Creditors for Jobwork', nature: 'liability', parentCode: 35 },
  { code: 41, name: 'Debtors for Others', nature: 'asset' },
  { code: 42, name: 'Sundry Debtors', nature: 'asset' },
  { code: 56, name: 'TDS on Process', nature: 'expense' },
];

/** Insert the standard groups for a new company. Parents are listed before their children. */
export async function seedAccountGroups(tx: Queryable, companyId: string): Promise<void> {
  const idByCode = new Map<number, string>();
  for (const g of DEFAULT_GROUPS) {
    const id = randomUUID();
    idByCode.set(g.code, id);
    const parentId = g.parentCode === undefined ? null : (idByCode.get(g.parentCode) ?? null);
    await tx.query(
      `INSERT INTO account_groups(id, company_id, code, name, nature, parent_id) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, companyId, g.code, g.name, g.nature, parentId],
    );
  }
}
```

`packages/service/src/masters/companies.ts`:
```ts
import { randomUUID } from 'node:crypto';
import type { Db } from '../db/types';
import { seedAccountGroups } from './groups';

export interface NewCompany {
  code: string;
  name: string;
  gstin?: string;
  pan?: string;
  stateCode?: string;
  fyLabel: string;
  fyStart: string;
  fyEnd: string;
}

/** Create a company, its first (open) financial year and the standard account groups — atomically. */
export async function createCompany(db: Db, input: NewCompany): Promise<{ companyId: string; yearId: string }> {
  return db.transaction(async (tx) => {
    const companyId = randomUUID();
    const yearId = randomUUID();
    await tx.query(`INSERT INTO companies(id, code, name, gstin, pan, state_code) VALUES ($1,$2,$3,$4,$5,$6)`, [
      companyId,
      input.code,
      input.name,
      input.gstin ?? null,
      input.pan ?? null,
      input.stateCode ?? null,
    ]);
    await tx.query(
      `INSERT INTO financial_years(id, company_id, label, start_date, end_date, status) VALUES ($1,$2,$3,$4,$5,'open')`,
      [yearId, companyId, input.fyLabel, input.fyStart, input.fyEnd],
    );
    await seedAccountGroups(tx, companyId);
    return { companyId, yearId };
  });
}
```

`packages/service/src/masters/ledgers.ts`:
```ts
import { randomUUID } from 'node:crypto';
import type { Side } from '@sas/shared';
import { toPaise, fromPaise } from '@sas/shared';
import type { Queryable } from '../db/types';

export interface NewLedger {
  companyId: string;
  groupCode: number;
  name: string;
  code?: string;
  address?: string;
  city?: string;
  stateCode?: string;
  gstin?: string;
  pan?: string;
  creditDays?: number;
}

export async function createLedger(q: Queryable, input: NewLedger): Promise<string> {
  const groups = await q.query<{ id: string }>('SELECT id FROM account_groups WHERE company_id = $1 AND code = $2', [
    input.companyId,
    input.groupCode,
  ]);
  const group = groups[0];
  if (!group) throw new Error(`Unknown account group ${input.groupCode}`);
  const id = randomUUID();
  await q.query(
    `INSERT INTO ledgers(id, company_id, group_id, code, name, address, city, state_code, gstin, pan, credit_days)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      id,
      input.companyId,
      group.id,
      input.code ?? null,
      input.name,
      input.address ?? null,
      input.city ?? null,
      input.stateCode ?? null,
      input.gstin ?? null,
      input.pan ?? null,
      input.creditDays ?? null,
    ],
  );
  return id;
}

/** Set (or replace) the opening balance of a ledger for a financial year. */
export async function setOpening(
  q: Queryable,
  ledgerId: string,
  yearId: string,
  amount: string,
  side: Side,
): Promise<void> {
  const normalized = fromPaise(toPaise(amount)); // validates and normalizes to two decimals
  await q.query(
    `INSERT INTO ledger_openings(id, ledger_id, year_id, amount, side) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (ledger_id, year_id) DO UPDATE SET amount = EXCLUDED.amount, side = EXCLUDED.side`,
    [randomUUID(), ledgerId, yearId, normalized, side],
  );
}
```

`packages/service/src/masters/books.ts`:
```ts
import { randomUUID } from 'node:crypto';
import type { Queryable } from '../db/types';

export type BookType =
  | 'cash'
  | 'bank'
  | 'journal'
  | 'sales'
  | 'purchase'
  | 'sales_return'
  | 'purchase_return'
  | 'process'
  | 'production'
  | 'order'
  | 'control';

export interface NewBook {
  companyId: string;
  code: string;
  name: string;
  type: BookType;
  defaultLedgerId?: string;
}

export async function createBook(q: Queryable, input: NewBook): Promise<string> {
  if ((input.type === 'cash' || input.type === 'bank') && !input.defaultLedgerId) {
    throw new Error('A cash or bank book needs a default ledger');
  }
  const id = randomUUID();
  await q.query(`INSERT INTO books(id, company_id, code, name, type, default_ledger_id) VALUES ($1,$2,$3,$4,$5,$6)`, [
    id,
    input.companyId,
    input.code,
    input.name,
    input.type,
    input.defaultLedgerId ?? null,
  ]);
  return id;
}
```

`packages/service/src/testing/fixtures.ts`:
```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/service/src/masters`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/service/src/masters packages/service/src/testing/fixtures.ts
git commit -m "feat(service): company, year, group, ledger and book masters" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Posting engine — numbering and voucher save, edit, delete

**Files:**
- Create: `packages/service/src/posting/numbering.ts`
- Create: `packages/service/src/posting/voucherService.ts`
- Create (stub completed in Task 6): `packages/service/src/outstanding/billService.ts`
- Test: `packages/service/src/posting/voucherService.test.ts`

**Interfaces:**
- Consumes: `buildEntries`, `toPaise`, `fromPaise`, `VoucherError`, `VoucherKind`, `VoucherLineInput` (Tasks 1–2); `Db`, `Queryable` (Task 3); `seedCompany` (Task 4).
- Produces:
  - `nextNumber(tx: Queryable, companyId: string, yearId: string, bookId: string): Promise<number>`
  - `interface SaveVoucherInput { companyId: string; yearId: string; bookId: string; kind: VoucherKind; date: string; narration?: string; lines: VoucherLineInput[]; actorId: string | null }`
  - `saveVoucher(db: Db, input: SaveVoucherInput): Promise<{ voucherId: string; voucherNo: number }>`
  - `updateVoucher(db: Db, voucherId: string, expectedVersion: number, patch: { date: string; narration?: string; lines: VoucherLineInput[]; actorId: string | null }): Promise<{ version: number }>`
  - `deleteVoucher(db: Db, voucherId: string, expectedVersion: number, actorId: string | null): Promise<void>`
  - From `billService.ts` (Task 6 fills in the real bodies; this task adds minimal ones so voucher tests that do not use bills pass): `applyLineAdjustments(tx, p): Promise<bigint>` and `removeVoucherBillLinks(tx, voucherId): Promise<void>`.

- [ ] **Step 1: Write the failing test**

`packages/service/src/posting/voucherService.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/types';
import { seedCompany, type SeededCompany } from '../testing/fixtures';
import { createTestDb } from '../testing/testDb';
import { deleteVoucher, saveVoucher, updateVoucher } from './voucherService';

let db: Db;
let s: SeededCompany;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedCompany(db);
});
afterEach(async () => {
  await db.close();
});

function receipt(amount: string, date = '2026-05-10') {
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

async function entries(voucherId: string) {
  return db.query<{ ledger_id: string; debit: string; credit: string }>(
    'SELECT ledger_id, debit, credit FROM ledger_entries WHERE voucher_id = $1 ORDER BY debit DESC, credit DESC',
    [voucherId],
  );
}

describe('saveVoucher', () => {
  it('posts a receipt as balanced double entry and numbers it from 1', async () => {
    const { voucherId, voucherNo } = await saveVoucher(db, receipt('1000.00'));
    expect(voucherNo).toBe(1);
    expect(await entries(voucherId)).toEqual([
      { ledger_id: s.cashLedgerId, debit: '1000.00', credit: '0.00' },
      { ledger_id: s.partyLedgerId, debit: '0.00', credit: '1000.00' },
    ]);
    const second = await saveVoucher(db, receipt('5.00'));
    expect(second.voucherNo).toBe(2);
  });

  it('rejects an unbalanced journal and does not consume a number', async () => {
    const bad = {
      companyId: s.companyId,
      yearId: s.yearId,
      bookId: s.journalBookId,
      kind: 'journal' as const,
      date: '2026-05-10',
      lines: [
        { ledgerId: s.partyLedgerId, side: 'Dr' as const, amount: '100.00' },
        { ledgerId: s.discountLedgerId, side: 'Cr' as const, amount: '99.00' },
      ],
      actorId: null,
    };
    await expect(saveVoucher(db, bad)).rejects.toMatchObject({ code: 'NOT_BALANCED' });
    const count = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM vouchers');
    expect(count[0]?.n).toBe(0);
    const ok = await saveVoucher(db, { ...bad, lines: [bad.lines[0]!, { ...bad.lines[1]!, amount: '100.00' }] });
    expect(ok.voucherNo).toBe(1);
  });

  it('rejects a date outside the financial year', async () => {
    await expect(saveVoucher(db, receipt('10', '2027-04-01'))).rejects.toMatchObject({ code: 'DATE_OUT_OF_YEAR' });
    await expect(saveVoucher(db, receipt('10', '2026-03-31'))).rejects.toMatchObject({ code: 'DATE_OUT_OF_YEAR' });
  });

  it('rejects a malformed date', async () => {
    await expect(saveVoucher(db, receipt('10', '10-05-2026'))).rejects.toMatchObject({ code: 'BAD_DATE' });
  });

  it('rejects a date on or before the company freeze date', async () => {
    await db.query(`UPDATE companies SET freeze_date = '2026-06-30' WHERE id = $1`, [s.companyId]);
    await expect(saveVoucher(db, receipt('10', '2026-06-30'))).rejects.toMatchObject({ code: 'PERIOD_FROZEN' });
    await expect(saveVoucher(db, receipt('10', '2026-07-01'))).resolves.toBeTruthy();
  });

  it('rejects a closed year', async () => {
    await db.query(`UPDATE financial_years SET status = 'closed' WHERE id = $1`, [s.yearId]);
    await expect(saveVoucher(db, receipt('10'))).rejects.toMatchObject({ code: 'YEAR_LOCKED' });
  });

  it('rejects a receipt on a journal book and a journal on a cash book', async () => {
    await expect(saveVoucher(db, { ...receipt('10'), bookId: s.journalBookId })).rejects.toMatchObject({
      code: 'BOOK_KIND_MISMATCH',
    });
  });

  it('rejects a blocked ledger', async () => {
    await db.query(`UPDATE ledgers SET status = 'blocked' WHERE id = $1`, [s.partyLedgerId]);
    await expect(saveVoucher(db, receipt('10'))).rejects.toMatchObject({ code: 'LEDGER_INVALID' });
  });
});

describe('updateVoucher', () => {
  it('replaces lines and entries, bumps the version, and keeps the number', async () => {
    const { voucherId } = await saveVoucher(db, receipt('1000.00'));
    const r = await updateVoucher(db, voucherId, 1, {
      date: '2026-05-11',
      lines: [{ ledgerId: s.partyLedgerId, side: 'Cr', amount: '400.00' }],
      actorId: null,
    });
    expect(r.version).toBe(2);
    expect(await entries(voucherId)).toEqual([
      { ledger_id: s.cashLedgerId, debit: '400.00', credit: '0.00' },
      { ledger_id: s.partyLedgerId, debit: '0.00', credit: '400.00' },
    ]);
    const v = await db.query<{ voucher_no: number; voucher_date: string }>(
      'SELECT voucher_no, voucher_date FROM vouchers WHERE id = $1',
      [voucherId],
    );
    expect(v[0]).toEqual({ voucher_no: 1, voucher_date: '2026-05-11' });
  });

  it('refuses a stale version', async () => {
    const { voucherId } = await saveVoucher(db, receipt('1000.00'));
    await updateVoucher(db, voucherId, 1, {
      date: '2026-05-10',
      lines: [{ ledgerId: s.partyLedgerId, side: 'Cr', amount: '1.00' }],
      actorId: null,
    });
    await expect(
      updateVoucher(db, voucherId, 1, {
        date: '2026-05-10',
        lines: [{ ledgerId: s.partyLedgerId, side: 'Cr', amount: '2.00' }],
        actorId: null,
      }),
    ).rejects.toMatchObject({ code: 'STALE_VERSION' });
  });

  it('refuses to edit a voucher that sits in a frozen period', async () => {
    const { voucherId } = await saveVoucher(db, receipt('1000.00', '2026-05-10'));
    await db.query(`UPDATE companies SET freeze_date = '2026-05-31' WHERE id = $1`, [s.companyId]);
    await expect(
      updateVoucher(db, voucherId, 1, {
        date: '2026-06-15',
        lines: [{ ledgerId: s.partyLedgerId, side: 'Cr', amount: '1.00' }],
        actorId: null,
      }),
    ).rejects.toMatchObject({ code: 'PERIOD_FROZEN' });
  });

  it('a failed update leaves the original untouched', async () => {
    const { voucherId } = await saveVoucher(db, receipt('1000.00'));
    await expect(
      updateVoucher(db, voucherId, 1, {
        date: '2026-05-10',
        lines: [{ ledgerId: s.partyLedgerId, side: 'Dr', amount: '5.00' }], // wrong side for a receipt
        actorId: null,
      }),
    ).rejects.toMatchObject({ code: 'WRONG_SIDE' });
    expect(await entries(voucherId)).toHaveLength(2);
    const v = await db.query<{ version: number }>('SELECT version FROM vouchers WHERE id = $1', [voucherId]);
    expect(v[0]?.version).toBe(1);
  });
});

describe('deleteVoucher', () => {
  it('removes the voucher, its lines and its entries', async () => {
    const { voucherId } = await saveVoucher(db, receipt('1000.00'));
    await deleteVoucher(db, voucherId, 1, null);
    for (const table of ['vouchers', 'voucher_lines', 'ledger_entries']) {
      const col = table === 'vouchers' ? 'id' : 'voucher_id';
      const n = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE ${col} = $1`, [voucherId]);
      expect(n[0]?.n).toBe(0);
    }
  });

  it('refuses a stale version and an unknown voucher', async () => {
    const { voucherId } = await saveVoucher(db, receipt('1.00'));
    await expect(deleteVoucher(db, voucherId, 7, null)).rejects.toMatchObject({ code: 'STALE_VERSION' });
    await expect(
      deleteVoucher(db, '00000000-0000-4000-8000-000000000000', 1, null),
    ).rejects.toMatchObject({ code: 'VOUCHER_NOT_FOUND' });
  });
});

describe('ledger always balances', () => {
  it('total debits equal total credits after a mix of saves, edits and deletes', async () => {
    const a = await saveVoucher(db, receipt('100.00'));
    const b = await saveVoucher(db, receipt('250.75'));
    await updateVoucher(db, a.voucherId, 1, {
      date: '2026-05-12',
      lines: [{ ledgerId: s.partyLedgerId, side: 'Cr', amount: '120.10' }],
      actorId: null,
    });
    await deleteVoucher(db, b.voucherId, 1, null);
    const t = await db.query<{ dr: string; cr: string }>(
      'SELECT COALESCE(SUM(debit),0) AS dr, COALESCE(SUM(credit),0) AS cr FROM ledger_entries',
    );
    expect(t[0]?.dr).toBe(t[0]?.cr);
    expect(t[0]?.dr).toBe('120.10');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/service/src/posting/voucherService.test.ts`
Expected: FAIL — cannot find module `./voucherService`.

- [ ] **Step 3: Write numbering**

`packages/service/src/posting/numbering.ts`:
```ts
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
```

- [ ] **Step 4: Write the minimal bill hooks (completed in Task 6)**

`packages/service/src/outstanding/billService.ts`:
```ts
import type { BillAdjustmentInput, Side } from '@sas/shared';
import type { Queryable } from '../db/types';

export interface LineAdjustmentParams {
  companyId: string;
  voucherId: string;
  lineId: string;
  ledgerId: string;
  side: Side;
  lineAmount: bigint;
  adjustments: BillAdjustmentInput[];
}

/** Settle bills from one voucher line. Returns the total adjusted, in paise. (Task 6 implements bills.) */
export async function applyLineAdjustments(_tx: Queryable, p: LineAdjustmentParams): Promise<bigint> {
  if (p.adjustments.length > 0) throw new Error('Bill adjustment is implemented in Task 6');
  return 0n;
}

/** Undo everything a voucher did to bills and on-account money. (Task 6 implements bills.) */
export async function removeVoucherBillLinks(tx: Queryable, voucherId: string): Promise<void> {
  // A receipt/payment with no bill adjustments writes an on_account row, which must go before the voucher can.
  await tx.query('DELETE FROM on_account WHERE voucher_id = $1', [voucherId]);
}
```

- [ ] **Step 5: Write the voucher service**

`packages/service/src/posting/voucherService.ts`:
```ts
import { randomUUID } from 'node:crypto';
import {
  buildEntries,
  fromPaise,
  toPaise,
  VoucherError,
  type VoucherKind,
  type VoucherLineInput,
} from '@sas/shared';
import type { Db, Queryable } from '../db/types';
import { applyLineAdjustments, removeVoucherBillLinks } from '../outstanding/billService';
import { nextNumber } from './numbering';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface SaveVoucherInput {
  companyId: string;
  yearId: string;
  bookId: string;
  kind: VoucherKind;
  date: string;
  narration?: string;
  lines: VoucherLineInput[];
  actorId: string | null;
}

export interface UpdateVoucherPatch {
  date: string;
  narration?: string;
  lines: VoucherLineInput[];
  actorId: string | null;
}

interface VoucherRow {
  id: string;
  company_id: string;
  year_id: string;
  book_id: string;
  kind: VoucherKind;
  voucher_date: string;
  version: number;
}

/** The year must be open, the date inside it, and after the company's freeze date. */
async function assertPostable(tx: Queryable, companyId: string, yearId: string, date: string): Promise<void> {
  if (!DATE_RE.test(date)) throw new VoucherError('BAD_DATE', `Invalid date "${date}"`);
  const years = await tx.query<{ status: string; start_date: string; end_date: string }>(
    'SELECT status, start_date, end_date FROM financial_years WHERE id = $1 AND company_id = $2',
    [yearId, companyId],
  );
  const year = years[0];
  if (!year) throw new VoucherError('YEAR_NOT_FOUND', 'Financial year not found');
  if (year.status !== 'open') throw new VoucherError('YEAR_LOCKED', 'This financial year is not open');
  if (date < year.start_date || date > year.end_date) {
    throw new VoucherError('DATE_OUT_OF_YEAR', `${date} is outside ${year.start_date} to ${year.end_date}`);
  }
  const companies = await tx.query<{ freeze_date: string | null }>('SELECT freeze_date FROM companies WHERE id = $1', [
    companyId,
  ]);
  const freeze = companies[0]?.freeze_date;
  if (freeze && date <= freeze) throw new VoucherError('PERIOD_FROZEN', `Entries on or before ${freeze} are frozen`);
}

async function loadBookLedger(
  tx: Queryable,
  companyId: string,
  bookId: string,
  kind: VoucherKind,
): Promise<string | null> {
  const rows = await tx.query<{ type: string; default_ledger_id: string | null }>(
    'SELECT type, default_ledger_id FROM books WHERE id = $1 AND company_id = $2',
    [bookId, companyId],
  );
  const book = rows[0];
  if (!book) throw new VoucherError('BOOK_NOT_FOUND', 'Book not found');
  const allowed = kind === 'journal' ? ['journal'] : ['cash', 'bank'];
  if (!allowed.includes(book.type)) {
    throw new VoucherError('BOOK_KIND_MISMATCH', `A ${kind} cannot be entered in a ${book.type} book`);
  }
  return book.default_ledger_id;
}

interface Body {
  voucherId: string;
  companyId: string;
  yearId: string;
  date: string;
  kind: VoucherKind;
  bookLedgerId: string | null;
  lines: VoucherLineInput[];
}

/** Write voucher lines, bill adjustments, on-account leftovers and the ledger entries. */
async function writeBody(tx: Queryable, v: Body): Promise<void> {
  const entries = buildEntries(v.kind, v.bookLedgerId, v.lines);

  const ledgerIds = [...new Set(entries.map((e) => e.ledgerId))];
  const ok = await tx.query<{ id: string }>(
    `SELECT id FROM ledgers WHERE company_id = $1 AND status = 'active' AND id = ANY($2::uuid[])`,
    [v.companyId, ledgerIds],
  );
  if (ok.length !== ledgerIds.length) {
    throw new VoucherError('LEDGER_INVALID', 'A ledger is missing, blocked, or belongs to another company');
  }

  for (const [i, line] of v.lines.entries()) {
    const amt = toPaise(line.amount);
    const lineId = randomUUID();
    await tx.query(
      `INSERT INTO voucher_lines(id, voucher_id, line_no, ledger_id, debit, credit, narration)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        lineId,
        v.voucherId,
        i + 1,
        line.ledgerId,
        line.side === 'Dr' ? fromPaise(amt) : '0.00',
        line.side === 'Cr' ? fromPaise(amt) : '0.00',
        line.narration ?? null,
      ],
    );
    const adjusted = await applyLineAdjustments(tx, {
      companyId: v.companyId,
      voucherId: v.voucherId,
      lineId,
      ledgerId: line.ledgerId,
      side: line.side,
      lineAmount: amt,
      adjustments: line.adjustments ?? [],
    });
    if (v.kind !== 'journal' && amt - adjusted > 0n) {
      await tx.query(
        `INSERT INTO on_account(id, company_id, year_id, voucher_id, ledger_id, side, amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [randomUUID(), v.companyId, v.yearId, v.voucherId, line.ledgerId, line.side, fromPaise(amt - adjusted)],
      );
    }
  }

  for (const e of entries) {
    await tx.query(
      `INSERT INTO ledger_entries(id, company_id, year_id, voucher_id, ledger_id, entry_date, debit, credit)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [randomUUID(), v.companyId, v.yearId, v.voucherId, e.ledgerId, v.date, fromPaise(e.debit), fromPaise(e.credit)],
    );
  }
}

async function clearBody(tx: Queryable, voucherId: string): Promise<void> {
  await removeVoucherBillLinks(tx, voucherId);
  await tx.query('DELETE FROM ledger_entries WHERE voucher_id = $1', [voucherId]);
  await tx.query('DELETE FROM voucher_lines WHERE voucher_id = $1', [voucherId]);
}

async function lockVoucher(tx: Queryable, voucherId: string, expectedVersion: number): Promise<VoucherRow> {
  const rows = await tx.query<VoucherRow>(
    `SELECT id, company_id, year_id, book_id, kind, voucher_date, version
     FROM vouchers WHERE id = $1 FOR UPDATE`,
    [voucherId],
  );
  const v = rows[0];
  if (!v) throw new VoucherError('VOUCHER_NOT_FOUND', 'Voucher not found');
  if (v.version !== expectedVersion) {
    throw new VoucherError('STALE_VERSION', 'This voucher was changed by someone else. Reload and try again.');
  }
  return v;
}

export async function saveVoucher(db: Db, input: SaveVoucherInput): Promise<{ voucherId: string; voucherNo: number }> {
  return db.transaction(async (tx) => {
    await assertPostable(tx, input.companyId, input.yearId, input.date);
    const bookLedgerId = await loadBookLedger(tx, input.companyId, input.bookId, input.kind);
    const voucherNo = await nextNumber(tx, input.companyId, input.yearId, input.bookId);
    const voucherId = randomUUID();
    await tx.query(
      `INSERT INTO vouchers(id, company_id, year_id, book_id, kind, voucher_no, voucher_date, narration, created_by, modified_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,
      [
        voucherId,
        input.companyId,
        input.yearId,
        input.bookId,
        input.kind,
        voucherNo,
        input.date,
        input.narration ?? null,
        input.actorId,
      ],
    );
    await writeBody(tx, {
      voucherId,
      companyId: input.companyId,
      yearId: input.yearId,
      date: input.date,
      kind: input.kind,
      bookLedgerId,
      lines: input.lines,
    });
    return { voucherId, voucherNo };
  });
}

export async function updateVoucher(
  db: Db,
  voucherId: string,
  expectedVersion: number,
  patch: UpdateVoucherPatch,
): Promise<{ version: number }> {
  return db.transaction(async (tx) => {
    const v = await lockVoucher(tx, voucherId, expectedVersion);
    await assertPostable(tx, v.company_id, v.year_id, v.voucher_date);
    await assertPostable(tx, v.company_id, v.year_id, patch.date);
    const bookLedgerId = await loadBookLedger(tx, v.company_id, v.book_id, v.kind);
    await clearBody(tx, voucherId);
    await writeBody(tx, {
      voucherId,
      companyId: v.company_id,
      yearId: v.year_id,
      date: patch.date,
      kind: v.kind,
      bookLedgerId,
      lines: patch.lines,
    });
    await tx.query(
      `UPDATE vouchers SET voucher_date = $2, narration = $3, version = version + 1,
         modified_by = $4, modified_at = now() WHERE id = $1`,
      [voucherId, patch.date, patch.narration ?? null, patch.actorId],
    );
    return { version: expectedVersion + 1 };
  });
}

export async function deleteVoucher(
  db: Db,
  voucherId: string,
  expectedVersion: number,
  _actorId: string | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    const v = await lockVoucher(tx, voucherId, expectedVersion);
    await assertPostable(tx, v.company_id, v.year_id, v.voucher_date);
    await clearBody(tx, voucherId);
    await tx.query('DELETE FROM vouchers WHERE id = $1', [voucherId]);
  });
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run packages/service/src/posting`
Expected: PASS — 15 tests. If `ANY($2::uuid[])` fails to bind an array on PGlite, replace it with `id IN (SELECT unnest($2::uuid[]))` and re-run.

- [ ] **Step 7: Commit**

```bash
git add packages/service/src/posting packages/service/src/outstanding
git commit -m "feat(service): posting engine with numbering, period checks and versioned edits" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Bill-wise outstanding, adjustments and on-account money

**Files:**
- Modify (replace stub): `packages/service/src/outstanding/billService.ts`
- Test: `packages/service/src/outstanding/billService.test.ts`

**Interfaces:**
- Consumes: `saveVoucher`, `updateVoucher`, `deleteVoucher` (Task 5); `seedCompany` (Task 4); `toPaise`, `fromPaise`, `ADJUSTMENT_KINDS`, `VoucherError`, `Side`, `BillAdjustmentInput` (Tasks 1–2).
- Produces:
  - `interface NewBill { companyId: string; yearId: string; ledgerId: string; billNo: string; billDate: string; dueDate?: string; amount: string; side: Side }`
  - `registerBill(q: Queryable, bill: NewBill): Promise<string>` (returns bill id)
  - `pendingOf(q: Queryable, billId: string): Promise<string>` (decimal string, e.g. `"2000.00"`)
  - `listPendingBills(q: Queryable, companyId: string, ledgerId: string): Promise<PendingBill[]>` where `PendingBill = { id: string; billNo: string; billDate: string; dueDate: string | null; side: Side; original: string; pending: string }`, oldest bill date first, only rows with pending > 0
  - `applyLineAdjustments(tx, p: LineAdjustmentParams): Promise<bigint>` (real implementation; signature unchanged from Task 5)
  - `removeVoucherBillLinks(tx, voucherId): Promise<void>` (real implementation)
  - `applyOnAccount(db: Db, onAccountId: string, billId: string, amount: string): Promise<void>`
  - `listOnAccount(q: Queryable, companyId: string, ledgerId: string): Promise<{ id: string; side: Side; amount: string; remaining: string }[]>`

**Rules implemented:** a bill sits on a side (`Dr` for a sales bill on a debtor, `Cr` for a purchase bill on a creditor); a voucher line settles it only from the **opposite** side on the **same ledger**; pending = original − all adjustments; an adjustment cannot exceed pending; the adjustments on a line cannot exceed the line amount; on receipts and payments the unadjusted rest of a party line becomes on-account money; a voucher whose on-account money has been applied to bills cannot be edited or deleted.

- [ ] **Step 1: Write the failing test**

`packages/service/src/outstanding/billService.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/types';
import { deleteVoucher, saveVoucher, updateVoucher } from '../posting/voucherService';
import { seedCompany, type SeededCompany } from '../testing/fixtures';
import { createTestDb } from '../testing/testDb';
import { applyOnAccount, listOnAccount, listPendingBills, pendingOf, registerBill } from './billService';

let db: Db;
let s: SeededCompany;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedCompany(db);
});
afterEach(async () => {
  await db.close();
});

function bill(billNo: string, amount: string, billDate = '2026-04-10') {
  return registerBill(db, {
    companyId: s.companyId,
    yearId: s.yearId,
    ledgerId: s.partyLedgerId,
    billNo,
    billDate,
    amount,
    side: 'Dr', // a sales bill on a debtor
  });
}

function receipt(lineAmount: string, adjustments: { billId: string; amount: string; kind?: 'cash' | 'discount' }[]) {
  return {
    companyId: s.companyId,
    yearId: s.yearId,
    bookId: s.cashBookId,
    kind: 'receipt' as const,
    date: '2026-05-10',
    lines: [
      {
        ledgerId: s.partyLedgerId,
        side: 'Cr' as const,
        amount: lineAmount,
        adjustments: adjustments.map((a) => ({ billId: a.billId, amount: a.amount, kind: a.kind ?? ('cash' as const) })),
      },
    ],
    actorId: null,
  };
}

describe('registerBill / pendingOf', () => {
  it('a new bill is fully pending', async () => {
    const id = await bill('S-1', '5000.00');
    expect(await pendingOf(db, id)).toBe('5000.00');
  });

  it('rejects a duplicate bill number on the same ledger and side', async () => {
    await bill('S-1', '10.00');
    await expect(bill('S-1', '20.00')).rejects.toThrow();
  });
});

describe('receipt against a bill', () => {
  it('reduces pending by the adjusted amount', async () => {
    const id = await bill('S-1', '5000.00');
    await saveVoucher(db, receipt('3000.00', [{ billId: id, amount: '3000.00' }]));
    expect(await pendingOf(db, id)).toBe('2000.00');
  });

  it('settles one receipt across several bills', async () => {
    const a = await bill('S-1', '1000.00');
    const b = await bill('S-2', '2000.00');
    await saveVoucher(db, receipt('2500.00', [{ billId: a, amount: '1000.00' }, { billId: b, amount: '1500.00' }]));
    expect(await pendingOf(db, a)).toBe('0.00');
    expect(await pendingOf(db, b)).toBe('500.00');
    expect((await listPendingBills(db, s.companyId, s.partyLedgerId)).map((p) => p.billNo)).toEqual(['S-2']);
  });

  it('rejects an adjustment larger than the pending amount', async () => {
    const id = await bill('S-1', '100.00');
    await expect(saveVoucher(db, receipt('150.00', [{ billId: id, amount: '150.00' }]))).rejects.toMatchObject({
      code: 'ADJUSTMENT_INVALID',
    });
    expect(await pendingOf(db, id)).toBe('100.00');
  });

  it('rejects adjustments that add up to more than the line', async () => {
    const id = await bill('S-1', '500.00');
    await expect(saveVoucher(db, receipt('100.00', [{ billId: id, amount: '200.00' }]))).rejects.toMatchObject({
      code: 'ADJUSTMENT_EXCEEDS_LINE',
    });
  });

  it('rejects a bill that belongs to another account', async () => {
    const other = await registerBill(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      ledgerId: s.discountLedgerId,
      billNo: 'X-1',
      billDate: '2026-04-10',
      amount: '100.00',
      side: 'Dr',
    });
    await expect(saveVoucher(db, receipt('50.00', [{ billId: other, amount: '50.00' }]))).rejects.toMatchObject({
      code: 'ADJUSTMENT_INVALID',
    });
  });

  it('rejects a payment (debit) line against a debit bill — wrong side', async () => {
    const id = await bill('S-1', '100.00');
    await expect(
      saveVoucher(db, {
        companyId: s.companyId,
        yearId: s.yearId,
        bookId: s.cashBookId,
        kind: 'payment',
        date: '2026-05-10',
        lines: [
          {
            ledgerId: s.partyLedgerId,
            side: 'Dr',
            amount: '50.00',
            adjustments: [{ billId: id, amount: '50.00', kind: 'cash' }],
          },
        ],
        actorId: null,
      }),
    ).rejects.toMatchObject({ code: 'ADJUSTMENT_INVALID' });
  });

  it('a journal credit to the party can settle a bill by discount', async () => {
    const id = await bill('S-1', '1000.00');
    await saveVoucher(db, {
      companyId: s.companyId,
      yearId: s.yearId,
      bookId: s.journalBookId,
      kind: 'journal',
      date: '2026-05-10',
      lines: [
        { ledgerId: s.discountLedgerId, side: 'Dr', amount: '100.00' },
        {
          ledgerId: s.partyLedgerId,
          side: 'Cr',
          amount: '100.00',
          adjustments: [{ billId: id, amount: '100.00', kind: 'discount' }],
        },
      ],
      actorId: null,
    });
    expect(await pendingOf(db, id)).toBe('900.00');
  });

  it('editing the receipt re-adjusts; deleting it restores the full pending amount', async () => {
    const id = await bill('S-1', '5000.00');
    const { voucherId } = await saveVoucher(db, receipt('3000.00', [{ billId: id, amount: '3000.00' }]));
    await updateVoucher(db, voucherId, 1, {
      date: '2026-05-10',
      lines: receipt('1000.00', [{ billId: id, amount: '1000.00' }]).lines,
      actorId: null,
    });
    expect(await pendingOf(db, id)).toBe('4000.00');
    await deleteVoucher(db, voucherId, 2, null);
    expect(await pendingOf(db, id)).toBe('5000.00');
  });
});

describe('on-account money', () => {
  it('the unadjusted rest of a receipt line becomes on-account', async () => {
    const id = await bill('S-1', '3000.00');
    await saveVoucher(db, receipt('4000.00', [{ billId: id, amount: '3000.00' }]));
    const rows = await listOnAccount(db, s.companyId, s.partyLedgerId);
    expect(rows).toEqual([expect.objectContaining({ side: 'Cr', amount: '1000.00', remaining: '1000.00' })]);
  });

  it('a receipt with no adjustments is entirely on-account', async () => {
    await saveVoucher(db, receipt('700.00', []));
    const rows = await listOnAccount(db, s.companyId, s.partyLedgerId);
    expect(rows[0]?.amount).toBe('700.00');
  });

  it('can be applied to a later bill, partly, and not beyond what remains', async () => {
    await saveVoucher(db, receipt('1000.00', []));
    const [oa] = await listOnAccount(db, s.companyId, s.partyLedgerId);
    const later = await bill('S-9', '600.00', '2026-06-01');
    await applyOnAccount(db, oa!.id, later, '400.00');
    expect(await pendingOf(db, later)).toBe('200.00');
    expect((await listOnAccount(db, s.companyId, s.partyLedgerId))[0]?.remaining).toBe('600.00');
    await expect(applyOnAccount(db, oa!.id, later, '300.00')).rejects.toMatchObject({ code: 'ADJUSTMENT_INVALID' });
  });

  it('a voucher whose on-account money was applied cannot be edited or deleted', async () => {
    const { voucherId } = await saveVoucher(db, receipt('1000.00', []));
    const [oa] = await listOnAccount(db, s.companyId, s.partyLedgerId);
    const later = await bill('S-9', '600.00', '2026-06-01');
    await applyOnAccount(db, oa!.id, later, '100.00');
    await expect(deleteVoucher(db, voucherId, 1, null)).rejects.toMatchObject({ code: 'ON_ACCOUNT_USED' });
    await expect(
      updateVoucher(db, voucherId, 1, { date: '2026-05-10', lines: receipt('5.00', []).lines, actorId: null }),
    ).rejects.toMatchObject({ code: 'ON_ACCOUNT_USED' });
  });
});

describe('listPendingBills', () => {
  it('lists oldest bills first with original and pending amounts', async () => {
    await bill('S-2', '200.00', '2026-05-01');
    const first = await bill('S-1', '100.00', '2026-04-01');
    await saveVoucher(db, receipt('40.00', [{ billId: first, amount: '40.00' }]));
    const rows = await listPendingBills(db, s.companyId, s.partyLedgerId);
    expect(rows.map((r) => [r.billNo, r.original, r.pending])).toEqual([
      ['S-1', '100.00', '60.00'],
      ['S-2', '200.00', '200.00'],
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/service/src/outstanding/billService.test.ts`
Expected: FAIL — `registerBill` (and the other new exports) are not exported from `./billService`.

- [ ] **Step 3: Replace the stub with the real implementation**

`packages/service/src/outstanding/billService.ts`:
```ts
import { randomUUID } from 'node:crypto';
import {
  ADJUSTMENT_KINDS,
  fromPaise,
  toPaise,
  VoucherError,
  type BillAdjustmentInput,
  type Side,
} from '@sas/shared';
import type { Db, Queryable } from '../db/types';

export interface NewBill {
  companyId: string;
  yearId: string;
  ledgerId: string;
  billNo: string;
  billDate: string;
  dueDate?: string;
  amount: string;
  side: Side;
}

export interface PendingBill {
  id: string;
  billNo: string;
  billDate: string;
  dueDate: string | null;
  side: Side;
  original: string;
  pending: string;
}

export interface LineAdjustmentParams {
  companyId: string;
  voucherId: string;
  lineId: string;
  ledgerId: string;
  side: Side;
  lineAmount: bigint;
  adjustments: BillAdjustmentInput[];
}

const opposite = (side: Side): Side => (side === 'Dr' ? 'Cr' : 'Dr');

function positiveAmount(text: string): bigint {
  let amt: bigint;
  try {
    amt = toPaise(text);
  } catch {
    throw new VoucherError('ADJUSTMENT_INVALID', `Invalid adjustment amount "${text}"`);
  }
  if (amt <= 0n) throw new VoucherError('ADJUSTMENT_INVALID', 'Adjustment must be greater than zero');
  return amt;
}

export async function registerBill(q: Queryable, bill: NewBill): Promise<string> {
  const id = randomUUID();
  await q.query(
    `INSERT INTO outstanding_bills(id, company_id, year_id, ledger_id, bill_no, bill_date, due_date, original_amount, side)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      bill.companyId,
      bill.yearId,
      bill.ledgerId,
      bill.billNo,
      bill.billDate,
      bill.dueDate ?? null,
      fromPaise(toPaise(bill.amount)),
      bill.side,
    ],
  );
  return id;
}

export async function pendingOf(q: Queryable, billId: string): Promise<string> {
  const rows = await q.query<{ pending: string }>(
    `SELECT b.original_amount - COALESCE(SUM(a.amount), 0) AS pending
     FROM outstanding_bills b LEFT JOIN bill_adjustments a ON a.bill_id = b.id
     WHERE b.id = $1 GROUP BY b.id`,
    [billId],
  );
  if (!rows[0]) throw new VoucherError('ADJUSTMENT_INVALID', 'Bill not found');
  return rows[0].pending;
}

export async function listPendingBills(q: Queryable, companyId: string, ledgerId: string): Promise<PendingBill[]> {
  const rows = await q.query<{
    id: string;
    bill_no: string;
    bill_date: string;
    due_date: string | null;
    side: Side;
    original: string;
    pending: string;
  }>(
    `SELECT b.id, b.bill_no, b.bill_date, b.due_date, b.side,
            b.original_amount AS original,
            b.original_amount - COALESCE(SUM(a.amount), 0) AS pending
     FROM outstanding_bills b LEFT JOIN bill_adjustments a ON a.bill_id = b.id
     WHERE b.company_id = $1 AND b.ledger_id = $2
     GROUP BY b.id
     HAVING b.original_amount - COALESCE(SUM(a.amount), 0) > 0
     ORDER BY b.bill_date, b.bill_no`,
    [companyId, ledgerId],
  );
  return rows.map((r) => ({
    id: r.id,
    billNo: r.bill_no,
    billDate: r.bill_date,
    dueDate: r.due_date,
    side: r.side,
    original: r.original,
    pending: r.pending,
  }));
}

/** Settle bills from one voucher line. Returns the total adjusted, in paise. */
export async function applyLineAdjustments(tx: Queryable, p: LineAdjustmentParams): Promise<bigint> {
  let total = 0n;
  for (const a of p.adjustments) {
    if (!(ADJUSTMENT_KINDS as readonly string[]).includes(a.kind)) {
      throw new VoucherError('ADJUSTMENT_INVALID', `Unknown adjustment type "${a.kind}"`);
    }
    const amt = positiveAmount(a.amount);
    const bills = await tx.query<{ id: string; company_id: string; ledger_id: string; side: Side }>(
      'SELECT id, company_id, ledger_id, side FROM outstanding_bills WHERE id = $1 FOR UPDATE',
      [a.billId],
    );
    const bill = bills[0];
    if (!bill || bill.company_id !== p.companyId) throw new VoucherError('ADJUSTMENT_INVALID', 'Bill not found');
    if (bill.ledger_id !== p.ledgerId) {
      throw new VoucherError('ADJUSTMENT_INVALID', 'That bill belongs to a different account');
    }
    if (bill.side === p.side) {
      throw new VoucherError('ADJUSTMENT_INVALID', 'A line can only settle a bill from the opposite side');
    }
    const pending = toPaise(await pendingOf(tx, bill.id));
    if (amt > pending) {
      throw new VoucherError('ADJUSTMENT_INVALID', `Adjustment ${a.amount} is more than the pending ${fromPaise(pending)}`);
    }
    await tx.query(
      `INSERT INTO bill_adjustments(id, bill_id, voucher_id, voucher_line_id, amount, kind)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [randomUUID(), bill.id, p.voucherId, p.lineId, fromPaise(amt), a.kind],
    );
    total += amt;
  }
  if (total > p.lineAmount) {
    throw new VoucherError('ADJUSTMENT_EXCEEDS_LINE', 'Bill adjustments add up to more than the line amount');
  }
  return total;
}

/** Undo everything a voucher did to bills and on-account money. Refuses if its on-account money was used. */
export async function removeVoucherBillLinks(tx: Queryable, voucherId: string): Promise<void> {
  const used = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM bill_adjustments a
     JOIN on_account o ON o.id = a.on_account_id WHERE o.voucher_id = $1`,
    [voucherId],
  );
  if ((used[0]?.n ?? 0) > 0) {
    throw new VoucherError(
      'ON_ACCOUNT_USED',
      'Money from this voucher was already adjusted against bills. Undo that first.',
    );
  }
  await tx.query('DELETE FROM bill_adjustments WHERE voucher_id = $1', [voucherId]);
  await tx.query('DELETE FROM on_account WHERE voucher_id = $1', [voucherId]);
}

export async function listOnAccount(
  q: Queryable,
  companyId: string,
  ledgerId: string,
): Promise<{ id: string; side: Side; amount: string; remaining: string }[]> {
  return q.query(
    `SELECT o.id, o.side, o.amount, o.amount - COALESCE(SUM(a.amount), 0) AS remaining
     FROM on_account o LEFT JOIN bill_adjustments a ON a.on_account_id = o.id
     WHERE o.company_id = $1 AND o.ledger_id = $2
     GROUP BY o.id
     HAVING o.amount - COALESCE(SUM(a.amount), 0) > 0
     ORDER BY o.id`,
    [companyId, ledgerId],
  );
}

/** Match part or all of an on-account amount to a bill of the same account on the opposite side. */
export async function applyOnAccount(db: Db, onAccountId: string, billId: string, amount: string): Promise<void> {
  const amt = positiveAmount(amount);
  await db.transaction(async (tx) => {
    const oas = await tx.query<{ id: string; company_id: string; ledger_id: string; side: Side; amount: string }>(
      'SELECT id, company_id, ledger_id, side, amount FROM on_account WHERE id = $1 FOR UPDATE',
      [onAccountId],
    );
    const oa = oas[0];
    if (!oa) throw new VoucherError('ADJUSTMENT_INVALID', 'On-account entry not found');
    const bills = await tx.query<{ id: string; company_id: string; ledger_id: string; side: Side }>(
      'SELECT id, company_id, ledger_id, side FROM outstanding_bills WHERE id = $1 FOR UPDATE',
      [billId],
    );
    const bill = bills[0];
    if (!bill || bill.company_id !== oa.company_id) throw new VoucherError('ADJUSTMENT_INVALID', 'Bill not found');
    if (bill.ledger_id !== oa.ledger_id) {
      throw new VoucherError('ADJUSTMENT_INVALID', 'That bill belongs to a different account');
    }
    if (bill.side === oa.side) {
      throw new VoucherError('ADJUSTMENT_INVALID', 'On-account money can only settle a bill from the opposite side');
    }
    const used = await tx.query<{ used: string }>(
      'SELECT COALESCE(SUM(amount), 0) AS used FROM bill_adjustments WHERE on_account_id = $1',
      [onAccountId],
    );
    const remaining = toPaise(oa.amount) - toPaise(used[0]!.used);
    if (amt > remaining) {
      throw new VoucherError('ADJUSTMENT_INVALID', `Only ${fromPaise(remaining)} is left on account`);
    }
    const pending = toPaise(await pendingOf(tx, bill.id));
    if (amt > pending) {
      throw new VoucherError('ADJUSTMENT_INVALID', `Adjustment ${amount} is more than the pending ${fromPaise(pending)}`);
    }
    await tx.query(
      `INSERT INTO bill_adjustments(id, bill_id, on_account_id, amount, kind) VALUES ($1,$2,$3,$4,'cash')`,
      [randomUUID(), bill.id, onAccountId, fromPaise(amt)],
    );
  });
}
```

- [ ] **Step 4: Run the bill tests**

Run: `npx vitest run packages/service/src/outstanding`
Expected: PASS — 15 tests.

- [ ] **Step 5: Run everything and the type-check**

Run: `npm test && npm run typecheck`
Expected: all test files PASS (shared: 2 files, service: 4 files); `tsc` prints no errors.

- [ ] **Step 6: Commit and push**

```bash
git add packages/service/src/outstanding
git commit -m "feat(service): bill-wise outstanding, adjustments and on-account money" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

---

## Self-review against the spec

| Spec requirement (section) | Covered by |
|---|---|
| Exact decimals everywhere (4) | Task 1 `Paise`; `NUMERIC(18,2)` in Task 3 |
| One database, company + year columns, UUID keys, change log for sync (2, 3) | Task 3 schema and triggers |
| Account group tree seeded from JSM list; ledgers; opening balances; books (4) | Task 4 |
| Common voucher + lines, central ledger entries, balanced in one transaction (4) | Tasks 2 and 5 |
| Edit/delete reverse and rewrite in the same transaction (4) | Task 5 `clearBody` + `writeBody` |
| Unique numbering per book and year, rollback-safe (4, 7) | Task 5 `nextNumber` |
| Freeze date and closed-year lock (5) | Task 5 `assertPostable` |
| Version check against concurrent edits (7) | Task 5 `lockVoucher` |
| Bill-wise outstanding, adjustment kinds, on-account, close bill (4) | Task 6 (`close` is one of the adjustment kinds) |

**Not in this plan (by design, they are Plans B and C):** users, rights and hidden groups; the audit log; reports (ledger, cash/bank book, trial balance, P&L, balance sheet, ageing); year-end closing and carry-forward; backup and restore; main-group merged ledgers; Add/Less ledger auto-posting; the Electron/React app, keyboard shortcuts and Help tab; the installer.

**Known limits to revisit:** a concurrency test for numbering needs a real PostgreSQL (PGlite is single-connection), so Plan B adds one that runs when `TEST_DATABASE_URL` is set. The `ledgers.main_group_id` column is a plain `uuid` until the main-group table arrives with the reports.

## Roadmap for the rest of sub-project 1

- **Plan B — Security, reports and year-end:** users and rights, audit log, group/company hiding, ledger/cash-book/trial-balance/P&L/balance-sheet/ageing reports, year-end closing with carry-forward, backup/restore, the HTTP API.
- **Plan C — Desktop app:** Electron shell, login, keyboard-first voucher entry with bill-adjustment grid, report screens, the shortcut registry and **Help tab (F1)**, installers.
