import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuthError, type ModuleName, type VoucherKind } from '@sas/shared';
import { listPendingBills } from '../../outstanding/billService';
import { getVoucher, listVouchers } from '../../posting/voucherQueries';
import { deleteVoucher, saveVoucher, updateVoucher } from '../../posting/voucherService';
import { assertCompanyVisible, assertLedgersVisible, assertRight, hiddenGroupIds } from '../../security/rights';
import { isoDate, saveVoucherBody, updateVoucherBody, uuid } from '../schemas';
import type { AppDeps } from '../types';

const moduleFor = (kind: VoucherKind): ModuleName => (kind === 'journal' ? 'journal' : 'cash_book');
const idParam = z.object({ id: uuid });
const companyParam = z.object({ companyId: uuid });
const listQuery = z.object({
  yearId: uuid,
  bookId: uuid.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

export function registerVoucherRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.post('/api/vouchers', async (req, reply) => {
    const b = saveVoucherBody.parse(req.body);
    const actor = req.actor!;
    await assertCompanyVisible(db, actor, b.companyId);
    await assertRight(db, actor, moduleFor(b.kind), 'add');
    await assertLedgersVisible(db, actor, b.companyId, b.lines.map((l) => l.ledgerId));
    const result = await saveVoucher(db, { ...b, actorId: actor.userId });
    return reply.code(201).send(result);
  });

  app.get('/api/vouchers/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const actor = req.actor!;
    const v = await getVoucher(db, id);
    await assertCompanyVisible(db, actor, v.companyId);
    await assertRight(db, actor, moduleFor(v.kind), 'find');
    await assertLedgersVisible(db, actor, v.companyId, v.lines.map((l) => l.ledgerId));
    return v;
  });

  app.put('/api/vouchers/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const b = updateVoucherBody.parse(req.body);
    const actor = req.actor!;
    const v = await getVoucher(db, id);
    await assertCompanyVisible(db, actor, v.companyId);
    await assertRight(db, actor, moduleFor(v.kind), 'edit');
    await assertLedgersVisible(db, actor, v.companyId, [
      ...v.lines.map((l) => l.ledgerId),
      ...b.lines.map((l) => l.ledgerId),
    ]);
    return updateVoucher(db, id, b.version, {
      date: b.date,
      narration: b.narration,
      lines: b.lines,
      actorId: actor.userId,
    });
  });

  app.delete('/api/vouchers/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { version } = z.object({ version: z.coerce.number().int().positive() }).parse(req.query);
    const actor = req.actor!;
    const v = await getVoucher(db, id);
    await assertCompanyVisible(db, actor, v.companyId);
    await assertRight(db, actor, moduleFor(v.kind), 'delete');
    await assertLedgersVisible(db, actor, v.companyId, v.lines.map((l) => l.ledgerId));
    await deleteVoucher(db, id, version, actor.userId);
    return reply.code(204).send();
  });

  app.get('/api/companies/:companyId/vouchers', async (req) => {
    const { companyId } = companyParam.parse(req.params);
    const q = listQuery.parse(req.query);
    const actor = req.actor!;
    await assertCompanyVisible(db, actor, companyId);
    try {
      await assertRight(db, actor, 'cash_book', 'find');
    } catch (e) {
      if (!(e instanceof AuthError)) throw e;
      await assertRight(db, actor, 'journal', 'find');
    }
    return listVouchers(db, { companyId, ...q, hiddenGroupIds: await hiddenGroupIds(db, actor, companyId) });
  });

  app.get('/api/companies/:companyId/ledgers/:ledgerId/pending-bills', async (req) => {
    const { companyId, ledgerId } = z.object({ companyId: uuid, ledgerId: uuid }).parse(req.params);
    const actor = req.actor!;
    await assertCompanyVisible(db, actor, companyId);
    await assertRight(db, actor, 'cash_book', 'find');
    await assertLedgersVisible(db, actor, companyId, [ledgerId]);
    return listPendingBills(db, companyId, ledgerId);
  });
}
