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
