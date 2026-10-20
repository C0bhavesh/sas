import { AppError, type Actor } from '@sas/shared';
import type { Db } from '../db/types';
import { assertIsoDate } from '../reports/format';
import { writeAudit } from '../security/audit';
import { assertRight } from '../security/rights';

/** Freeze every entry dated on or before `date`. Pass null to lift the freeze. */
export async function setFreezeDate(db: Db, actor: Actor, companyId: string, date: string | null): Promise<void> {
  if (date !== null) assertIsoDate(date);
  await db.transaction(async (tx) => {
    await assertRight(tx, actor, 'utilities', 'edit');
    const rows = await tx.query<{ freeze_date: string | null }>(
      'SELECT freeze_date FROM companies WHERE id = $1 FOR UPDATE',
      [companyId],
    );
    if (!rows[0]) throw new AppError('NOT_FOUND', 'Company not found');
    await tx.query('UPDATE companies SET freeze_date = $2, version = version + 1, updated_at = now() WHERE id = $1', [
      companyId,
      date,
    ]);
    await writeAudit(tx, {
      userId: actor.userId,
      companyId,
      entity: 'company',
      entityId: companyId,
      action: 'freeze',
      oldValues: { freezeDate: rows[0].freeze_date },
      newValues: { freezeDate: date },
    });
  });
}
