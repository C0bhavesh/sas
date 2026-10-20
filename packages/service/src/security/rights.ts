import { randomUUID } from 'node:crypto';
import {
  AppError,
  AuthError,
  MODULES,
  NO_RIGHTS,
  type Actor,
  type ModuleName,
  type RightAction,
  type Rights,
} from '@sas/shared';
import type { Db, Queryable } from '../db/types';

const COLUMN: Record<RightAction, string> = {
  add: 'can_add',
  edit: 'can_edit',
  delete: 'can_delete',
  print: 'can_print',
  find: 'can_find',
  show: 'show_menu',
};

export async function setRights(q: Queryable, userId: string, module: ModuleName, rights: Rights): Promise<void> {
  if (!(MODULES as readonly string[]).includes(module)) {
    throw new AppError('INVALID_INPUT', `Unknown module "${module}"`);
  }
  await q.query(
    `INSERT INTO user_rights(id, user_id, module, can_add, can_edit, can_delete, can_print, can_find, show_menu)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (user_id, module) DO UPDATE SET
       can_add = EXCLUDED.can_add, can_edit = EXCLUDED.can_edit, can_delete = EXCLUDED.can_delete,
       can_print = EXCLUDED.can_print, can_find = EXCLUDED.can_find, show_menu = EXCLUDED.show_menu`,
    [randomUUID(), userId, module, rights.add, rights.edit, rights.delete, rights.print, rights.find, rights.show],
  );
}

export async function getRights(q: Queryable, userId: string): Promise<Record<ModuleName, Rights>> {
  const out = Object.fromEntries(MODULES.map((m) => [m, { ...NO_RIGHTS }])) as Record<ModuleName, Rights>;
  const rows = await q.query<{
    module: string;
    can_add: boolean;
    can_edit: boolean;
    can_delete: boolean;
    can_print: boolean;
    can_find: boolean;
    show_menu: boolean;
  }>('SELECT * FROM user_rights WHERE user_id = $1', [userId]);
  for (const r of rows) {
    if (!(MODULES as readonly string[]).includes(r.module)) continue;
    out[r.module as ModuleName] = {
      add: r.can_add,
      edit: r.can_edit,
      delete: r.can_delete,
      print: r.can_print,
      find: r.can_find,
      show: r.show_menu,
    };
  }
  return out;
}

export async function assertRight(
  q: Queryable,
  actor: Actor,
  module: ModuleName,
  action: RightAction,
): Promise<void> {
  if (actor.isAdmin) return;
  const rows = await q.query<{ allowed: boolean }>(
    `SELECT ${COLUMN[action]} AS allowed FROM user_rights WHERE user_id = $1 AND module = $2`,
    [actor.userId, module],
  );
  if (!rows[0]?.allowed) {
    throw new AuthError('FORBIDDEN', `You do not have ${action} rights on ${module.replace('_', ' ')}`);
  }
}

export async function setBlockedGroups(db: Db, userId: string, groupIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query('DELETE FROM user_blocked_groups WHERE user_id = $1', [userId]);
    for (const groupId of groupIds) {
      await tx.query('INSERT INTO user_blocked_groups(id, user_id, group_id) VALUES ($1,$2,$3)', [
        randomUUID(),
        userId,
        groupId,
      ]);
    }
  });
}

/** Blocked groups of this company plus all their sub-groups. Empty for admins. */
export async function hiddenGroupIds(q: Queryable, actor: Actor, companyId: string): Promise<string[]> {
  if (actor.isAdmin) return [];
  const rows = await q.query<{ id: string }>(
    `WITH RECURSIVE g AS (
       SELECT ag.id FROM account_groups ag
       JOIN user_blocked_groups b ON b.group_id = ag.id
       WHERE b.user_id = $1 AND ag.company_id = $2
       UNION
       SELECT c.id FROM account_groups c JOIN g ON c.parent_id = g.id
     )
     SELECT id FROM g`,
    [actor.userId, companyId],
  );
  return rows.map((r) => r.id);
}

export async function assertLedgersVisible(
  q: Queryable,
  actor: Actor,
  companyId: string,
  ledgerIds: string[],
): Promise<void> {
  const hidden = await hiddenGroupIds(q, actor, companyId);
  if (hidden.length === 0 || ledgerIds.length === 0) return;
  const rows = await q.query<{ id: string }>(
    `SELECT id FROM ledgers WHERE company_id = $1 AND id = ANY($2::uuid[]) AND group_id = ANY($3::uuid[])`,
    [companyId, ledgerIds, hidden],
  );
  if (rows.length > 0) throw new AuthError('FORBIDDEN', 'You do not have access to one of these accounts');
}

export async function setHiddenCompanies(db: Db, userId: string, companyIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query('DELETE FROM user_hidden_companies WHERE user_id = $1', [userId]);
    for (const companyId of companyIds) {
      await tx.query('INSERT INTO user_hidden_companies(id, user_id, company_id) VALUES ($1,$2,$3)', [
        randomUUID(),
        userId,
        companyId,
      ]);
    }
  });
}

export async function visibleCompanies(
  q: Queryable,
  actor: Actor,
): Promise<{ id: string; code: string; name: string; gstin: string | null; freezeDate: string | null; yearCount: number; latestYearStatus: string | null }[]> {
  return q.query(
    `SELECT c.id, c.code, c.name, c.gstin, c.freeze_date AS "freezeDate",
            (SELECT COUNT(*) FROM financial_years y WHERE y.company_id = c.id)::int AS "yearCount",
            (SELECT y.status FROM financial_years y WHERE y.company_id = c.id ORDER BY y.start_date DESC LIMIT 1) AS "latestYearStatus"
       FROM companies c
      WHERE $1::boolean OR c.id NOT IN (SELECT company_id FROM user_hidden_companies WHERE user_id = $2)
      ORDER BY c.name`,
    [actor.isAdmin, actor.userId],
  );
}

export async function assertCompanyVisible(q: Queryable, actor: Actor, companyId: string): Promise<void> {
  if (actor.isAdmin) return;
  const hidden = await q.query(
    'SELECT 1 FROM user_hidden_companies WHERE user_id = $1 AND company_id = $2',
    [actor.userId, companyId],
  );
  if (hidden.length > 0) throw new AuthError('FORBIDDEN', 'You do not have access to this company');
}

export async function getUserAccess(q: Queryable, userId: string): Promise<{ blockedGroupIds: string[]; hiddenCompanyIds: string[] }> {
  const groups = await q.query<{ group_id: string }>('SELECT group_id FROM user_blocked_groups WHERE user_id = $1', [userId]);
  const companies = await q.query<{ company_id: string }>('SELECT company_id FROM user_hidden_companies WHERE user_id = $1', [userId]);
  return { blockedGroupIds: groups.map((g) => g.group_id), hiddenCompanyIds: companies.map((c) => c.company_id) };
}
