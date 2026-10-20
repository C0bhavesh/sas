# SAS desktop app

Electron + React front end for the SAS accounting service.

## Run it in development

1. Start the service with an embedded database (no PostgreSQL needed):
   `SAS_DEV_PGLITE_DIR=./.devdata ADMIN_PASSWORD=choose-one npm run start:service`
2. In another terminal: `npm run dev:app`
   (If you start it from inside VS Code or another Electron-based editor and the window never opens with an error such as
   "Cannot read properties of undefined (reading 'setPath')", the editor has set `ELECTRON_RUN_AS_NODE`, which makes
   Electron behave as plain Node. Run `unset ELECTRON_RUN_AS_NODE` (or `Remove-Item Env:ELECTRON_RUN_AS_NODE` in PowerShell) first.
   `npm run smoke` clears it by itself.)
3. Sign in as `admin` with the password you chose. The server address is `http://127.0.0.1:4100` by default;
   the app asks for another one if it cannot connect.

## Tests

- `npm test` — unit and component tests (fake API) and the integration tests against the real service.
- `npm run typecheck` — all three packages.
- `npm run smoke -w @sas/app` — builds and starts the real Electron window once and checks it renders.

## Where things are

- Every keyboard shortcut is declared in `src/renderer/shell/screens.ts` (and `keys/registry.ts` for the global ones).
  The Help screen (F1) is generated from those declarations; a test checks every one is listed.
- Screens bind handlers with `useScreenShortcuts(screenId, { shortcutId: handler })`.
- `window.sas` (see `src/preload`) is the only way the renderer reaches the network: requests go to the main
  process, which forwards `/api/...` paths to the configured server.

## Manual checklist before a release

Run with a real PostgreSQL service and a real printer or PDF printer.

- [ ] First run: wrong server address shows the connect screen; correcting it reaches the sign-in screen.
- [ ] Sign in, create a company, accounts, a cash book and a journal book, and an opening balance — mouse not needed.
- [ ] Enter 10 receipts in a row from the keyboard (F4, date, account, amount, Ctrl+S). Note how long it takes; it should feel faster than the old software.
- [ ] Ctrl+B on a receipt line lists the bills; Alt+A fills them; the saved voucher shows them settled in the ageing report.
- [ ] F1 lists every shortcut; typing "pdf" filters it; Esc returns.
- [ ] Reports: print preview looks right on A4; "Save as PDF" and "CSV" files open (the CSV in Excel with Gujarati names intact).
- [ ] A user with only cash-book rights sees only those menu entries and gets a clear message for anything else.
- [ ] Closing a year, reopening it, and locking it behave as the confirmation texts say.
- [ ] Back up, enter a voucher, restore: the voucher is gone and everyone is asked to sign in again.
- [ ] Stop the service while a voucher is half entered, press Ctrl+S: the message appears and nothing typed is lost; start the service and press Ctrl+S again: it saves.
