import type { FastifyInstance } from 'fastify';
import { NO_RIGHTS, type ModuleName, type Rights } from '@sas/shared';
import { buildApp } from '../api/app';
import type { Db } from '../db/types';
import type { BackupConfig } from '../ops/backup';
import { setRights } from '../security/rights';
import { createUser, login } from '../security/users';
import { seedCompany, type SeededCompany } from './fixtures';
import { createTestDb } from './testDb';

export interface ApiFixture {
  db: Db;
  app: FastifyInstance;
  s: SeededCompany;
  adminId: string;
  adminToken: string;
  /** A non-admin user; `rights` lists what they may do per module. */
  addUser(
    username: string,
    rights?: Partial<Record<ModuleName, Partial<Rights>>>,
  ): Promise<{ id: string; token: string }>;
  auth(token: string): { authorization: string };
  close(): Promise<void>;
}

export async function setupApi(opts: { backup?: BackupConfig; noLogin?: boolean } = {}): Promise<ApiFixture> {
  const db = await createTestDb();
  const s = await seedCompany(db);
  const adminId = await createUser(db, { username: 'boss', password: 'adminpass', isAdmin: true, canExportAudit: true });
  const adminToken = (await login(db, 'boss', 'adminpass')).token;
  const app = buildApp({ db, backup: opts.backup, noLogin: opts.noLogin });
  await app.ready();
  return {
    db,
    app,
    s,
    adminId,
    adminToken,
    async addUser(username, rights = {}) {
      const id = await createUser(db, { username, password: 'pass1234' });
      for (const [module, r] of Object.entries(rights)) {
        await setRights(db, id, module as ModuleName, { ...NO_RIGHTS, ...r });
      }
      return { id, token: (await login(db, username, 'pass1234')).token };
    },
    auth: (token) => ({ authorization: `Bearer ${token}` }),
    async close() {
      await app.close();
      await db.close();
    },
  };
}
