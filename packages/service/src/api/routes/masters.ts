import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, AuthError } from '@sas/shared';
import { createBook } from '../../masters/books';
import { createCompany } from '../../masters/companies';
import { createLedger, setOpening } from '../../masters/ledgers';
import { listBooks, listGroups, listLedgers, listOpenings, listYears } from '../../masters/queries';
import { writeAudit } from '../../security/audit';
import { assertCompanyVisible, assertRight, hiddenGroupIds, visibleCompanies } from '../../security/rights';
import { newBookBody, newCompanyBody, newLedgerBody, openingBody, uuid } from '../schemas';
import type { AppDeps } from '../types';

const companyParam = z.object({ companyId: uuid });

export function registerMasterRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.get('/api/companies', async (req) => visibleCompanies(db, req.actor!));

  app.post('/api/companies', async (req, reply) => {
    const actor = req.actor!;
    await assertRight(db, actor, 'company', 'add');
    const b = newCompanyBody.parse(req.body);
    const ids = await createCompany(db, b);
    await writeAudit(db, {
      userId: actor.userId,
      companyId: ids.companyId,
      entity: 'company',
      entityId: ids.companyId,
      action: 'add',
      newValues: b,
    });
    return reply.code(201).send(ids);
  });

  app.get('/api/companies/:companyId/years', async (req) => {
    const { companyId } = companyParam.parse(req.params);
    await assertCompanyVisible(db, req.actor!, companyId);
    return listYears(db, companyId);
  });

  app.get('/api/companies/:companyId/groups', async (req) => {
    const { companyId } = companyParam.parse(req.params);
    const actor = req.actor!;
    await assertCompanyVisible(db, actor, companyId);
    return listGroups(db, companyId, await hiddenGroupIds(db, actor, companyId));
  });

  app.get('/api/companies/:companyId/ledgers', async (req) => {
    const { companyId } = companyParam.parse(req.params);
    const actor = req.actor!;
    await assertCompanyVisible(db, actor, companyId);
    return listLedgers(db, companyId, await hiddenGroupIds(db, actor, companyId));
  });

  app.get('/api/companies/:companyId/books', async (req) => {
    const { companyId } = companyParam.parse(req.params);
    await assertCompanyVisible(db, req.actor!, companyId);
    return listBooks(db, companyId);
  });

  app.post('/api/companies/:companyId/ledgers', async (req, reply) => {
    const { companyId } = companyParam.parse(req.params);
    const b = newLedgerBody.parse(req.body);
    const actor = req.actor!;
    await assertCompanyVisible(db, actor, companyId);
    await assertRight(db, actor, 'account_master', 'add');
    const hidden = await hiddenGroupIds(db, actor, companyId);
    const id = await db.transaction(async (tx) => {
      const group = await tx.query<{ id: string }>('SELECT id FROM account_groups WHERE company_id = $1 AND code = $2', [
        companyId,
        b.groupCode,
      ]);
      if (group[0] && hidden.includes(group[0].id)) {
        throw new AuthError('FORBIDDEN', 'You do not have access to that account group');
      }
      const ledgerId = await createLedger(tx, { companyId, ...b });
      await writeAudit(tx, {
        userId: actor.userId,
        companyId,
        entity: 'ledger',
        entityId: ledgerId,
        action: 'add',
        newValues: b,
      });
      return ledgerId;
    });
    return reply.code(201).send({ id });
  });

  app.post('/api/ledgers/:ledgerId/opening', async (req, reply) => {
    const { ledgerId } = z.object({ ledgerId: uuid }).parse(req.params);
    const b = openingBody.parse(req.body);
    const actor = req.actor!;
    const ledger = (
      await db.query<{ company_id: string; group_id: string }>('SELECT company_id, group_id FROM ledgers WHERE id = $1', [
        ledgerId,
      ])
    )[0];
    if (!ledger) throw new AppError('NOT_FOUND', 'Ledger not found');
    await assertCompanyVisible(db, actor, ledger.company_id);
    await assertRight(db, actor, 'account_master', 'edit');
    if ((await hiddenGroupIds(db, actor, ledger.company_id)).includes(ledger.group_id)) {
      throw new AuthError('FORBIDDEN', 'You do not have access to this account');
    }
    await db.transaction(async (tx) => {
      const year = await tx.query<{ status: string }>('SELECT status FROM financial_years WHERE id = $1 AND company_id = $2', [
        b.yearId,
        ledger.company_id,
      ]);
      if (!year[0]) throw new AppError('NOT_FOUND', 'Financial year not found');
      if (year[0].status !== 'open') {
        throw new AppError('YEAR_BAD_STATE', 'Opening balances can only be changed in an open year');
      }
      await setOpening(tx, ledgerId, b.yearId, b.amount, b.side);
      await writeAudit(tx, {
        userId: actor.userId,
        companyId: ledger.company_id,
        entity: 'ledger_opening',
        entityId: ledgerId,
        action: 'edit',
        newValues: b,
      });
    });
    return reply.code(204).send();
  });

  app.post('/api/companies/:companyId/books', async (req, reply) => {
    const { companyId } = companyParam.parse(req.params);
    const b = newBookBody.parse(req.body);
    const actor = req.actor!;
    await assertCompanyVisible(db, actor, companyId);
    await assertRight(db, actor, 'book_master', 'add');
    const id = await db.transaction(async (tx) => {
      if (b.defaultLedgerId) {
        const own = await tx.query('SELECT 1 FROM ledgers WHERE id = $1 AND company_id = $2', [b.defaultLedgerId, companyId]);
        if (own.length === 0) throw new AppError('INVALID_INPUT', 'That ledger does not belong to this company');
      }
      const bookId = await createBook(tx, { companyId, ...b });
      await writeAudit(tx, { userId: actor.userId, companyId, entity: 'book', entityId: bookId, action: 'add', newValues: b });
      return bookId;
    });
    return reply.code(201).send({ id });
  });

  app.get('/api/companies/:companyId/openings', async (req) => {
    const { companyId } = companyParam.parse(req.params);
    const { yearId } = z.object({ yearId: uuid }).parse(req.query);
    const actor = req.actor!;
    await assertCompanyVisible(db, actor, companyId);
    await assertRight(db, actor, 'account_master', 'find');
    return listOpenings(db, companyId, yearId, await hiddenGroupIds(db, actor, companyId));
  });
}
