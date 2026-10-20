import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../shared/bridge';
import { loadConfig, saveConfig } from './config';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sas-config-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('returns the defaults when there is no file', async () => {
    expect(await loadConfig(dir)).toEqual(DEFAULT_CONFIG);
  });
  it('returns the defaults when the file is damaged', async () => {
    await writeFile(join(dir, 'config.json'), '{not json');
    expect(await loadConfig(dir)).toEqual(DEFAULT_CONFIG);
  });
});

describe('saveConfig', () => {
  it('saves, merges with earlier values and survives a reload', async () => {
    await saveConfig(dir, { serverUrl: 'http://192.168.1.10:4100/' });
    await saveConfig(dir, { lastCompanyId: 'c1', lastYearId: 'y1' });
    const loaded = await loadConfig(dir);
    expect(loaded).toEqual({ serverUrl: 'http://192.168.1.10:4100', lastCompanyId: 'c1', lastYearId: 'y1' });
    expect(JSON.parse(await readFile(join(dir, 'config.json'), 'utf8')).serverUrl).toBe('http://192.168.1.10:4100');
  });
  it('rejects a server address that is not http or https', async () => {
    await expect(saveConfig(dir, { serverUrl: 'file:///etc/passwd' })).rejects.toThrow(/http/i);
    await expect(saveConfig(dir, { serverUrl: 'not a url' })).rejects.toThrow();
  });
  it('ignores keys it does not know', async () => {
    const saved = await saveConfig(dir, { evil: 'x' } as never);
    expect(saved).toEqual(DEFAULT_CONFIG);
  });
});
