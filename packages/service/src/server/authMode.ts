/**
 * Test mode: the server skips the sign-in screen and acts as the first administrator.
 * It exists only to make trying the software quicker, so it is off unless SAS_NO_LOGIN=1 and it
 * refuses to start at all against a real PostgreSQL database (DATABASE_URL) — a production
 * installation can therefore never run without a login by accident.
 */
export function resolveNoLogin(env: Record<string, string | undefined>): boolean {
  if (env.SAS_NO_LOGIN !== '1') return false;
  if (env.DATABASE_URL || !env.SAS_DEV_PGLITE_DIR) {
    throw new Error(
      'Test mode (SAS_NO_LOGIN=1) is only allowed with the embedded development database (SAS_DEV_PGLITE_DIR), ' +
        'never with a real PostgreSQL database. Remove SAS_NO_LOGIN to run with sign-in.',
    );
  }
  return true;
}
