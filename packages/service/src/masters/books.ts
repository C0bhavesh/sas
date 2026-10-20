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
