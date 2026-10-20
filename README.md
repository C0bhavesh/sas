# SAS — Textile Accounting Software

Desktop accounting software for Surat textile traders (JSM/Tamana class).

- Feature list: `Accounting_Software_Feature_Spec.md`
- Foundation design: `docs/superpowers/specs/2026-10-20-accounting-foundation-design.md`
- Implementation plans: `docs/superpowers/plans/`

Packages: `packages/shared` (pure rules), `packages/service` (database and business logic).

Run tests: `npm install && npm test`

## Testing against a real PostgreSQL

The normal test run (`npm test`) uses PGlite, an in-memory Postgres, so it needs no installation. Two things are
only meaningful on a real PostgreSQL and are checked separately:

- **Voucher numbering under real concurrency** — point `TEST_DATABASE_URL` at an *empty* database whose name
  contains "test" (the test drops everything in its `public` schema) and run
  `npx vitest run packages/service/src/posting/numbering.pg.test.ts`.
- **Backup and restore** — start the service with `DATABASE_URL=… BACKUP_DIR=… ADMIN_PASSWORD=…
  npm run start:service` with `pg_dump`/`pg_restore` on the `PATH`, then call `POST /api/backup` and
  `POST /api/restore`. Restoring also rolls back the `sessions` table, so everyone must log in again afterwards.

Both were run on 2026-10-20 against PostgreSQL 17.5 (portable Windows binaries): 20 simultaneous saves received
numbers 1–20 with no duplicates, and a restore removed a company created after the backup, refused a wrong
administrator password (403) and left the audit log matching the restored data.
