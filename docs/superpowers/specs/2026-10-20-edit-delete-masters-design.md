# Edit, Block and Delete for Accounts, Books and Companies — Design

Date: 2026-10-20
Status: Draft for review (design approved in conversation, with one change: see section 3)

## 1. Why

Today the service can create accounts (ledgers), books and companies but cannot change or remove them. A mistyped
party name or GST number cannot be corrected. This adds editing, blocking and deleting, with deletion limited to a
new **superadmin** role and protected by confirmations and a password.

## 2. Roles and rights

| Action | Who |
|---|---|
| Edit an account / book / company | A user with the *Edit* right on that module (`account_master`, `book_master`, `company`), or an administrator |
| Block / unblock an account | Same as edit |
| **Delete** an account / book / company | **Superadmin only**, whatever the user's other rights |
| Make or remove a superadmin | Superadmin only. There must always be at least one |

**Superadmin** is a new flag on a user (`is_superadmin`). The user created at first start is a superadmin. A database
migration marks every *existing* administrator as superadmin so nothing changes for them. An administrator who is not
a superadmin keeps today's powers but cannot delete.

## 3. What delete does

Delete removes the record **and everything entered against it**, always as **whole vouchers**:

- **Delete an account:** every voucher that has a line on it is deleted completely (its other lines, ledger entries,
  bill adjustments and on-account money included), then the account's bills, openings and the account itself.
  A single line is never removed on its own: that would leave the other side of the entry hanging and break the
  trial balance.
- **Delete a book:** all vouchers of the book, its numbering counters, then the book.
- **Delete a company:** everything of the company (vouchers, bills, accounts, books, groups, years, openings, user
  restrictions that refer to it). Audit log rows stay.

### Password rule (the change requested during review)

> If an account has anything entered against it — vouchers, pending or settled bills, on-account money, an opening
> balance, or any document of any kind (challans, orders, invoices and others added later) — it can be deleted
> **only by typing the superadmin's own password**, even though the person is already a superadmin.

- An account, book or company with nothing entered against it: superadmin only, no password.
- Anything with something entered against it: password required.
- **A company always needs the password**, because deleting it removes everything it holds.

"Anything entered" is decided by one function, `usageOf(kind, id)`, backed by a registry of every table that refers to
accounts, books or companies. A test scans the database for every table with a foreign key to those tables and
**fails if one is not in the registry**, so a table added by a later sub-project (challans, orders, invoices) cannot be
forgotten: the build breaks until it is counted.

## 4. Safeguards

1. **Impact first.** Before deleting, the screen asks the server for the impact (counts of vouchers, bills,
   on-account amounts, openings, other documents) and shows it: "This will also delete 14 vouchers and 3 pending bills."
2. **Typed confirmation.** The user types the name of the account, book or company.
3. **Password** as in section 3, sent with the request and checked on the server.
4. **Periods.** Deleting an account or a book is refused if any voucher it would remove lies in a **closed or locked
   year** or on or before the company **freeze date**. The message says what to do (reopen the year or lift the freeze).
   Deleting a *whole company* is exempt: the entire company disappears, so there is no carry-forward to corrupt.
5. **Protected items** cannot be deleted or renamed: an account that is a cash or bank book's ledger (delete or change
   the book first), and the *Profit & Loss A/c* account that year-end closing uses.
6. **Settled money.** If a voucher to be removed holds on-account money that a *surviving* voucher already applied to
   a bill, the delete is refused with a message naming the voucher, rather than silently undoing that settlement.
7. **One transaction.** A delete either removes everything or nothing.
8. **Audit.** Every edit and delete is written to the audit log inside the same transaction: edits with old and new
   values; deletes with the removed record, and for each removed voucher its full snapshot (a company delete stores
   counts and the company record, plus a recommendation shown to the user to take a backup first).
9. **Backup advice.** The confirmation dialog suggests a backup first and links to the backup screen.

## 5. Editing and blocking

- **Account:** name, code, alias, address, city, state code, GSTIN, PAN, credit days. Changing the *group* is allowed
  only while the account has no ledger entries. Name stays unique per company (case-insensitive).
- **Block / unblock** an account: a blocked account disappears from pickers and cannot be used in new vouchers
  (the voucher service already refuses blocked accounts); its history and reports are unchanged.
- **Book:** name and code. Type and the cash/bank ledger can change only while the book has no vouchers.
- **Company:** name, code, GSTIN, PAN, state code, address.
- Edits use the record's `version`, so two people editing the same record get "changed by someone else, reload".
  Books gain a `version` column.

## 6. Service interface

New endpoints (all require a login; rights as in section 2):

| Endpoint | Purpose |
|---|---|
| `GET /api/ledgers/:id` | Full record with `version` (for the edit form) |
| `PUT /api/ledgers/:id` | Edit fields and/or `status` (`active`/`blocked`) |
| `GET /api/ledgers/:id/impact`, `/api/books/:id/impact`, `/api/companies/:id/impact` | What a delete would remove, and whether a password is needed |
| `DELETE /api/ledgers/:id`, `/api/books/:id`, `/api/companies/:id` | Delete; body carries `version` and, when required, `password` |
| `GET/PUT /api/books/:id`, `PUT /api/companies/:id` | Read (books) and edit |
| `PUT /api/users/:id/superadmin` | Set or clear the superadmin flag |

New error code `IN_USE` (409) for refusals that depend on existing data, and `PASSWORD_REQUIRED` (403) when a password
is needed and missing or wrong. `Actor`, `/api/me` and the user list gain `isSuperAdmin`.

## 7. Desktop app

- **Account Master, Book Master, Company & Years:** pressing Enter on a row, or double-clicking it, loads it into the
  form as an *edit* form ("Editing …"); *Ctrl+N* returns to a blank new-item form. *Ctrl+S* saves.
- **Block / Unblock** button and shortcut **Ctrl+L** (accounts).
- **Delete** button and shortcut **Ctrl+D**, shown **only to a superadmin**. It opens the impact dialog: the counts, the
  warning, the typed name, the password box when required, and a backup link. The confirm button stays disabled until
  every requirement is met.
- **Users & Rights:** a *Superadmin* checkbox, editable only by a superadmin.
- The new shortcuts are declared in `screens.ts`, so the F1 Help screen lists them automatically and the existing
  conflict test covers them.

## 8. Testing

- Service, test first, on in-memory PostgreSQL: each edit rule; version conflicts; uniqueness; blocked accounts;
  group-change rule; delete of unused items; cascade delete of an account used by several vouchers keeps the
  trial balance balanced; refusal for closed/locked years, freeze dates, protected accounts, settled on-account
  money; password required exactly when something is entered (and always for companies); wrong password refused;
  non-superadmin refused; audit rows written; one-transaction rollback when a step fails; the schema-scan test
  that every table referring to accounts, books or companies is in the usage registry.
- API: rights, status codes and messages for every endpoint.
- App: edit mode, block/unblock, the impact dialog and its disabled-until-ready confirm button, delete visible only
  to superadmins, shortcuts appear in Help.
- Integration: against the real service, delete an account that has vouchers (with password) and see the ledger
  report and trial balance still balance; confirm a non-superadmin cannot delete.

## 9. Not included

- Undo / restore of a deleted record (use the backup).
- Editing financial years (opening, closing and locking exist already).
- Bulk delete and merging two accounts into one.
- Editing or deleting individual users (users are blocked, not deleted).
- Anything for sub-projects 2 to 5: their record types plug into `usageOf` when they are built.
