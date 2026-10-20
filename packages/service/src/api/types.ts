import type { FastifyRequest } from 'fastify';
import type { Actor } from '@sas/shared';
import type { Db } from '../db/types';
import type { BackupConfig } from '../ops/backup';

export interface AppDeps {
  db: Db;
  /** Needed only for the backup and restore routes. */
  backup?: BackupConfig;
  logger?: boolean;
  /** Test mode: requests without a valid token act as the first administrator. Never enable in production. */
  noLogin?: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor | null;
  }
}

export function bearerToken(req: FastifyRequest): string {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}
