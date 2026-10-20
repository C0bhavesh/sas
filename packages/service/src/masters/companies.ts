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
