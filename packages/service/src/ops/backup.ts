import { execFile } from 'node:child_process';
import { access, mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { AppError, AuthError, type Actor } from '@sas/shared';
import type { Db } from '../db/types';
import { verifyPassword } from '../security/passwords';

export interface PgConn {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface CommandRunner {
  run(cmd: string, args: string[], env: Record<string, string>): Promise<void>;
}

export interface BackupConfig {
  conn: PgConn;
  dir: string;
  runner: CommandRunner;
}

const execFileAsync = promisify(execFile);

/** Runs real programs. The password travels in the environment, never on the command line. */
export function execRunner(): CommandRunner {
  return {
    async run(cmd, args, env) {
      await execFileAsync(cmd, args, { env: { ...process.env, ...env } });
    },
  };
}

const BACKUP_NAME = /^sas-\d{8}-\d{6}\.dump$/;

export function backupFileName(now: Date): string {
  const iso = now.toISOString(); // 2026-10-20T14:30:05.123Z
  return `sas-${iso.slice(0, 10).replaceAll('-', '')}-${iso.slice(11, 19).replaceAll(':', '')}.dump`;
}

export async function backupDatabase(cfg: BackupConfig, now: Date = new Date()): Promise<string> {
  await mkdir(cfg.dir, { recursive: true });
  const file = join(cfg.dir, backupFileName(now));
  try {
    await cfg.runner.run(
      'pg_dump',
      [
        '--format=custom',
        '--no-owner',
        '--file',
        file,
        '--host',
        cfg.conn.host,
        '--port',
        String(cfg.conn.port),
        '--username',
        cfg.conn.user,
        cfg.conn.database,
      ],
      { PGPASSWORD: cfg.conn.password },
    );
  } catch (e) {
    throw new AppError('BACKUP_FAILED', `Backup failed: ${(e as Error).message}`);
  }
  return file;
}

/** Delete all but the newest `keep` backup files. Returns the names removed, oldest first. */
export async function pruneBackups(dir: string, keep: number): Promise<string[]> {
  const names = (await readdir(dir)).filter((n) => BACKUP_NAME.test(n)).sort();
  const remove = names.slice(0, Math.max(0, names.length - keep));
  for (const name of remove) await unlink(join(dir, name));
  return remove;
}

export async function restoreDatabase(
  db: Db,
  cfg: BackupConfig,
  actor: Actor,
  adminPassword: string,
  file: string,
): Promise<void> {
  if (!actor.isAdmin) throw new AuthError('FORBIDDEN', 'Only an administrator can restore a backup');
  const rows = await db.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [
    actor.userId,
  ]);
  if (!rows[0] || !(await verifyPassword(adminPassword, rows[0].password_hash))) {
    throw new AuthError('FORBIDDEN', 'Wrong administrator password');
  }
  const root = resolve(cfg.dir) + sep;
  const target = resolve(file);
  if (!target.startsWith(root)) throw new AppError('INVALID_INPUT', 'The backup file must be inside the backup folder');
  try {
    await access(target);
  } catch {
    throw new AppError('NOT_FOUND', 'Backup file not found');
  }
  try {
    await cfg.runner.run(
      'pg_restore',
      [
        '--clean',
        '--if-exists',
        '--no-owner',
        '--host',
        cfg.conn.host,
        '--port',
        String(cfg.conn.port),
        '--username',
        cfg.conn.user,
        '--dbname',
        cfg.conn.database,
        target,
      ],
      { PGPASSWORD: cfg.conn.password },
    );
  } catch (e) {
    throw new AppError('BACKUP_FAILED', `Restore failed: ${(e as Error).message}`);
  }
}

/** postgres://user:pass@host:port/dbname -> connection parts. */
export function pgConnFromUrl(url: string): PgConn {
  const u = new URL(url);
  const database = u.pathname.replace(/^\//, '');
  if (!database) throw new AppError('INVALID_INPUT', 'The database URL has no database name');
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database,
  };
}

export async function listBackups(dir: string): Promise<{ name: string; path: string; size: number; modified: string }[]> {
  let names: string[];
  try {
    names = (await readdir(dir)).filter((n) => BACKUP_NAME.test(n));
  } catch {
    return [];
  }
  const files = await Promise.all(
    names.sort().reverse().map(async (name) => {
      const path = join(dir, name);
      const info = await stat(path);
      return { name, path, size: info.size, modified: info.mtime.toISOString() };
    }),
  );
  return files;
}
