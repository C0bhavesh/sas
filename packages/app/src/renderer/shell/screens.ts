import type { ModuleName } from '@sas/shared';
import { GLOBAL_SHORTCUTS, type ShortcutDecl } from '../keys/registry';

export type ScreenId =
  | 'home'
  | 'help'
  | 'receipt'
  | 'payment'
  | 'journal'
  | 'vouchers'
  | 'company'
  | 'ledgers'
  | 'openings'
  | 'books'
  | 'rLedger'
  | 'rCashBook'
  | 'rTrial'
  | 'rPL'
  | 'rBS'
  | 'rAgeing'
  | 'users'
  | 'utilities'
  | 'audit';

export type ScreenGroup = 'General' | 'Transactions' | 'Masters' | 'Reports' | 'Admin';

export interface ScreenDef {
  id: ScreenId;
  title: string;
  group: ScreenGroup;
  /** Shown to an admin, or to a user who has any right on one of these modules. Empty means everybody. */
  modules: ModuleName[];
  adminOnly?: boolean;
  /** Opens this screen from anywhere. */
  hotkey?: string;
  shortcuts: ShortcutDecl[];
}

export const VOUCHER_KEYS: ShortcutDecl[] = [
  { id: 'save', keys: 'Ctrl+S', description: 'Save the voucher' },
  { id: 'bills', keys: 'Ctrl+B', description: 'Adjust bills against the current line' },
  { id: 'deleteLine', keys: 'Ctrl+Del', description: 'Delete the current line' },
  { id: 'newVoucher', keys: 'Ctrl+N', description: 'Clear the form for a new voucher' },
  { id: 'deleteVoucher', keys: 'Ctrl+D', description: 'Delete this voucher (when editing an existing one)' },
  { id: 'autoAllocate', keys: 'Alt+A', description: 'In the bills panel: fill the amounts from the oldest bill onwards' },
  { id: 'billsDone', keys: 'Ctrl+Enter', description: 'In the bills panel: accept the amounts and close the panel' },
];

const REPORT_KEYS: ShortcutDecl[] = [
  { id: 'run', keys: 'Ctrl+Enter', description: 'Run the report with the chosen dates' },
  { id: 'print', keys: 'Ctrl+P', description: 'Print the report' },
  { id: 'pdf', keys: 'Ctrl+Shift+P', description: 'Save the report as a PDF file' },
  { id: 'csv', keys: 'Ctrl+E', description: 'Export the report to a CSV file (opens in Excel)' },
];

const SAVE: ShortcutDecl[] = [{ id: 'save', keys: 'Ctrl+S', description: 'Save' }];
const NEW_AND_SAVE: ShortcutDecl[] = [{ id: 'new', keys: 'Ctrl+N', description: 'Start a new entry' }, ...SAVE];

export const SCREENS: ScreenDef[] = [
  { id: 'home', title: 'Home', group: 'General', modules: [], shortcuts: [] },
  { id: 'help', title: 'Help — keyboard shortcuts', group: 'General', modules: [], shortcuts: [] },

  { id: 'receipt', title: 'Cash / Bank Receipt', group: 'Transactions', modules: ['cash_book'], hotkey: 'F4', shortcuts: VOUCHER_KEYS },
  { id: 'payment', title: 'Cash / Bank Payment', group: 'Transactions', modules: ['cash_book'], hotkey: 'F5', shortcuts: VOUCHER_KEYS },
  { id: 'journal', title: 'Journal Voucher', group: 'Transactions', modules: ['journal'], hotkey: 'F6', shortcuts: VOUCHER_KEYS },
  {
    id: 'vouchers',
    title: 'Find Voucher',
    group: 'Transactions',
    modules: ['cash_book', 'journal'],
    hotkey: 'F7',
    shortcuts: [
      { id: 'refresh', keys: 'Ctrl+Enter', description: 'Reload the list with the chosen filters' },
      { id: 'open', keys: 'Enter', description: 'Open the highlighted voucher for editing' },
    ],
  },

  { id: 'company', title: 'Company & Years', group: 'Masters', modules: ['company'], shortcuts: SAVE },
  { id: 'ledgers', title: 'Account Master', group: 'Masters', modules: ['account_master'], shortcuts: NEW_AND_SAVE },
  { id: 'openings', title: 'Opening Balances', group: 'Masters', modules: ['account_master'], shortcuts: SAVE },
  { id: 'books', title: 'Book Master', group: 'Masters', modules: ['book_master'], shortcuts: SAVE },

  { id: 'rLedger', title: 'Ledger', group: 'Reports', modules: ['reports'], hotkey: 'F8', shortcuts: REPORT_KEYS },
  { id: 'rCashBook', title: 'Cash / Bank Book', group: 'Reports', modules: ['reports'], shortcuts: REPORT_KEYS },
  { id: 'rTrial', title: 'Trial Balance', group: 'Reports', modules: ['reports'], shortcuts: REPORT_KEYS },
  { id: 'rPL', title: 'Profit & Loss', group: 'Reports', modules: ['reports'], shortcuts: REPORT_KEYS },
  { id: 'rBS', title: 'Balance Sheet', group: 'Reports', modules: ['reports'], shortcuts: REPORT_KEYS },
  { id: 'rAgeing', title: 'Outstanding Ageing', group: 'Reports', modules: ['reports'], shortcuts: REPORT_KEYS },

  { id: 'users', title: 'Users & Rights', group: 'Admin', modules: ['users'], shortcuts: NEW_AND_SAVE },
  { id: 'utilities', title: 'Year-end, Freeze & Backup', group: 'Admin', modules: ['utilities'], shortcuts: [] },
  {
    id: 'audit',
    title: 'Audit Log',
    group: 'Admin',
    modules: [],
    adminOnly: true,
    shortcuts: [
      { id: 'run', keys: 'Ctrl+Enter', description: 'Load the log for the chosen dates' },
      { id: 'csv', keys: 'Ctrl+E', description: 'Export the log to a CSV file (opens in Excel)' },
    ],
  },
];

export const SCREEN_BY_ID = Object.fromEntries(SCREENS.map((s) => [s.id, s])) as Record<ScreenId, ScreenDef>;

/** The hotkeys that open a screen from anywhere. */
export const OPENERS: ShortcutDecl[] = SCREENS.filter((s) => s.hotkey).map((s) => ({
  id: `open:${s.id}`,
  keys: s.hotkey!,
  description: `Open ${s.title}`,
}));

export const ALL_GLOBAL: ShortcutDecl[] = [...GLOBAL_SHORTCUTS, ...OPENERS];
