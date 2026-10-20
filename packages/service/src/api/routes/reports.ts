import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '@sas/shared';
import { outstandingAgeing } from '../../reports/ageing';
import { balanceSheet, profitAndLoss, trialBalance } from '../../reports/financial';
import { cashBookDaily, ledgerReport } from '../../reports/ledgerReport';
import { assertCompanyVisible, assertLedgersVisible, assertRight, hiddenGroupIds } from '../../security/rights';
import { isoDate, uuid } from '../schemas';
import type { AppDeps } from '../types';

const asOnQuery = z.object({ companyId: uuid, yearId: uuid, asOn: isoDate });

export function registerReportRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** Check company and reports right; return the groups this user must not see. */
  async function prepare(req: FastifyRequest, companyId: string): Promise<string[]> {
    const actor = req.actor!;
    await assertCompanyVisible(db, actor, companyId);
    await assertRight(db, actor, 'reports', 'find');
    return hiddenGroupIds(db, actor, companyId);
  }

  app.get('/api/reports/ledger', async (req) => {
    const p = z
      .object({ companyId: uuid, yearId: uuid, ledgerId: uuid, from: isoDate, to: isoDate })
      .parse(req.query);
    await prepare(req, p.companyId);
    await assertLedgersVisible(db, req.actor!, p.companyId, [p.ledgerId]);
    return ledgerReport(db, p);
  });

  for (const [path, run] of [
    ['trial-balance', trialBalance],
    ['profit-loss', profitAndLoss],
    ['balance-sheet', balanceSheet],
  ] as const) {
    app.get(`/api/reports/${path}`, async (req) => {
      const p = asOnQuery.parse(req.query);
      const hidden = await prepare(req, p.companyId);
      return run(db, { ...p, hiddenGroupIds: hidden });
    });
  }

  app.get('/api/reports/ageing', async (req) => {
    const p = z
      .object({
        companyId: uuid,
        asOn: isoDate,
        side: z.enum(['Dr', 'Cr']).optional(),
        ledgerId: uuid.optional(),
      })
      .parse(req.query);
    const hidden = await prepare(req, p.companyId);
    return outstandingAgeing(db, { ...p, hiddenGroupIds: hidden });
  });

  app.get('/api/reports/cash-book', async (req) => {
    const p = z
      .object({ companyId: uuid, yearId: uuid, bookId: uuid, from: isoDate, to: isoDate })
      .parse(req.query);
    await prepare(req, p.companyId);
    const book = await db.query<{ default_ledger_id: string | null }>(
      'SELECT default_ledger_id FROM books WHERE id = $1 AND company_id = $2',
      [p.bookId, p.companyId],
    );
    if (!book[0]) throw new AppError('NOT_FOUND', 'Book not found');
    if (book[0].default_ledger_id) await assertLedgersVisible(db, req.actor!, p.companyId, [book[0].default_ledger_id]);
    return cashBookDaily(db, p);
  });
}
