import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, type ModuleName } from '@sas/shared';
import { setFreezeDate } from '../../ops/companyAdmin';
import { backupDatabase, pruneBackups, restoreDatabase, type BackupConfig } from '../../ops/backup';
import { closeYear, lockYear, reopenYear } from '../../ops/yearEnd';
import { exportAudit, writeAudit } from '../../security/audit';
import {
  assertCompanyVisible,
  assertRight,
  getRights,
  setBlockedGroups,
  setHiddenCompanies,
  setRights,
} from '../../security/rights';
import { createUser, listUsers, setUserStatus } from '../../security/users';
import {
  blockedGroupsBody,
  closeYearBody,
  companyBody,
  freezeBody,
  hiddenCompaniesBody,
  isoDate,
  newUserBody,
  restoreBody,
  setRightsBody,
  statusBody,
  uuid,
} from '../schemas';
import type { AppDeps } from '../types';

const idParam = z.object({ id: uuid });
const KEEP_BACKUPS = 30;

export function registerAdminRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  function backupConfig(): BackupConfig {
    if (!deps.backup) throw new AppError('NOT_CONFIGURED', 'Backup is not configured on this server');
    return deps.backup;
  }

  async function auditUser(actorId: string, userId: string, action: string, newValues: unknown): Promise<void> {
    await writeAudit(db, { userId: actorId, companyId: null, entity: 'user', entityId: userId, action, newValues });
  }

  // ---- users ----
  app.post('/api/users', async (req, reply) => {
    const actor = req.actor!;
    await assertRight(db, actor, 'users', 'add');
    const b = newUserBody.parse(req.body);
    const id = await db.transaction(async (tx) => {
      const userId = await createUser(tx, b);
      await writeAudit(tx, {
        userId: actor.userId,
        companyId: null,
        entity: 'user',
        entityId: userId,
        action: 'add',
        newValues: { username: b.username, isAdmin: b.isAdmin ?? false },
      });
      return userId;
    });
    return reply.code(201).send({ id });
  });

  app.get('/api/users', async (req) => {
    await assertRight(db, req.actor!, 'users', 'find');
    return listUsers(db);
  });

  app.put('/api/users/:id/status', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const b = statusBody.parse(req.body);
    const actor = req.actor!;
    await assertRight(db, actor, 'users', 'edit');
    await db.transaction(async (tx) => {
      await setUserStatus(tx, id, b.status);
      await writeAudit(tx, { userId: actor.userId, companyId: null, entity: 'user', entityId: id, action: 'edit', newValues: b });
    });
    return reply.code(204).send();
  });

  app.get('/api/users/:id/rights', async (req) => {
    const { id } = idParam.parse(req.params);
    await assertRight(db, req.actor!, 'users', 'find');
    return getRights(db, id);
  });

  app.put('/api/users/:id/rights', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const b = setRightsBody.parse(req.body);
    const actor = req.actor!;
    await assertRight(db, actor, 'users', 'edit');
    await db.transaction(async (tx) => {
      for (const [module, rights] of Object.entries(b.rights)) {
        await setRights(tx, id, module as ModuleName, rights);
      }
      await writeAudit(tx, { userId: actor.userId, companyId: null, entity: 'user', entityId: id, action: 'edit', newValues: { rights: b.rights } });
    });
    return reply.code(204).send();
  });

  app.put('/api/users/:id/blocked-groups', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const b = blockedGroupsBody.parse(req.body);
    const actor = req.actor!;
    await assertRight(db, actor, 'users', 'edit');
    await setBlockedGroups(db, id, b.groupIds);
    await auditUser(actor.userId, id, 'edit', { blockedGroups: b.groupIds });
    return reply.code(204).send();
  });

  app.put('/api/users/:id/hidden-companies', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const b = hiddenCompaniesBody.parse(req.body);
    const actor = req.actor!;
    await assertRight(db, actor, 'users', 'edit');
    await setHiddenCompanies(db, id, b.companyIds);
    await auditUser(actor.userId, id, 'edit', { hiddenCompanies: b.companyIds });
    return reply.code(204).send();
  });

  // ---- freeze and year-end ----
  app.post('/api/companies/:companyId/freeze', async (req, reply) => {
    const { companyId } = z.object({ companyId: uuid }).parse(req.params);
    const b = freezeBody.parse(req.body);
    await assertCompanyVisible(db, req.actor!, companyId);
    await setFreezeDate(db, req.actor!, companyId, b.date);
    return reply.code(204).send();
  });

  app.post('/api/years/:yearId/close', async (req) => {
    const { yearId } = z.object({ yearId: uuid }).parse(req.params);
    const b = closeYearBody.parse(req.body);
    await assertCompanyVisible(db, req.actor!, b.companyId);
    return closeYear(db, req.actor!, { companyId: b.companyId, yearId, next: b.next });
  });

  app.post('/api/years/:yearId/reopen', async (req, reply) => {
    const { yearId } = z.object({ yearId: uuid }).parse(req.params);
    const b = companyBody.parse(req.body);
    await assertCompanyVisible(db, req.actor!, b.companyId);
    await reopenYear(db, req.actor!, b.companyId, yearId);
    return reply.code(204).send();
  });

  app.post('/api/years/:yearId/lock', async (req, reply) => {
    const { yearId } = z.object({ yearId: uuid }).parse(req.params);
    const b = companyBody.parse(req.body);
    await assertCompanyVisible(db, req.actor!, b.companyId);
    await lockYear(db, req.actor!, b.companyId, yearId);
    return reply.code(204).send();
  });

  // ---- audit ----
  app.get('/api/audit', async (req) => {
    const q = z
      .object({ companyId: uuid, from: isoDate.optional(), to: isoDate.optional(), entity: z.string().optional() })
      .parse(req.query);
    await assertCompanyVisible(db, req.actor!, q.companyId);
    return exportAudit(db, req.actor!, q);
  });

  // ---- backup ----
  app.post('/api/backup', async (req) => {
    const cfg = backupConfig();
    await assertRight(db, req.actor!, 'utilities', 'add');
    const file = await backupDatabase(cfg);
    const removed = await pruneBackups(cfg.dir, KEEP_BACKUPS);
    return { file, removed };
  });

  app.post('/api/restore', async (req, reply) => {
    const cfg = backupConfig();
    const b = restoreBody.parse(req.body);
    await restoreDatabase(db, cfg, req.actor!, b.adminPassword, b.file);
    return reply.code(204).send();
  });
}
