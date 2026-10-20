import type { Db } from '../db/types';
import { createUser } from '../security/users';

/** On a brand-new installation there is no user yet: create the first administrator. */
export async function bootstrapAdmin(db: Db, username: string, password: string): Promise<boolean> {
  const count = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM users');
  if ((count[0]?.n ?? 0) > 0) return false;
  await createUser(db, { username, password, isAdmin: true, canExportAudit: true });
  return true;
}
