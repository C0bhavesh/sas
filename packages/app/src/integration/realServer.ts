import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBridgeClient, type ApiClient } from '../renderer/api/client';
import { performRequest, type FetchLike } from '../main/request';

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

export interface RunningServer {
  url: string;
  adminPassword: string;
  stop(): Promise<void>;
}

/** Start the real service on a free port with a throw-away embedded database. Takes several seconds. */
export async function startServer(): Promise<RunningServer> {
  const dir = await mkdtemp(join(tmpdir(), 'sas-it-'));
  const port = await freePort();
  const adminPassword = 'adminpass1';
  const repo = process.cwd(); // vitest runs from the repository root
  const child = spawn(process.execPath, [join(repo, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(repo, 'packages', 'service', 'src', 'server', 'main.ts')], {
    cwd: repo,
    env: { ...process.env, SAS_DEV_PGLITE_DIR: join(dir, 'db'), ADMIN_PASSWORD: adminPassword, PORT: String(port), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));

  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 90_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`The service exited early:\n${log}`);
    try {
      if ((await fetch(`${url}/api/health`)).ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`The service did not start in time:\n${log}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  return {
    url,
    adminPassword,
    async stop() {
      child.kill();
      await new Promise((r) => child.once('exit', r));
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export function realClient(url: string): ApiClient {
  return createBridgeClient({ request: (args) => performRequest(fetch as unknown as FetchLike, url, args) });
}
