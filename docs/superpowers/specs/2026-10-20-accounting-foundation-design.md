# Textile Accounting Software — Foundation (Sub-project 1) Design

Date: 2026-10-20
Status: Draft for review

## 1. Product context

A desktop accounting product sold to many Surat textile traders, functionally comparable to JSM WinSoft and Tamana. The full feature list is in `Accounting_Software_Feature_Spec.md`. Textile only: petrol pump, mobile recharge/FR entry and investment modules are out of scope. Weaving/loom is textile but deferred as an optional later module.

The full product is built as separate sub-projects, each with its own design, plan and build:

1. **Foundation and accounting core** (this document)
2. Trading: item master (pcs/qty/kgs), sales and purchase invoices, returns, orders, challans, broker/transport/haste, stock reports, print formats
3. GST and compliance: GST split, GSTR-1/3B export, 2B reconciliation, e-invoice, e-way bill, TDS/TCS
4. Textile processing: mill and job-work issue/receipt, taka-wise tracking, cutting, shortage, lot costing
5. Cloud subscription layer: one-way sync, backup, mobile view, WhatsApp automation, AI

Sub-projects 2 to 5 are not designed here. Only the hooks they need (UUIDs, change log, book types) are included.

## 2. Decisions made

| Topic | Decision |
|---|---|
| Delivery | Windows desktop app, offline-capable |
| Data location | Client's own PostgreSQL database; source of truth |
| Users per client | Typically 2-5 operators on an office LAN, one server PC |
| Cloud (later, paid) | One-way sync local to cloud; cloud copy is read-only. Cloud-originated entries (e.g. bill photo over WhatsApp) arrive as pending entries approved in the desktop app |
| Company/year storage | One database per installation; company and financial-year columns on every record |
| Language | English UI and printouts. Data stored as Unicode so Gujarati/Hindi text can be added later without schema change |
| Stack | Electron + React (TypeScript) app; Node (TypeScript) service; PostgreSQL. Python only in the future cloud layer |

## 3. Architecture

Three parts, each with one job.

1. **Database (PostgreSQL).** One database per installation. Every row has a UUID, company and financial-year columns, and created/changed stamps. A change-log table records every insert, update and delete for the future sync.
2. **Service (Node, TypeScript).** Runs on the office server PC as a Windows service. It owns all business rules: posting engine, bill-wise adjustment, voucher numbering, user rights, period locks and reports. It is the only writer to the database and exposes a local API.
3. **Desktop app (Electron + React).** Runs on every operator PC. Screens only: keyboard-driven entry forms, in-memory lookup caches, print and PDF output. No accounting logic.

A shared TypeScript package holds data types and validation rules (for example "debits must equal credits"), used by both the app (instant warning) and the service (enforcement).

Installation: one installer sets up the database and service on the server PC; a lighter installer sets up the app on other PCs. A single-PC client installs both on one machine.

## 4. Accounting data model

**Masters**
- Company and Financial year are table rows. A year is open, closed, or locked up to a date.
- Account group is a tree, seeded with the JSM group list (Fixed Assets, Sundry Debtors, Sundry Creditors and so on, each typed Asset/Liability/Income/Expense). Users may add sub-groups.
- Ledger account belongs to a group. Stores party details (address, GSTIN, PAN, credit days, default broker), opening balance per year, and an optional main-group link for merging one real party's accounts.
- Book has a type (cash, bank, journal now; sales and purchase types reserved for sub-project 2), its own numbering series and a default ledger.

**Vouchers.** One common voucher header (company, year, book, number, date, narration, created/changed by, lock flag) and voucher lines. Cash/bank receipt, payment and journal are different screens over the same structure.

**Posting engine.** Saving a voucher writes its lines to one central ledger-entries table (account, debit, credit, date, voucher link). The service enforces debits equal credits inside one database transaction. Editing or deleting a voucher reverses and rewrites its entries in the same transaction. Every report reads this table. All amounts are exact decimals, never floating-point.

**Bill-wise outstanding.** A bill (later: sales or purchase invoice; now: opening or previous-year bill) is registered in an outstanding-bills table with its original amount. Receipt and payment lines match bills through bill-adjustment rows: bill, amount and type (cash, discount, rate difference, claim, bank charge and so on, per the Add/Less setup). Pending equals original minus adjustments. Unmatched money sits on account until adjusted. A bill closes when pending is zero or via "close bill".

