import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '@sas/shared';
import type { Db } from '../db/types';
import { createUser } from '../security/users';
import { createTestDb } from '../testing/testDb';
import { backupDatabase, backupFileName, pruneBackups, restoreDatabase, type BackupConfig, type CommandRunner } from './backup';

interface Call {
  cmd: string;
  args: string[];
  env: Record<string, string>;
}

let db: Db;
let dir: string;
let calls: Call[];
let failWith: Error | null;
let cfg: BackupConfig;
let admin: Actor;

beforeEach(async () => {
  db = await createTestDb();
  dir = await mkdtemp(join(tmpdir(), 'sas-backup-'));
  calls = [];
  failWith = null;
  const runner: CommandRunner = {
    async run(cmd, args, env) {
      calls.push({ cmd, args, env });
      if (failWith) throw failWith;
    },
  };
  cfg = { conn: { host: 'localhost', port: 5432, user: 'sas', password: 's3cret', database: 'sasdb' }, dir, runner };
  admin = { userId: await createUser(db, { username: 'boss', password: 'adminpass', isAdmin: true }), username: 'boss', isAdmin: true };
});
afterEach(async () => {
  await db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('backupFileName', () => {
  it('is sortable and uses UTC', () => {
    expect(backupFileName(new Date('2026-10-20T14:30:05Z'))).toBe('sas-20261020-143005.dump');
  });
});

describe('backupDatabase', () => {
  it('runs pg_dump into the backup folder, passing the password only through the environment', async () => {
    const file = await backupDatabase(cfg, new Date('2026-10-20T14:30:05Z'));
    expect(file).toBe(join(dir, 'sas-20261020-143005.dump'));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.cmd).toBe('pg_dump');
    expect(calls[0]?.args).toEqual([
      '--format=custom',
      '--no-owner',
      '--file',
      file,
      '--host',
      'localhost',
      '--port',
      '5432',
      '--username',
      'sas',
      'sasdb',
    ]);
    expect(calls[0]?.env).toEqual({ PGPASSWORD: 's3cret' });
    expect(calls[0]?.args.join(' ')).not.toContain('s3cret');
  });

  it('turns a runner failure into BACKUP_FAILED', async () => {
    failWith = new Error('pg_dump: not found');
    await expect(backupDatabase(cfg)).rejects.toMatchObject({ code: 'BACKUP_FAILED' });
  });
});

describe('pruneBackups', () => {
  it('keeps the newest N backups and leaves other files alone', async () => {
    for (const n of ['sas-20261001-010000.dump', 'sas-20261002-010000.dump', 'sas-20261003-010000.dump', 'sas-20261004-010000.dump', 'notes.txt']) {
      await writeFile(join(dir, n), 'x');
    }
    const removed = await pruneBackups(dir, 2);
    expect(removed).toEqual(['sas-20261001-010000.dump', 'sas-20261002-010000.dump']);
    expect((await readdir(dir)).sort()).toEqual(['notes.txt', 'sas-20261003-010000.dump', 'sas-20261004-010000.dump']);
  });
});

describe('restoreDatabase', () => {
  async function backupFile() {
    const f = join(dir, 'sas-20261020-143005.dump');
    await writeFile(f, 'dump');
    return f;
  }

  it('refuses a wrong password without running anything', async () => {
    const f = await backupFile();
    await expect(restoreDatabase(db, cfg, admin, 'nope', f)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(calls).toHaveLength(0);
  });

  it('refuses a non-admin', async () => {
    const f = await backupFile();
    const clerkId = await createUser(db, { username: 'clerk', password: 'clerkpass' });
    await expect(
      restoreDatabase(db, cfg, { userId: clerkId, username: 'clerk', isAdmin: false }, 'clerkpass', f),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(calls).toHaveLength(0);
  });

  it('refuses a file outside the backup folder', async () => {
    const outside = join(tmpdir(), 'sas-outside.dump');
    await writeFile(outside, 'dump');
    try {
      await expect(restoreDatabase(db, cfg, admin, 'adminpass', outside)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
    } finally {
      await rm(outside, { force: true });
    }
    expect(calls).toHaveLength(0);
  });

  it('reports a missing file', async () => {
    await expect(restoreDatabase(db, cfg, admin, 'adminpass', join(dir, 'sas-19990101-000000.dump'))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('runs pg_restore with the right arguments', async () => {
    const f = await backupFile();
    await restoreDatabase(db, cfg, admin, 'adminpass', f);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.cmd).toBe('pg_restore');
    expect(calls[0]?.args).toEqual([
      '--clean',
      '--if-exists',
      '--no-owner',
      '--host',
      'localhost',
      '--port',
      '5432',
      '--username',
      'sas',
      '--dbname',
      'sasdb',
      f,
    ]);
    expect(calls[0]?.env).toEqual({ PGPASSWORD: 's3cret' });
  });
});
