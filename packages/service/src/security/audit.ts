import { randomUUID } from 'node:crypto';
import { AuthError, type Actor } from '@sas/shared';
import type { Queryable } from '../db/types';

export interface AuditEntry {
  userId: string | null;
  companyId: string | null;
  entity: string;
  entityId: string | null;
  action: string;
  oldValues?: unknown;
  newValues?: unknown;
}

export interface AuditRow {
  at: string;
  userId: string | null;
  username: string | null;
  entity: string;
  entityId: string | null;
  action: string;
  oldValues: unknown;
  newValues: unknown;
}

const json = (v: unknown) => (v === undefined ? null : JSON.stringify(v));

export async function writeAudit(q: Queryable, e: AuditEntry): Promise<void> {
  await q.query(
    `INSERT INTO audit_log(id, user_id, company_id, entity, entity_id, action, old_values, new_values)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,
    [randomUUID(), e.userId, e.companyId, e.entity, e.entityId, e.action, json(e.oldValues), json(e.newValues)],
  );
}

/** Admins with the separate "export audit" right only. */
export async function exportAudit(
  q: Queryable,
  actor: Actor,
  filter: { companyId: string; from?: string; to?: string; entity?: string },
): Promise<AuditRow[]> {
  const allowed = actor.isAdmin
    ? await q.query<{ can_export_audit: boolean }>('SELECT can_export_audit FROM users WHERE id = $1', [actor.userId])
    : [];
  if (!allowed[0]?.can_export_audit) throw new AuthError('FORBIDDEN', 'You may not export the audit log');
  const rows = await q.query<{
    at: string;
    user_id: string | null;
    username: string | null;
    entity: string;
    entity_id: string | null;
    action: string;
    old_values: unknown;
    new_values: unknown;
  }>(
    `SELECT a.at, a.user_id, u.username, a.entity, a.entity_id, a.action, a.old_values, a.new_values
     FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.company_id = $1
       AND ($2::text IS NULL OR a.entity = $2)
       AND ($3::date IS NULL OR a.at >= $3::date)
       AND ($4::date IS NULL OR a.at < $4::date + 1)
     ORDER BY a.at, a.id`,
    [filter.companyId, filter.entity ?? null, filter.from ?? null, filter.to ?? null],
  );
  return rows.map((r) => ({
    at: new Date(r.at).toISOString(),
    userId: r.user_id,
    username: r.username,
    entity: r.entity,
    entityId: r.entity_id,
    action: r.action,
    oldValues: r.old_values,
    newValues: r.new_values,
  }));
}