**Numbering.** Each book and year has its own counter, allocated inside the save transaction, so two operators never receive the same number. Gaps from deleted vouchers are reported by a missing-entry check.

**Reports in this sub-project:** ledger (account-wise, group-wise, merged main-group), cash/bank book and rojmel, journal book, outstanding (with ageing), trial balance, profit and loss, balance sheet.

## 5. Users, security, audit, year-end

**Users and rights**
- Username and password; passwords stored as salted hashes.
- Rights per user per module: Add, Edit, Delete, Print, Find, Show-in-menu, set in an admin rights grid.
- A user can be blocked from specific account groups and specific companies. Hidden data is also excluded from reports.
- The service checks every request against rights; hiding a button in the app is convenience only.

**Audit log**
- Every add, edit and delete of a voucher, ledger or master writes a row: user, time, record, old and new values. The app cannot edit or delete audit rows.
- Each voucher also keeps created-by/at and modified-by/at.
- Only an admin with a separate right can export the audit log.

**Period lock**
- An admin sets a freeze date per company. No one can add, edit or delete a voucher dated on or before it, regardless of other rights.
- A closed financial year is locked the same way.

**Year-end closing**
- Guided process on the same database; no data is copied.
- Computes closing balances per ledger, writes them as next-year opening balances, and carries forward pending bills with their pending amounts (closing stock joins in sub-project 2).
- Can be re-run until the old year is locked; changing an old-year entry before lock recalculates the carry-forward (equivalent to JSM's unclosing).

**Backup**
- Scheduled PostgreSQL backup to a client-chosen folder. Admin screen has Backup and Restore. Restore requires the admin password.

## 6. Keyboard-first screens and Help tab

**Entry behaviour**
- Enter moves to the next field; Esc goes back.
- F-keys open lookups; typing in a party or item field filters the list instantly from the in-memory cache.
- In voucher grids, Enter on the last field adds a new line, and totals update on every keystroke.
- Every screen is fully usable without a mouse. The key map is identical across screens.

**Help tab**
- A **Help** entry in the main menu (also opened with F1) lists every keyboard shortcut in the app.
- It has two views: global shortcuts (navigation, save, search, print, new line, delete line, switch company/year) and screen-specific shortcuts for the screen currently open.
- A search box filters shortcuts by key or by action.
- The list is generated from the same shortcut registry the screens use, so it cannot drift from the real key map. Adding a shortcut in code adds it to Help automatically.
- Help is read-only and available to every user regardless of rights.

## 7. Errors and safety

- A voucher save is one database transaction. On any failure (unbalanced entry, locked period, number clash, lost connection) nothing is saved and the operator sees a plain message naming the field or rule.
- If the app loses the service connection, it keeps the half-entered voucher on screen and retries the save; typed work is never discarded.
- Each voucher carries a version number. A second PC saving a stale copy is refused with "changed by another user, reload"; nothing is silently overwritten.
- Rounding rules (to the rupee, round-off line) are set per company and applied in one place.

## 8. Testing

- The posting engine and bill-wise adjustment are tested first and hardest: debits equal credits, edit/delete reverse correctly, pending amounts match, numbering is unique under concurrent saves.
- Report totals are tested against fixed sample books: trial balance balances, balance sheet ties to P&L and trial balance.
- Rights, period lock and audit log each have tests that try to break them (saving into a locked period, reading a hidden group).
- Where possible, results are compared with real data: a sample JSM company's ledger and trial balance should match to the paisa.
- A test checks that every shortcut registered in a screen appears in the Help tab.

## 9. Out of scope for this sub-project

Items, stock, invoices, challans, orders, GST computation and returns, e-invoice and e-way bill, TDS/TCS, mill and job-work, weaving, SMS/WhatsApp/email, print formats beyond basic reports, and the cloud layer. The UUIDs, change log and reserved book types are the only provisions for them.

## 10. Open items

- The git repository location will be provided by the user; this spec and all later files are to be stored there.
- A sample JSM company's ledger and trial balance would allow a to-the-paisa check of the reports.
