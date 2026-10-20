import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_CONFIG, type AppConfig } from '../shared/bridge';

const FILE = 'config.json';

function normalizeUrl(text: string): string {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`"${text}" is not a valid address`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('The server address must start with http:// or https://');
  return url.toString().replace(/\/+$/, '');
}

/** Keep only the keys we know, so a hand-edited or hostile file cannot add settings. */
function pick(raw: Record<string, unknown>): Partial<AppConfig> {
  const out: Partial<AppConfig> = {};
  if (typeof raw.serverUrl === 'string') out.serverUrl = raw.serverUrl;
  if (typeof raw.lastCompanyId === 'string') out.lastCompanyId = raw.lastCompanyId;
  if (typeof raw.lastYearId === 'string') out.lastYearId = raw.lastYearId;
  return out;
}

export async function loadConfig(dir: string): Promise<AppConfig> {
  try {
    const raw = JSON.parse(await readFile(join(dir, FILE), 'utf8')) as Record<string, unknown>;
    return { ...DEFAULT_CONFIG, ...pick(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(dir: string, patch: Partial<AppConfig>): Promise<AppConfig> {
  const next = { ...(await loadConfig(dir)), ...pick(patch as Record<string, unknown>) };
  next.serverUrl = normalizeUrl(next.serverUrl);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, FILE), JSON.stringify(next, null, 2), 'utf8');
  return next;
}
