# Login → Company → Year → Home: design

Status: design approved by the user on 2026-10-20 (mockup `flow-woven`, with one change: no keyboard hint under the Login button).

## Goal

The app opens on a login page only. After login the user sees every company they can work in (or creates one). After choosing a company they see every financial year of that company with what is in it. After choosing a year the Home screen opens. Nothing is chosen automatically any more.

## Flow

```
launch → [connect problem?] → Login → Companies → Years → Home
```

- **Back:** Esc on Years returns to Companies. On Home, the company and year shown in the top bar open the Companies and Years pages again. Logout is available on all three pages and returns to Login.
- **Remembered choice:** the last company is highlighted on the Companies page, so Enter reopens it. Nothing is skipped.
- **Test mode:** when the server reports `loginRequired: false`, the Login page still appears and shows a dashed "Continue as administrator (test only)" button (F2). The button does not exist when `loginRequired` is true, so the final build never shows it. The TEST MODE badge stays.

## Look (approved)

- Ivory page `#faf6ec`, deep teal `#0d3b3d` with a fine woven grid texture, marigold gold `#d99a1e` accent, terracotta `#b4532a` for "Closed", green `#2f7d57` for "Open".
- Headings in Fraunces (serif), everything else in Figtree. Both fonts are bundled with the app (no network at run time).
- English only. No Gujarati text anywhere in the UI. Numbers use Indian grouping, dates `dd-mm-yyyy`.
- The word on the page and button is "Login", not "Sign in".

## Pages

### Login
- Split layout: teal woven panel on the left (SAS, gold rule, "Accounts for the Surat textile trade."), form on the right.
- Username has focus on arrival. Enter in Username moves to Password; Enter in Password logs in. No hint text about this is shown.
- Wrong password: inline message under the form, focus returns to Password with the text selected.
- F2 test button as above.

### Companies
- One card per company the user can see (existing `GET /api/companies`, which already applies hidden-company rules): name, code, GSTIN, number of financial years, and the status of the newest year.
- A "Create company" card (key N) is shown only to users who have the right to create companies. It opens the existing create-company form; saving returns to this page with the new company highlighted.
- Arrow keys choose, Enter opens. A user who has no companies sees the create card, or a plain "No companies are available to you. Ask the administrator." if they lack the right.
- Hint line under the cards: ← → choose, Enter open, N new company, F1 help.

### Years
- A table for the chosen company: Year, Period, Vouchers, Accounts, Last entry, Status (Open / Closed / Locked).
- Newest year first. Up/Down choose, Enter opens, Esc goes back. The remembered year for this company is highlighted.
- Hint line: ↑ ↓ choose, Enter open year, Esc back to companies.
- Starting the next year is **not** part of this work: no such operation exists yet in the service. It is a separate item.

### Home
Unchanged apart from how it is reached. The top bar's company and year become buttons that go back to Companies and Years.

## Service change: year summaries

New endpoint `GET /api/companies/:companyId/year-summaries` (same access check as `/years`). Returns, per year, newest first:

```
{ id, label, startDate, endDate, status, voucherCount, accountCount, lastEntryDate | null }
```

- `voucherCount`: number of rows in `vouchers` for the year.
- `accountCount`: distinct `ledger_id` in `ledger_entries` for the year ("accounts used in this year").
- `lastEntryDate`: latest `voucher_date` for the year, null when there are no vouchers.
- Computed in one grouped SQL query per request, not one query per year.

Company cards need the year count and newest status: `GET /api/companies` is extended with `yearCount` and `latestYearStatus` (null when the company has no years).

## App changes

- `App.tsx` phases: `checking | connect | login | companies | years | ready`. The auto-sign-in for test mode is removed; test mode only reveals the F2 button.
- `SessionProvider` stops auto-picking a company and year. The company and year are set only by the Companies and Years pages. `lastCompanyId` and the remembered year are still stored but used only to highlight.
- New screens `CompaniesPage` and `YearsPage`; `LoginScreen` is restyled; a shared page frame (teal header with SAS, username, Logout) is used by Companies and Years.
- Keyboard: the new pages declare their shortcuts in `shell/screens.ts` so F1 Help lists them (existing completeness test must keep passing).
- Theme: colours and fonts become CSS variables in one stylesheet; the existing screens pick up the palette and fonts without layout changes.

## Testing

- Service: year-summaries returns correct counts and last date for several years, an empty year, and respects company access (a user who cannot see the company gets the same error as `/years`). Companies list returns `yearCount` and `latestYearStatus`.
- App (jsdom, fake client): login focus and Enter-Enter login; wrong password message and focus; F2 button only when `loginRequired` is false; companies page lists cards, opens by Enter, N hidden without the right, empty state; years page rows and formatting, Esc back, Enter opens Home; top bar buttons go back; Logout from each page.
- Integration (real service): login → company → year → Home end to end.
- After building, run the `web-design-guidelines` audit on the new pages.

## Out of scope

Starting the next financial year, editing or deleting companies (separate spec), the installer.
