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

## The desktop app

`packages/app` is the Electron front end. See `packages/app/README.md` for how to run it and the release checklist.

## Try it on your own computer

You need Node 22 or newer (`node -v`). In a normal terminal (PowerShell, Command Prompt or Git Bash), from this folder:

```
npm install
npm run demo
```

That builds the desktop app, starts the service with an embedded database (no PostgreSQL needed), and opens the app.
It runs in **test mode**: the login page still opens first, but it has a dashed **Continue as administrator (test only)** button (key **F2**) that skips the password. Then choose a company, choose a year, and Home opens. A yellow "TEST MODE" notice shows at the top. (To try the real login, run `npm run demo -- --login` and use **admin / admin12345**.) Test mode can only be switched on with the embedded development database, never against a real PostgreSQL database, so a real installation always asks for a login. Your data is kept in the `.devdata` folder; delete it to start fresh.
Press **F1** inside the app to see every keyboard shortcut. A suggested first session: create a company, add a few accounts and a
cash book, then press **F4** to enter receipts and **F8** for the ledger report.

If the window never opens and you see `Cannot read properties of undefined (reading 'setPath')`, your terminal belongs to an
editor that sets `ELECTRON_RUN_AS_NODE`; `npm run demo` already handles that, but plain `npm run dev:app` does not.
