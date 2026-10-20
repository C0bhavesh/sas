# Foundation Plan C: Desktop App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Windows desktop app that operators use every day: login, keyboard-first voucher entry with bill-wise adjustment, find/edit vouchers, master data, the financial reports, user/rights administration, year-end and backup screens, and a Help tab (F1) that lists every keyboard shortcut.

**Architecture:** An Electron app in a new workspace package `@sas/app`. The renderer is React + TypeScript and contains screens only: no accounting logic beyond reusing the pure voucher rules from `@sas/shared` for instant feedback. It talks to the service from Plan B through a small bridge: the renderer calls `window.sas.request(...)`, the Electron main process forwards the call to the configured server over HTTP (so there is no CORS and no network code in the renderer). Every shortcut is declared once, in `screens.ts`; screens bind handlers to those declarations and the Help screen is generated from the same data.

**Tech Stack:** Electron (newest stable at execution time), electron-vite 2, Vite 5, React 18, TypeScript 5, vitest 2 + jsdom + Testing Library for component tests. The service from Plans A and B runs as the back end.

**Prerequisites:** Plans A and B merged on `main`. `npm test` is green (185 passed, 1 skipped).

**Design spec:** `docs/superpowers/specs/2026-10-20-accounting-foundation-design.md` (sections 3 and 6).

## Decisions made in this plan

| Decision | Choice and reason |
|---|---|
| How the app reaches the server | IPC bridge through the main process; the renderer never opens a network connection. Avoids CORS, keeps the server address in one place, lets the main process refuse any path that is not `/api/...`. |
| Where the login token lives | In renderer memory only. Closing the app logs out; nothing sensitive is written to disk. |
| Styling | One plain CSS file, dense layout, strong focus outline. No UI framework: keyboard behaviour is the product and is easier to get right with our own few components. |
| PDF / CSV / print | Print uses the system print dialog; PDF uses Electron `printToPDF`; CSV is generated in the renderer (with a byte-order mark so Excel reads Gujarati text correctly) and saved through the main process. |
| Installers (NSIS installer, Windows service for the server, bundled PostgreSQL) | **Moved out of this plan** into a Plan D. They need administrator rights and a real PostgreSQL install and cannot be verified here with the same rigour as the screens. |
| Gaps found in the Plan B API | Three small read endpoints are added to the service inside this plan, each in the task that needs it: list opening balances (Task 11), read a user's blocked groups and hidden companies (Task 14), list backup files (Task 15). |

## Global Constraints

- Plan A and B constraints still apply to anything that touches `packages/service` or `packages/shared`: TypeScript `strict`, money as `bigint` paise in code and decimal strings over the wire, one commit per task ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- English-only UI text. All text fields must accept and display Unicode (Gujarati/Hindi names) correctly.
- Money in the UI is a decimal string; any arithmetic uses `toPaise`/`fromPaise` from `@sas/shared`. Never use `Number`, `parseFloat` or floating-point maths on amounts.
- Amounts shown to the user use Indian digit grouping (`12,34,567.50`). Dates are ISO `YYYY-MM-DD` internally and `dd-mm-yyyy` on screen.
- Every screen is fully usable without a mouse. `Enter` moves to the next field; on the last field of a voucher it adds a line; `Esc` closes lists, dialogs and screens (innermost first, by calling `preventDefault()` on the event it consumed).
- Every keyboard shortcut is declared in `packages/app/src/renderer/shell/screens.ts` (or `GLOBAL_SHORTCUTS` / `FORM_SHORTCUTS` in `keys/registry.ts`) and nowhere else. Help is generated from those declarations. No two shortcuts in one scope may share keys, and no screen shortcut may reuse a global or opener key (tested).
- The app contains no business rules the server does not also enforce. Client-side validation is only early feedback; the server's answer always wins and its message is shown as is.
- Electron security: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, a Content-Security-Policy meta tag, and the main process only forwards requests whose path starts with `/api/`.
- The login token is held in memory only. The renderer must return to the login screen when the server answers `401 NOT_AUTHENTICATED` (this also happens after a database restore).
- Test conventions: component tests live next to the component as `*.test.tsx`, use a fake API client (`createFakeClient`) and never hit the network. Tests that need the real service live in Task 16.

## File Structure

```
package.json                                  modify: scripts (dev:app, typecheck)
vitest.config.ts                              modify: include .tsx, jsdom for packages/app, setup file
packages/app/
  package.json  tsconfig.json  electron.vite.config.ts
  src/test-setup.ts
  src/shared/bridge.ts                        types shared by main, preload and renderer
  src/main/index.ts  config.ts  request.ts    Electron main process (+ tests)
  src/preload/index.ts                        contextBridge
  src/renderer/
    index.html  main.tsx  App.tsx  styles.css  env.d.ts
    keys/keys.ts  registry.ts  useShortcuts.ts
    api/client.ts  types.ts  endpoints.ts
    shell/screens.ts  screenComponents.tsx  Shell.tsx  Palette.tsx  SwitchDialog.tsx  Home.tsx  nav.tsx
    session/Session.tsx  Lookups.tsx
    ui/format.ts  dates.ts  NavRoot.tsx  MoneyInput.tsx  DateInput.tsx  Lookup.tsx  DataTable.tsx  Dialog.tsx  Field.tsx
    screens/Help.tsx  ConnectScreen.tsx  LoginScreen.tsx
    vouchers/form.ts  VoucherEntry.tsx  BillAdjuster.tsx  VoucherList.tsx
    masters/CompanyScreen.tsx  LedgerScreen.tsx  OpeningScreen.tsx  BookScreen.tsx
    reports/csv.ts  ReportShell.tsx  LedgerReport.tsx  CashBookReport.tsx  FinancialReports.tsx  AgeingReport.tsx
    admin/UsersScreen.tsx  UtilitiesScreen.tsx  AuditScreen.tsx
    testing/fakeClient.ts  render.tsx  sampleData.ts
  (tests next to each file)
packages/service/src/...                      small additions in Tasks 11, 14, 15 (new read endpoints)
```

---

### Task 1: Package scaffold, Electron main process, test setup and smoke launch

**Files:**
- Create: `packages/app/package.json`, `packages/app/tsconfig.json`, `packages/app/electron.vite.config.ts`
- Create: `packages/app/src/test-setup.ts`
- Create: `packages/app/src/shared/bridge.ts`
- Create: `packages/app/src/main/index.ts`, `packages/app/src/main/config.ts`, `packages/app/src/main/request.ts`
- Create: `packages/app/src/preload/index.ts`
- Create: `packages/app/src/renderer/index.html`, `main.tsx`, `App.tsx`, `styles.css`, `env.d.ts`
- Modify: `vitest.config.ts`, `package.json`, `.gitignore`
- Test: `packages/app/src/main/config.test.ts`, `packages/app/src/main/request.test.ts`, `packages/app/src/renderer/App.test.tsx`

**Interfaces:**
- Produces (`packages/app/src/shared/bridge.ts`):
  ```ts
  export interface AppConfig { serverUrl: string; lastCompanyId?: string; lastYearId?: string }
  export const DEFAULT_CONFIG: AppConfig   // { serverUrl: 'http://127.0.0.1:4100' }
  export interface RequestArgs { method: 'GET' | 'POST' | 'PUT' | 'DELETE'; path: string; body?: unknown; token?: string | null }
  export interface RequestResult { status: number; json: unknown }   // status 0 = server unreachable
  export interface SaveFileArgs { suggestedName: string; data: string; mime: string }
  export interface SasBridge {
    request(args: RequestArgs): Promise<RequestResult>;
    getConfig(): Promise<AppConfig>;
    setConfig(patch: Partial<AppConfig>): Promise<AppConfig>;
    saveFile(args: SaveFileArgs): Promise<boolean>;
    printToPdf(args: { suggestedName: string }): Promise<boolean>;
  }
  ```
- Produces (`main/config.ts`): `loadConfig(dir: string): Promise<AppConfig>`, `saveConfig(dir: string, patch: Partial<AppConfig>): Promise<AppConfig>`.
- Produces (`main/request.ts`): `buildUrl(serverUrl: string, path: string): string`, `performRequest(fetchFn: FetchLike, serverUrl: string, args: RequestArgs): Promise<RequestResult>`.
- Produces: `window.sas: SasBridge` in the renderer; `npm run build -w @sas/app` output in `packages/app/out/`; `npm run smoke -w @sas/app` prints `SMOKE OK` and exits 0.

- [ ] **Step 1: Create the package files**

`packages/app/package.json` (no `"type": "module"`: Electron's main and preload are built as CommonJS):
```json
{
  "name": "@sas/app",
  "version": "0.1.0",
  "private": true,
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "smoke": "electron-vite build && electron . --smoke"
  },
  "dependencies": {
    "@sas/shared": "*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "electron": "^33.2.0",
    "electron-vite": "^2.3.0",
    "jsdom": "^25.0.1",
    "vite": "^5.4.11"
  }
}
```
At execution time run `npm view electron version` and use the newest stable major if it is above 33; the code uses only Electron APIs that have been stable since version 28.

`packages/app/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node", "vite/client"]
  },
  "include": ["src", "electron.vite.config.ts"]
}
```

`packages/app/electron.vite.config.ts`:
```ts
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: { plugins: [react()] },
});
```
(`electron-vite` looks for `src/main/index.ts`, `src/preload/index.ts` and `src/renderer/index.html` by default.)

Add `out/` is already in `.gitignore`. Update the root `package.json` scripts:
```json
    "dev:app": "npm run dev -w @sas/app",
    "typecheck": "tsc --noEmit -p packages/shared && tsc --noEmit -p packages/service && tsc --noEmit -p packages/app"
```
Replace the root `vitest.config.ts` with:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.{ts,tsx}'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Every service test file boots its own in-memory Postgres (PGlite) and hashes passwords with scrypt (16 MB each).
    // With one worker per CPU the machine runs short of memory and scrypt fails with "Deriving bits failed".
    poolOptions: { forks: { minForks: 1, maxForks: 4 } },
    // The desktop app's tests need a DOM; the server's tests do not.
    environmentMatchGlobs: [['packages/app/**', 'jsdom']],
    setupFiles: ['packages/app/src/test-setup.ts'],
  },
});
```

`packages/app/src/test-setup.ts`:
```ts
import { afterEach } from 'vitest';

// Only the app's (jsdom) tests have a document; the service's tests run in plain Node.
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => cleanup());
}
```

- [ ] **Step 2: Write the failing tests**

`packages/app/src/main/config.test.ts`:
```ts
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
```

`packages/app/src/main/request.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildUrl, performRequest, type FetchLike } from './request';

describe('buildUrl', () => {
  it('joins the server address and an /api path', () => {
    expect(buildUrl('http://h:4100/', '/api/me')).toBe('http://h:4100/api/me');
    expect(buildUrl('http://h:4100', '/api/vouchers?x=1')).toBe('http://h:4100/api/vouchers?x=1');
  });
  it('refuses anything that is not an /api path', () => {
    for (const bad of ['/etc/passwd', 'http://evil.example/api/x', '/api/../secret', '/api\\x', 'api/x']) {
      expect(() => buildUrl('http://h:4100', bad)).toThrow(/blocked/i);
    }
  });
});

function fakeFetch(status: number, text: string, seen: { url?: string; init?: Parameters<FetchLike>[1] } = {}): FetchLike {
  return async (url, init) => {
    seen.url = url;
    seen.init = init;
    return { status, text: async () => text };
  };
}

describe('performRequest', () => {
  it('sends JSON and the bearer token, and parses the JSON answer', async () => {
    const seen: { url?: string; init?: Parameters<FetchLike>[1] } = {};
    const r = await performRequest(fakeFetch(201, '{"voucherNo":1}', seen), 'http://h:4100', {
      method: 'POST',
      path: '/api/vouchers',
      body: { a: 1 },
      token: 'tok',
    });
    expect(r).toEqual({ status: 201, json: { voucherNo: 1 } });
    expect(seen.url).toBe('http://h:4100/api/vouchers');
    expect(seen.init?.method).toBe('POST');
    expect(seen.init?.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer tok' });
    expect(seen.init?.body).toBe('{"a":1}');
  });
  it('sends no content-type and no body when there is no body', async () => {
    const seen: { url?: string; init?: Parameters<FetchLike>[1] } = {};
    await performRequest(fakeFetch(204, '', seen), 'http://h:4100', { method: 'DELETE', path: '/api/vouchers/x' });
    expect(seen.init?.headers).toEqual({});
    expect(seen.init?.body).toBeUndefined();
  });
  it('returns json null for an empty answer and a BAD_RESPONSE for non-JSON', async () => {
    expect((await performRequest(fakeFetch(204, ''), 'http://h', { method: 'GET', path: '/api/x' })).json).toBeNull();
    const bad = await performRequest(fakeFetch(502, '<html>bad gateway</html>'), 'http://h', { method: 'GET', path: '/api/x' });
    expect(bad.status).toBe(502);
    expect(bad.json).toMatchObject({ code: 'BAD_RESPONSE' });
  });
  it('reports status 0 when the server cannot be reached', async () => {
    const failing: FetchLike = async () => {
      throw new TypeError('fetch failed');
    };
    const r = await performRequest(failing, 'http://h', { method: 'GET', path: '/api/x' });
    expect(r.status).toBe(0);
    expect(r.json).toMatchObject({ code: 'NETWORK' });
  });
});
```

`packages/app/src/renderer/App.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('shows the product name', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'SAS' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm install && npx vitest run packages/app`
Expected: FAIL — cannot find modules `./config`, `./request`, `./App`. (`npm install` also downloads the Electron binary, about 100 MB.)

- [ ] **Step 4: Write the implementation**

`packages/app/src/shared/bridge.ts`:
```ts
export interface AppConfig {
  serverUrl: string;
  lastCompanyId?: string;
  lastYearId?: string;
}

export const DEFAULT_CONFIG: AppConfig = { serverUrl: 'http://127.0.0.1:4100' };

export interface RequestArgs {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  token?: string | null;
}

/** `status` 0 means the server could not be reached. */
export interface RequestResult {
  status: number;
  json: unknown;
}

export interface SaveFileArgs {
  suggestedName: string;
  data: string;
  mime: string;
}

/** What the preload script exposes to the renderer as `window.sas`. */
export interface SasBridge {
  request(args: RequestArgs): Promise<RequestResult>;
  getConfig(): Promise<AppConfig>;
  setConfig(patch: Partial<AppConfig>): Promise<AppConfig>;
  saveFile(args: SaveFileArgs): Promise<boolean>;
  printToPdf(args: { suggestedName: string }): Promise<boolean>;
}
```

`packages/app/src/main/config.ts`:
```ts
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
```

`packages/app/src/main/request.ts`:
```ts
import type { RequestArgs, RequestResult } from '../shared/bridge';

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ status: number; text(): Promise<string> }>;

/** Only /api/ paths on the configured server may be requested by the renderer. */
export function buildUrl(serverUrl: string, path: string): string {
  if (!path.startsWith('/api/') || path.includes('..') || path.includes('\\') || path.includes('//')) {
    throw new Error(`Blocked request path: ${path}`);
  }
  return serverUrl.replace(/\/+$/, '') + path;
}

export async function performRequest(fetchFn: FetchLike, serverUrl: string, args: RequestArgs): Promise<RequestResult> {
  const url = buildUrl(serverUrl, args.path);
  const headers: Record<string, string> = {};
  if (args.body !== undefined) headers['content-type'] = 'application/json';
  if (args.token) headers.authorization = `Bearer ${args.token}`;
  try {
    const res = await fetchFn(url, {
      method: args.method,
      headers,
      body: args.body === undefined ? undefined : JSON.stringify(args.body),
    });
    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { code: 'BAD_RESPONSE', message: text.slice(0, 200) };
      }
    }
    return { status: res.status, json };
  } catch {
    return {
      status: 0,
      json: { code: 'NETWORK', message: 'Cannot reach the server. Check that it is running and the address is right.' },
    };
  }
}
```

`packages/app/src/main/index.ts`:
```ts
import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppConfig, RequestArgs, SaveFileArgs } from '../shared/bridge';
import { loadConfig, saveConfig } from './config';
import { performRequest, type FetchLike } from './request';

const smoke = process.argv.includes('--smoke');
if (smoke) app.setPath('userData', join(app.getPath('temp'), 'sas-smoke'));

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: !smoke,
    title: 'SAS',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (process.env['ELECTRON_RENDERER_URL']) void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
  return win;
}

async function saveWithDialog(win: BrowserWindow | null, suggestedName: string, data: string | Buffer): Promise<boolean> {
  const options = { defaultPath: suggestedName };
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return false;
  await writeFile(result.filePath, data);
  return true;
}

function runSmoke(win: BrowserWindow): void {
  const fail = (why: string) => {
    console.error(`SMOKE FAIL: ${why}`);
    app.exit(1);
  };
  const timer = setTimeout(() => fail('timeout'), 30000);
  win.webContents.on('did-fail-load', (_e, code, desc) => fail(`load failed ${code} ${desc}`));
  win.webContents.once('did-finish-load', async () => {
    try {
      await new Promise((r) => setTimeout(r, 1500));
      const bridgeOk = await win.webContents.executeJavaScript('typeof window.sas?.request === "function"');
      const text: string = await win.webContents.executeJavaScript('document.body.innerText');
      if (!bridgeOk) return fail('the preload bridge (window.sas) is missing');
      if (!/SAS/.test(text)) return fail(`the app did not render: "${text.slice(0, 80)}"`);
      clearTimeout(timer);
      console.log('SMOKE OK');
      app.exit(0);
    } catch (e) {
      fail(String(e));
    }
  });
}

void app.whenReady().then(() => {
  if (app.isPackaged) Menu.setApplicationMenu(null);
  const dir = app.getPath('userData');
  const fetchFn = fetch as unknown as FetchLike;

  ipcMain.handle('config:get', () => loadConfig(dir));
  ipcMain.handle('config:set', (_e, patch: Partial<AppConfig>) => saveConfig(dir, patch));
  ipcMain.handle('api:request', async (_e, args: RequestArgs) => performRequest(fetchFn, (await loadConfig(dir)).serverUrl, args));
  ipcMain.handle('file:save', (e, a: SaveFileArgs) =>
    saveWithDialog(BrowserWindow.fromWebContents(e.sender), a.suggestedName, '﻿' + a.data.replace(/^﻿/, '')),
  );
  ipcMain.handle('file:pdf', async (e, a: { suggestedName: string }) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return false;
    const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
    return saveWithDialog(win, a.suggestedName, pdf);
  });

  const win = createWindow();
  if (smoke) runSmoke(win);
});

app.on('window-all-closed', () => app.quit());
```
(The `file:save` handler adds a UTF-8 byte-order mark so Excel opens CSV files with Gujarati text correctly; the renderer's CSV text must not add its own.)

`packages/app/src/preload/index.ts`:
```ts
import { contextBridge, ipcRenderer } from 'electron';
import type { SasBridge } from '../shared/bridge';

const bridge: SasBridge = {
  request: (args) => ipcRenderer.invoke('api:request', args),
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  saveFile: (args) => ipcRenderer.invoke('file:save', args),
  printToPdf: (args) => ipcRenderer.invoke('file:pdf', args),
};

contextBridge.exposeInMainWorld('sas', bridge);
```

`packages/app/src/renderer/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://localhost:* http://localhost:*"
    />
    <title>SAS</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`packages/app/src/renderer/env.d.ts`:
```ts
import type { SasBridge } from '../shared/bridge';

declare global {
  interface Window {
    sas: SasBridge;
  }
}

export {};
```

`packages/app/src/renderer/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`packages/app/src/renderer/App.tsx` (replaced in Task 5):
```tsx
export function App() {
  return (
    <main>
      <h1>SAS</h1>
    </main>
  );
}
```

`packages/app/src/renderer/styles.css`:
```css
:root {
  --bg: #f4f5f7;
  --panel: #ffffff;
  --ink: #1b1f24;
  --muted: #5b6573;
  --line: #d3d8df;
  --accent: #1f5fbf;
  --accent-ink: #ffffff;
  --bad: #b3261e;
  --good: #1e7d3a;
  font-family: 'Segoe UI', 'Noto Sans Gujarati', 'Nirmala UI', system-ui, sans-serif;
  font-size: 15px;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); }
h1, h2, h3 { margin: 0 0 8px; }
button, input, select, textarea { font: inherit; }
input, select, textarea { padding: 4px 6px; border: 1px solid var(--line); border-radius: 3px; background: #fff; color: inherit; }
input:focus, select:focus, textarea:focus, button:focus, [tabindex]:focus { outline: 3px solid var(--accent); outline-offset: 0; }
button { padding: 5px 12px; border: 1px solid var(--line); border-radius: 3px; background: var(--panel); cursor: pointer; }
button.primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
kbd { padding: 1px 6px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 3px; background: #fff; font: 600 0.85em ui-monospace, Consolas, monospace; white-space: nowrap; }
.err { color: var(--bad); }
.ok { color: var(--good); }
.muted { color: var(--muted); }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.app { display: grid; grid-template-rows: auto 1fr auto; height: 100vh; }
.topbar { display: flex; gap: 16px; align-items: center; padding: 6px 12px; background: var(--ink); color: #fff; }
.topbar .spacer { flex: 1; }
.layout { display: grid; grid-template-columns: 220px 1fr; min-height: 0; }
.menu { overflow: auto; padding: 8px; background: var(--panel); border-right: 1px solid var(--line); }
.menu h3 { margin: 12px 0 4px; font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
.menu button { display: flex; justify-content: space-between; width: 100%; margin-bottom: 2px; text-align: left; border-color: transparent; }
.menu button[aria-current='page'] { background: #e5eefb; border-color: var(--accent); }
.main { overflow: auto; padding: 14px 18px; }
.statusbar { padding: 4px 12px; border-top: 1px solid var(--line); background: var(--panel); font-size: 0.9em; }
.panel { padding: 12px; margin-bottom: 12px; background: var(--panel); border: 1px solid var(--line); border-radius: 4px; }
.form-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; margin-bottom: 10px; }
.field { display: flex; flex-direction: column; gap: 3px; }
.field > span { font-size: 0.85em; color: var(--muted); }
table.data { width: 100%; border-collapse: collapse; background: var(--panel); }
table.data th, table.data td { padding: 4px 8px; border-bottom: 1px solid var(--line); text-align: left; }
table.data th.num, table.data td.num { text-align: right; }
table.data tr[aria-selected='true'] { background: #e5eefb; }
table.data tfoot td { font-weight: 600; border-top: 2px solid var(--line); }
.lookup { position: relative; }
.lookup ul { position: absolute; z-index: 20; left: 0; right: 0; max-height: 260px; margin: 2px 0 0; padding: 0; overflow: auto; list-style: none; background: #fff; border: 1px solid var(--accent); border-radius: 3px; min-width: 260px; }
.lookup li { display: flex; justify-content: space-between; gap: 12px; padding: 4px 8px; cursor: pointer; }
.lookup li[aria-selected='true'] { background: var(--accent); color: var(--accent-ink); }
.overlay { position: fixed; inset: 0; z-index: 50; display: flex; align-items: flex-start; justify-content: center; padding-top: 12vh; background: rgba(0, 0, 0, 0.35); }
.dialog { min-width: 420px; max-width: 80vw; padding: 16px; background: var(--panel); border-radius: 6px; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3); }
.voucher-grid input.money { width: 130px; text-align: right; }
.voucher-grid .account { min-width: 280px; }
@media print {
  .no-print, .menu, .topbar, .statusbar { display: none !important; }
  .layout { display: block; }
  .main { overflow: visible; padding: 0; }
  body { background: #fff; }
}
```

- [ ] **Step 5: Run the tests, the build and the type-check**

Run: `npx vitest run packages/app && npm run build -w @sas/app && npm run typecheck`
Expected: the app tests PASS (config 5, request 6, App 1); the build writes `packages/app/out/main/index.js`, `out/preload/index.js` and `out/renderer/index.html`; `tsc` prints no errors.

- [ ] **Step 6: Smoke-launch the real Electron app**

Run: `npm run smoke -w @sas/app`
Expected: output ends with `SMOKE OK` and the exit code is 0. If it prints `SMOKE FAIL: the preload bridge (window.sas) is missing`, check that `out/preload/index.js` exists and that the `preload` path in `main/index.ts` matches it. If Electron cannot open a window at all (no desktop session), note it in the task report and rely on the build plus the component tests.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts .gitignore packages/app
git commit -m "feat(app): Electron scaffold with IPC bridge, config store and smoke launch" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Keyboard engine — key parsing, shortcut registry, `useShortcuts`

**Files:**
- Create: `packages/app/src/renderer/keys/keys.ts`, `registry.ts`, `useShortcuts.ts`
- Test: `packages/app/src/renderer/keys/keys.test.ts`, `registry.test.ts`, `useShortcuts.test.tsx`

**Interfaces:**
- Produces (`keys/keys.ts`): `interface KeyCombo { ctrl: boolean; alt: boolean; shift: boolean; key: string }`; `parseKeys(spec: string): KeyCombo` (throws on an unknown modifier or an empty spec; accepts aliases `Esc`, `Del`, `Up`, `Down`, `PgUp`, `PgDn`, `Space`); `matchesKey(e: KeyEventLike, spec: string | KeyCombo): boolean` (`Cmd`/Meta counts as Ctrl; modifiers must match exactly); `formatKeys(spec: string): string` (canonical display such as `Ctrl+Shift+P`, `Esc`, `Del`); `keysEqual(a: string, b: string): boolean`.
- Produces (`keys/registry.ts`): `interface ShortcutDecl { id: string; keys: string; description: string }`; `GLOBAL_SHORTCUTS: ShortcutDecl[]` (ids `help`, `openScreen`, `openScreenAlt`, `switchCompany`, `close`); `FORM_SHORTCUTS: ShortcutDecl[]` (information-only entries for typing in forms); `findConflicts(globals: ShortcutDecl[], screens: { id: string; title: string; shortcuts: ShortcutDecl[] }[]): string[]` (empty when fine).
- Produces (`keys/useShortcuts.ts`): `useShortcuts(decls: ShortcutDecl[], handlers: Record<string, () => void>, enabled?: boolean): void`. It listens on `window` for `keydown`; ignores events that are already `defaultPrevented`; calls `preventDefault()` on the ones it handles; throws if `handlers` has an id that is not in `decls`.

- [ ] **Step 1: Write the failing tests**

`packages/app/src/renderer/keys/keys.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatKeys, keysEqual, matchesKey, parseKeys } from './keys';

const ev = (key: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean } = {}) => ({
  key,
  ctrlKey: !!mods.ctrl,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
  metaKey: !!mods.meta,
});

describe('parseKeys', () => {
  it('parses modifiers and keys case-insensitively', () => {
    expect(parseKeys('Ctrl+Shift+p')).toEqual({ ctrl: true, alt: false, shift: true, key: 'P' });
    expect(parseKeys('alt+a')).toEqual({ ctrl: false, alt: true, shift: false, key: 'A' });
    expect(parseKeys('F1')).toEqual({ ctrl: false, alt: false, shift: false, key: 'F1' });
    expect(parseKeys('f10').key).toBe('F10');
  });
  it('understands aliases', () => {
    expect(parseKeys('Esc').key).toBe('Escape');
    expect(parseKeys('Ctrl+Del').key).toBe('Delete');
    expect(parseKeys('Down').key).toBe('ArrowDown');
    expect(parseKeys('PgUp').key).toBe('PageUp');
    expect(parseKeys('Space').key).toBe(' ');
    expect(parseKeys('Ctrl+Enter').key).toBe('Enter');
  });
  it('rejects bad specs', () => {
    expect(() => parseKeys('')).toThrow();
    expect(() => parseKeys('Hyper+S')).toThrow(/modifier/i);
  });
});

describe('matchesKey', () => {
  it('matches letters whatever the case of the event key', () => {
    expect(matchesKey(ev('s', { ctrl: true }), 'Ctrl+S')).toBe(true);
    expect(matchesKey(ev('S', { ctrl: true }), 'Ctrl+S')).toBe(true);
  });
  it('needs the modifiers to match exactly', () => {
    expect(matchesKey(ev('s'), 'Ctrl+S')).toBe(false);
    expect(matchesKey(ev('s', { ctrl: true, shift: true }), 'Ctrl+S')).toBe(false);
    expect(matchesKey(ev('P', { ctrl: true, shift: true }), 'Ctrl+Shift+P')).toBe(true);
    expect(matchesKey(ev('F1'), 'Ctrl+F1')).toBe(false);
  });
  it('treats the Meta key as Ctrl', () => {
    expect(matchesKey(ev('k', { meta: true }), 'Ctrl+K')).toBe(true);
  });
  it('matches named keys', () => {
    expect(matchesKey(ev('Escape'), 'Esc')).toBe(true);
    expect(matchesKey(ev('Enter', { ctrl: true }), 'Ctrl+Enter')).toBe(true);
    expect(matchesKey(ev('Delete', { ctrl: true }), 'Ctrl+Del')).toBe(true);
    expect(matchesKey(ev('F9'), 'F9')).toBe(true);
    expect(matchesKey(ev('F8'), 'F9')).toBe(false);
  });
});

describe('formatKeys / keysEqual', () => {
  it('prints a canonical, human form', () => {
    expect(formatKeys('ctrl+shift+p')).toBe('Ctrl+Shift+P');
    expect(formatKeys('Escape')).toBe('Esc');
    expect(formatKeys('ctrl+delete')).toBe('Ctrl+Del');
    expect(formatKeys('f1')).toBe('F1');
    expect(formatKeys('Down')).toBe('Down');
  });
  it('compares specs by meaning', () => {
    expect(keysEqual('ctrl+s', 'Ctrl+S')).toBe(true);
    expect(keysEqual('Esc', 'Escape')).toBe(true);
    expect(keysEqual('Ctrl+S', 'Alt+S')).toBe(false);
  });
});
```

`packages/app/src/renderer/keys/registry.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { findConflicts, FORM_SHORTCUTS, GLOBAL_SHORTCUTS } from './registry';

describe('declared shortcuts', () => {
  it('every global shortcut has an id, parseable keys and a description', () => {
    const ids = GLOBAL_SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of [...GLOBAL_SHORTCUTS, ...FORM_SHORTCUTS]) {
      expect(s.description.length).toBeGreaterThan(5);
    }
    expect(ids).toEqual(expect.arrayContaining(['help', 'openScreen', 'switchCompany', 'close']));
  });
});

describe('findConflicts', () => {
  const globals = [{ id: 'help', keys: 'F1', description: 'Help' }];
  it('is empty for a clean set', () => {
    expect(
      findConflicts(globals, [
        { id: 'a', title: 'A', shortcuts: [{ id: 'save', keys: 'Ctrl+S', description: 'Save' }] },
        { id: 'b', title: 'B', shortcuts: [{ id: 'save', keys: 'Ctrl+S', description: 'Save' }] },
      ]),
    ).toEqual([]);
  });
  it('reports a screen shortcut that reuses a global key', () => {
    const out = findConflicts(globals, [{ id: 'a', title: 'A', shortcuts: [{ id: 'x', keys: 'f1', description: 'X' }] }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/A/);
    expect(out[0]).toMatch(/F1/);
  });
  it('reports two shortcuts on one screen that share keys, and duplicate ids', () => {
    const out = findConflicts(globals, [
      {
        id: 'a',
        title: 'A',
        shortcuts: [
          { id: 'x', keys: 'Ctrl+S', description: 'X' },
          { id: 'y', keys: 'ctrl+s', description: 'Y' },
          { id: 'x', keys: 'Ctrl+Q', description: 'X again' },
        ],
      },
    ]);
    expect(out.length).toBe(2);
  });
});
```

`packages/app/src/renderer/keys/useShortcuts.test.tsx`:
```tsx
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ShortcutDecl } from './registry';
import { useShortcuts } from './useShortcuts';

const DECLS: ShortcutDecl[] = [
  { id: 'save', keys: 'Ctrl+S', description: 'Save' },
  { id: 'help', keys: 'F1', description: 'Help' },
];

function Probe(props: { handlers: Record<string, () => void>; enabled?: boolean }) {
  useShortcuts(DECLS, props.handlers, props.enabled ?? true);
  return <div>probe</div>;
}

describe('useShortcuts', () => {
  it('calls the handler for a declared key and prevents the default action', () => {
    const save = vi.fn();
    render(<Probe handlers={{ save }} />);
    const proceeded = fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(save).toHaveBeenCalledTimes(1);
    expect(proceeded).toBe(false); // fireEvent returns false when preventDefault() was called
  });

  it('ignores keys without a handler', () => {
    const save = vi.fn();
    render(<Probe handlers={{ save }} />);
    fireEvent.keyDown(window, { key: 'F1' });
    expect(save).not.toHaveBeenCalled();
  });

  it('does nothing while disabled', () => {
    const save = vi.fn();
    render(<Probe handlers={{ save }} enabled={false} />);
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(save).not.toHaveBeenCalled();
  });

  it('skips events that something closer already handled', () => {
    const save = vi.fn();
    render(<Probe handlers={{ save }} />);
    const e = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true, bubbles: true });
    e.preventDefault();
    window.dispatchEvent(e);
    expect(save).not.toHaveBeenCalled();
  });

  it('uses the latest handler after a re-render', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Probe handlers={{ save: first }} />);
    rerender(<Probe handlers={{ save: second }} />);
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops listening when unmounted', () => {
    const save = vi.fn();
    const { unmount } = render(<Probe handlers={{ save }} />);
    unmount();
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(save).not.toHaveBeenCalled();
  });

  it('refuses a handler for a shortcut that was never declared', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe handlers={{ nope: () => {} }} />)).toThrow(/nope/);
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/app/src/renderer/keys`
Expected: FAIL — cannot find modules `./keys`, `./registry`, `./useShortcuts`.

- [ ] **Step 3: Write the implementation**

`packages/app/src/renderer/keys/keys.ts`:
```ts
export interface KeyCombo {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  /** Normalised: single letters upper-case, named keys as in KeyboardEvent.key ("Enter", "Escape", "F1"). */
  key: string;
}

export interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey?: boolean;
}

const ALIASES: Record<string, string> = {
  esc: 'Escape',
  escape: 'Escape',
  del: 'Delete',
  delete: 'Delete',
  enter: 'Enter',
  return: 'Enter',
  space: ' ',
  tab: 'Tab',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  pgup: 'PageUp',
  pageup: 'PageUp',
  pgdn: 'PageDown',
  pagedown: 'PageDown',
  home: 'Home',
  end: 'End',
  insert: 'Insert',
  backspace: 'Backspace',
};

const DISPLAY: Record<string, string> = {
  Escape: 'Esc',
  Delete: 'Del',
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
};

export function parseKeys(spec: string): KeyCombo {
  const parts = spec
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) throw new Error(`Empty key spec "${spec}"`);
  const combo: KeyCombo = { ctrl: false, alt: false, shift: false, key: '' };
  parts.forEach((raw, i) => {
    const lower = raw.toLowerCase();
    if (i < parts.length - 1) {
      if (lower === 'ctrl' || lower === 'control' || lower === 'cmd') combo.ctrl = true;
      else if (lower === 'alt') combo.alt = true;
      else if (lower === 'shift') combo.shift = true;
      else throw new Error(`Unknown modifier "${raw}" in "${spec}"`);
    } else if (ALIASES[lower] !== undefined) combo.key = ALIASES[lower]!;
    else if (/^f\d{1,2}$/i.test(raw)) combo.key = raw.toUpperCase();
    else combo.key = raw.length === 1 ? raw.toUpperCase() : raw;
  });
  return combo;
}

export function matchesKey(e: KeyEventLike, spec: string | KeyCombo): boolean {
  const c = typeof spec === 'string' ? parseKeys(spec) : spec;
  const ctrl = e.ctrlKey || !!e.metaKey;
  if (ctrl !== c.ctrl || e.altKey !== c.alt || e.shiftKey !== c.shift) return false;
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return key === c.key;
}

export function formatKeys(spec: string): string {
  const c = parseKeys(spec);
  const parts: string[] = [];
  if (c.ctrl) parts.push('Ctrl');
  if (c.alt) parts.push('Alt');
  if (c.shift) parts.push('Shift');
  parts.push(DISPLAY[c.key] ?? c.key);
  return parts.join('+');
}

export function keysEqual(a: string, b: string): boolean {
  return formatKeys(a) === formatKeys(b);
}
```

`packages/app/src/renderer/keys/registry.ts`:
```ts
import { formatKeys, keysEqual } from './keys';

export interface ShortcutDecl {
  id: string;
  keys: string;
  description: string;
}

/** Work everywhere in the app. Screen-opening hotkeys (F4, F5, …) are added in screens.ts. */
export const GLOBAL_SHORTCUTS: ShortcutDecl[] = [
  { id: 'help', keys: 'F1', description: 'Open this list of keyboard shortcuts' },
  { id: 'openScreen', keys: 'F2', description: 'Go to any screen: type part of its name and press Enter' },
  { id: 'openScreenAlt', keys: 'Ctrl+K', description: 'Same as F2: go to any screen by name' },
  { id: 'switchCompany', keys: 'F9', description: 'Switch company or financial year' },
  { id: 'close', keys: 'Esc', description: 'Close the open list or dialog, or go back to the previous screen' },
];

/** Behaviour of form controls. Shown in Help for information; the controls handle these keys themselves. */
export const FORM_SHORTCUTS: ShortcutDecl[] = [
  { id: 'next', keys: 'Enter', description: 'Move to the next field. On the last field of a voucher, add a new line' },
  { id: 'previous', keys: 'Shift+Tab', description: 'Go back to the previous field' },
  { id: 'openList', keys: 'Down', description: 'In an account or book field: open the list of choices' },
  { id: 'moveInList', keys: 'Up', description: 'In a list of choices: move to the previous choice (Down moves to the next)' },
  { id: 'pick', keys: 'Enter', description: 'In a list of choices: pick the highlighted one and move on' },
  { id: 'closeList', keys: 'Esc', description: 'In a list of choices: close it without picking' },
];

interface ScreenLike {
  id: string;
  title: string;
  shortcuts: ShortcutDecl[];
}

/** Problems with the declared shortcuts, as readable messages. Empty means everything is fine. */
export function findConflicts(globals: ShortcutDecl[], screens: ScreenLike[]): string[] {
  const problems: string[] = [];
  for (const s of screens) {
    const seenIds = new Set<string>();
    s.shortcuts.forEach((d, i) => {
      if (seenIds.has(d.id)) problems.push(`${s.title}: the shortcut id "${d.id}" is declared twice`);
      seenIds.add(d.id);
      for (const g of globals) {
        if (keysEqual(d.keys, g.keys)) {
          problems.push(`${s.title}: ${formatKeys(d.keys)} (${d.id}) is already used everywhere for "${g.description}"`);
        }
      }
      for (const other of s.shortcuts.slice(i + 1)) {
        if (keysEqual(d.keys, other.keys)) {
          problems.push(`${s.title}: ${formatKeys(d.keys)} is used for both "${d.id}" and "${other.id}"`);
        }
      }
    });
  }
  return problems;
}
```

`packages/app/src/renderer/keys/useShortcuts.ts`:
```ts
import { useEffect, useRef } from 'react';
import { matchesKey } from './keys';
import type { ShortcutDecl } from './registry';

/**
 * Bind handlers to declared shortcuts. `handlers` is keyed by shortcut id; only the ids present are active.
 * Events already handled by something closer (a list closing on Esc, say) are left alone.
 */
export function useShortcuts(decls: ShortcutDecl[], handlers: Record<string, () => void>, enabled = true): void {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    if (!enabled) return;
    for (const id of Object.keys(latest.current)) {
      if (!decls.some((d) => d.id === id)) throw new Error(`The shortcut "${id}" is not declared`);
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      for (const d of decls) {
        const handler = latest.current[d.id];
        if (handler && matchesKey(e, d.keys)) {
          e.preventDefault();
          handler();
          return;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [decls, enabled]);
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/app/src/renderer/keys`
Expected: PASS — keys (9), registry (4), useShortcuts (7).

- [ ] **Step 5: Commit**

```bash
git add packages/app
git commit -m "feat(app): keyboard engine with key parsing, shortcut registry and useShortcuts" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Screen registry and the Help screen (F1)

**Files:**
- Create: `packages/app/src/renderer/shell/screens.ts`
- Create: `packages/app/src/renderer/screens/Help.tsx`
- Create: `packages/app/src/renderer/keys/useScreenShortcuts.ts`
- Test: `packages/app/src/renderer/shell/screens.test.ts`, `packages/app/src/renderer/screens/Help.test.tsx`

**Interfaces:**
- Consumes: `ShortcutDecl`, `GLOBAL_SHORTCUTS`, `FORM_SHORTCUTS`, `findConflicts`, `formatKeys`, `useShortcuts` (Task 2).
- Produces (`shell/screens.ts`): `type ScreenId = 'home' | 'help' | 'receipt' | 'payment' | 'journal' | 'vouchers' | 'company' | 'ledgers' | 'openings' | 'books' | 'rLedger' | 'rCashBook' | 'rTrial' | 'rPL' | 'rBS' | 'rAgeing' | 'users' | 'utilities' | 'audit'`; `interface ScreenDef { id: ScreenId; title: string; group: 'General' | 'Transactions' | 'Masters' | 'Reports' | 'Admin'; modules: ModuleName[]; adminOnly?: boolean; hotkey?: string; shortcuts: ShortcutDecl[] }`; `SCREENS: ScreenDef[]`; `SCREEN_BY_ID: Record<ScreenId, ScreenDef>`; `OPENERS: ShortcutDecl[]` (one per screen that has a `hotkey`, id `open:<screenId>`); `ALL_GLOBAL: ShortcutDecl[]` (`GLOBAL_SHORTCUTS` + `OPENERS`).
- Produces (`keys/useScreenShortcuts.ts`): `useScreenShortcuts(screenId: ScreenId, handlers: Record<string, () => void>, enabled?: boolean): void`.
- Produces (`screens/Help.tsx`): `<Help />` — a searchable table of every shortcut, generated from the declarations. Each row carries `data-shortcut="<scope>:<id>"` where scope is `global`, `forms` or the screen id.

**Screens and hotkeys (single source of truth):** F4 Cash/Bank Receipt, F5 Cash/Bank Payment, F6 Journal Voucher, F7 Find Voucher, F8 Ledger report. The voucher screens share `Ctrl+S` save, `Ctrl+B` bills, `Ctrl+Del` delete line, `Ctrl+N` new voucher, `Ctrl+D` delete voucher, `Alt+A` auto-fill bills, `Ctrl+Enter` accept bills. Report screens share `Ctrl+Enter` run, `Ctrl+P` print, `Ctrl+Shift+P` PDF, `Ctrl+E` CSV.

- [ ] **Step 1: Write the failing tests**

`packages/app/src/renderer/shell/screens.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { MODULES } from '@sas/shared';
import { parseKeys } from '../keys/keys';
import { findConflicts, GLOBAL_SHORTCUTS } from '../keys/registry';
import { ALL_GLOBAL, OPENERS, SCREEN_BY_ID, SCREENS } from './screens';

describe('screen registry', () => {
  it('has unique ids and titles, and an entry in SCREEN_BY_ID for each', () => {
    const ids = SCREENS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(SCREENS.map((s) => s.title)).size).toBe(SCREENS.length);
    for (const s of SCREENS) expect(SCREEN_BY_ID[s.id]).toBe(s);
  });

  it('only refers to modules that exist', () => {
    for (const s of SCREENS) for (const m of s.modules) expect(MODULES).toContain(m);
  });

  it('every declared key parses', () => {
    for (const s of SCREENS) {
      if (s.hotkey) expect(() => parseKeys(s.hotkey!)).not.toThrow();
      for (const d of s.shortcuts) expect(() => parseKeys(d.keys)).not.toThrow();
    }
  });

  it('has no conflicting shortcuts anywhere', () => {
    expect(findConflicts(ALL_GLOBAL, SCREENS)).toEqual([]);
  });

  it('openers are unique and do not collide with the global shortcuts', () => {
    const everything = [...GLOBAL_SHORTCUTS, ...OPENERS];
    const forms = everything.map((d) => parseKeys(d.keys));
    const seen = new Set(forms.map((c) => JSON.stringify(c)));
    expect(seen.size).toBe(everything.length);
    expect(OPENERS.map((o) => o.id)).toEqual(expect.arrayContaining(['open:receipt', 'open:payment', 'open:journal', 'open:vouchers', 'open:rLedger']));
  });

  it('keeps the shortcuts the spec promises on the voucher screens', () => {
    for (const id of ['receipt', 'payment', 'journal'] as const) {
      const ids = SCREEN_BY_ID[id].shortcuts.map((d) => d.id);
      expect(ids).toEqual(expect.arrayContaining(['save', 'deleteLine', 'newVoucher']));
    }
    for (const id of ['rLedger', 'rCashBook', 'rTrial', 'rPL', 'rBS', 'rAgeing'] as const) {
      expect(SCREEN_BY_ID[id].shortcuts.map((d) => d.id)).toEqual(expect.arrayContaining(['run', 'print', 'pdf', 'csv']));
    }
  });
});
```

`packages/app/src/renderer/screens/Help.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FORM_SHORTCUTS } from '../keys/registry';
import { ALL_GLOBAL, SCREENS } from '../shell/screens';
import { Help } from './Help';

describe('Help', () => {
  it('lists every declared shortcut exactly once (it cannot drift from the real key map)', () => {
    const { container } = render(<Help />);
    const expected: string[] = [
      ...ALL_GLOBAL.map((d) => `global:${d.id}`),
      ...FORM_SHORTCUTS.map((d) => `forms:${d.id}`),
      ...SCREENS.flatMap((s) => s.shortcuts.map((d) => `${s.id}:${d.id}`)),
    ];
    const rows = Array.from(container.querySelectorAll('[data-shortcut]')).map((r) => r.getAttribute('data-shortcut'));
    expect(rows.sort()).toEqual([...expected].sort());
  });

  it('shows the keys and the description of a shortcut', () => {
    render(<Help />);
    const row = document.querySelector('[data-shortcut="global:help"]')!;
    expect(row).toHaveTextContent('F1');
    expect(row).toHaveTextContent('keyboard shortcuts');
  });

  it('shows the screen-opening hotkeys under "Everywhere"', () => {
    render(<Help />);
    expect(document.querySelector('[data-shortcut="global:open:receipt"]')).toHaveTextContent('F4');
  });

  it('filters by key and by words', async () => {
    const user = userEvent.setup();
    const { container } = render(<Help />);
    const search = screen.getByRole('searchbox', { name: 'Search shortcuts' });
    await user.type(search, 'pdf');
    const rows = Array.from(container.querySelectorAll('[data-shortcut]'));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => /pdf/i.test(r.textContent ?? ''))).toBe(true);

    await user.clear(search);
    await user.type(search, 'ctrl+s');
    expect(container.querySelector('[data-shortcut="receipt:save"]')).not.toBeNull();
    expect(container.querySelector('[data-shortcut="global:help"]')).toBeNull();
  });

  it('says so when nothing matches', async () => {
    const user = userEvent.setup();
    render(<Help />);
    await user.type(screen.getByRole('searchbox', { name: 'Search shortcuts' }), 'zzzzzz');
    expect(screen.getByText(/no shortcuts match/i)).toBeInTheDocument();
  });

  it('matches a screen name and then shows all of that screen\'s shortcuts', async () => {
    const user = userEvent.setup();
    const { container } = render(<Help />);
    await user.type(screen.getByRole('searchbox', { name: 'Search shortcuts' }), 'trial balance');
    expect(container.querySelector('[data-shortcut="rTrial:run"]')).not.toBeNull();
    expect(container.querySelector('[data-shortcut="rTrial:csv"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/app/src/renderer/shell packages/app/src/renderer/screens`
Expected: FAIL — cannot find modules `./screens`, `./Help`.

- [ ] **Step 3: Write the implementation**

`packages/app/src/renderer/shell/screens.ts`:
```ts
import type { ModuleName } from '@sas/shared';
import { GLOBAL_SHORTCUTS, type ShortcutDecl } from '../keys/registry';

export type ScreenId =
  | 'home'
  | 'help'
  | 'receipt'
  | 'payment'
  | 'journal'
  | 'vouchers'
  | 'company'
  | 'ledgers'
  | 'openings'
  | 'books'
  | 'rLedger'
  | 'rCashBook'
  | 'rTrial'
  | 'rPL'
  | 'rBS'
  | 'rAgeing'
  | 'users'
  | 'utilities'
  | 'audit';

export type ScreenGroup = 'General' | 'Transactions' | 'Masters' | 'Reports' | 'Admin';

export interface ScreenDef {
  id: ScreenId;
  title: string;
  group: ScreenGroup;
  /** Shown to an admin, or to a user who has any right on one of these modules. Empty means everybody. */
  modules: ModuleName[];
  adminOnly?: boolean;
  /** Opens this screen from anywhere. */
  hotkey?: string;
  shortcuts: ShortcutDecl[];
}

const VOUCHER_KEYS: ShortcutDecl[] = [
  { id: 'save', keys: 'Ctrl+S', description: 'Save the voucher' },
  { id: 'bills', keys: 'Ctrl+B', description: 'Adjust bills against the current line' },
  { id: 'deleteLine', keys: 'Ctrl+Del', description: 'Delete the current line' },
  { id: 'newVoucher', keys: 'Ctrl+N', description: 'Clear the form for a new voucher' },
  { id: 'deleteVoucher', keys: 'Ctrl+D', description: 'Delete this voucher (when editing an existing one)' },
  { id: 'autoAllocate', keys: 'Alt+A', description: 'In the bills panel: fill the amounts from the oldest bill onwards' },
  { id: 'billsDone', keys: 'Ctrl+Enter', description: 'In the bills panel: accept the amounts and close the panel' },
];

const REPORT_KEYS: ShortcutDecl[] = [
  { id: 'run', keys: 'Ctrl+Enter', description: 'Run the report with the chosen dates' },
  { id: 'print', keys: 'Ctrl+P', description: 'Print the report' },
  { id: 'pdf', keys: 'Ctrl+Shift+P', description: 'Save the report as a PDF file' },
  { id: 'csv', keys: 'Ctrl+E', description: 'Export the report to a CSV file (opens in Excel)' },
];

const SAVE: ShortcutDecl[] = [{ id: 'save', keys: 'Ctrl+S', description: 'Save' }];
const NEW_AND_SAVE: ShortcutDecl[] = [{ id: 'new', keys: 'Ctrl+N', description: 'Start a new entry' }, ...SAVE];

export const SCREENS: ScreenDef[] = [
  { id: 'home', title: 'Home', group: 'General', modules: [], shortcuts: [] },
  { id: 'help', title: 'Help — keyboard shortcuts', group: 'General', modules: [], shortcuts: [] },

  { id: 'receipt', title: 'Cash / Bank Receipt', group: 'Transactions', modules: ['cash_book'], hotkey: 'F4', shortcuts: VOUCHER_KEYS },
  { id: 'payment', title: 'Cash / Bank Payment', group: 'Transactions', modules: ['cash_book'], hotkey: 'F5', shortcuts: VOUCHER_KEYS },
  { id: 'journal', title: 'Journal Voucher', group: 'Transactions', modules: ['journal'], hotkey: 'F6', shortcuts: VOUCHER_KEYS },
  {
    id: 'vouchers',
    title: 'Find Voucher',
    group: 'Transactions',
    modules: ['cash_book', 'journal'],
    hotkey: 'F7',
    shortcuts: [
      { id: 'refresh', keys: 'Ctrl+Enter', description: 'Reload the list with the chosen filters' },
      { id: 'open', keys: 'Enter', description: 'Open the highlighted voucher for editing' },
    ],
  },

  { id: 'company', title: 'Company & Years', group: 'Masters', modules: ['company'], shortcuts: SAVE },
  { id: 'ledgers', title: 'Account Master', group: 'Masters', modules: ['account_master'], shortcuts: NEW_AND_SAVE },
  { id: 'openings', title: 'Opening Balances', group: 'Masters', modules: ['account_master'], shortcuts: SAVE },
  { id: 'books', title: 'Book Master', group: 'Masters', modules: ['book_master'], shortcuts: SAVE },

  { id: 'rLedger', title: 'Ledger', group: 'Reports', modules: ['reports'], hotkey: 'F8', shortcuts: REPORT_KEYS },
  { id: 'rCashBook', title: 'Cash / Bank Book', group: 'Reports', modules: ['reports'], shortcuts: REPORT_KEYS },
  { id: 'rTrial', title: 'Trial Balance', group: 'Reports', modules: ['reports'], shortcuts: REPORT_KEYS },
  { id: 'rPL', title: 'Profit & Loss', group: 'Reports', modules: ['reports'], shortcuts: REPORT_KEYS },
  { id: 'rBS', title: 'Balance Sheet', group: 'Reports', modules: ['reports'], shortcuts: REPORT_KEYS },
  { id: 'rAgeing', title: 'Outstanding Ageing', group: 'Reports', modules: ['reports'], shortcuts: REPORT_KEYS },

  { id: 'users', title: 'Users & Rights', group: 'Admin', modules: ['users'], shortcuts: NEW_AND_SAVE },
  { id: 'utilities', title: 'Year-end, Freeze & Backup', group: 'Admin', modules: ['utilities'], shortcuts: [] },
  {
    id: 'audit',
    title: 'Audit Log',
    group: 'Admin',
    modules: [],
    adminOnly: true,
    shortcuts: [
      { id: 'run', keys: 'Ctrl+Enter', description: 'Load the log for the chosen dates' },
      { id: 'csv', keys: 'Ctrl+E', description: 'Export the log to a CSV file (opens in Excel)' },
    ],
  },
];

export const SCREEN_BY_ID = Object.fromEntries(SCREENS.map((s) => [s.id, s])) as Record<ScreenId, ScreenDef>;

/** The hotkeys that open a screen from anywhere. */
export const OPENERS: ShortcutDecl[] = SCREENS.filter((s) => s.hotkey).map((s) => ({
  id: `open:${s.id}`,
  keys: s.hotkey!,
  description: `Open ${s.title}`,
}));

export const ALL_GLOBAL: ShortcutDecl[] = [...GLOBAL_SHORTCUTS, ...OPENERS];
```

`packages/app/src/renderer/keys/useScreenShortcuts.ts`:
```ts
import { SCREEN_BY_ID, type ScreenId } from '../shell/screens';
import { useShortcuts } from './useShortcuts';

/** Bind handlers to the shortcuts a screen declared in screens.ts. */
export function useScreenShortcuts(screenId: ScreenId, handlers: Record<string, () => void>, enabled = true): void {
  useShortcuts(SCREEN_BY_ID[screenId].shortcuts, handlers, enabled);
}
```

`packages/app/src/renderer/screens/Help.tsx`:
```tsx
import { useState } from 'react';
import { formatKeys } from '../keys/keys';
import { FORM_SHORTCUTS, type ShortcutDecl } from '../keys/registry';
import { ALL_GLOBAL, SCREENS } from '../shell/screens';

interface Section {
  scope: string;
  title: string;
  items: ShortcutDecl[];
}

/** Every shortcut in the app, generated from the same declarations the screens bind to. */
export function Help() {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const sections: Section[] = [
    { scope: 'global', title: 'Everywhere', items: ALL_GLOBAL },
    { scope: 'forms', title: 'Typing in forms', items: FORM_SHORTCUTS },
    ...SCREENS.filter((s) => s.shortcuts.length > 0).map((s) => ({ scope: s.id, title: s.title, items: s.shortcuts })),
  ];

  const visible = sections
    .map((section) => {
      const titleHit = q !== '' && section.title.toLowerCase().includes(q);
      const items = section.items.filter(
        (d) =>
          q === '' ||
          titleHit ||
          formatKeys(d.keys).toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q),
      );
      return { ...section, items };
    })
    .filter((section) => section.items.length > 0);

  return (
    <div>
      <h2>Keyboard shortcuts</h2>
      <p className="muted">Everything can be done from the keyboard. Type to search by key or by what it does.</p>
      <input
        type="search"
        role="searchbox"
        aria-label="Search shortcuts"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="e.g. save, Ctrl+S, pdf"
        style={{ width: 320, marginBottom: 12 }}
      />
      {visible.length === 0 && <p>No shortcuts match "{query}".</p>}
      {visible.map((section) => (
        <section key={section.scope} aria-label={section.title} className="panel">
          <h3>{section.title}</h3>
          <table className="data">
            <tbody>
              {section.items.map((d) => (
                <tr key={`${section.scope}:${d.id}`} data-shortcut={`${section.scope}:${d.id}`}>
                  <td style={{ width: 160 }}>
                    <kbd>{formatKeys(d.keys)}</kbd>
                  </td>
                  <td>{d.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/app`
Expected: PASS — registry (6), Help (6) and all earlier app tests.

- [ ] **Step 5: Commit**

```bash
git add packages/app
git commit -m "feat(app): screen registry with declared shortcuts and a generated Help screen" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: API client layer — bridge client, errors, endpoints, fake client

**Files:**
- Create: `packages/app/src/renderer/api/client.ts`, `types.ts`, `endpoints.ts`
- Create: `packages/app/src/renderer/testing/fakeClient.ts`
- Test: `packages/app/src/renderer/api/client.test.ts`, `packages/app/src/renderer/api/endpoints.test.ts`

**Interfaces:**
- Consumes: `SasBridge`, `RequestArgs`, `RequestResult` (Task 1).
- Produces (`api/client.ts`):
  ```ts
  export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
  export class ApiError extends Error { constructor(public status: number, public code: string, message: string) }
  export interface ApiClient {
    request<T = unknown>(method: Method, path: string, body?: unknown): Promise<T>;   // 204 resolves to undefined
    setToken(token: string | null): void;
    onUnauthorized: (() => void) | null;     // called when the server answers 401 NOT_AUTHENTICATED
  }
  export function createBridgeClient(bridge: Pick<SasBridge, 'request'>): ApiClient;
  ```
- Produces (`api/types.ts`): the response shapes used by the screens: `CompanyLite`, `YearLite`, `GroupLite`, `LedgerLite`, `BookLite`, `PendingBill`, `VoucherView`, `VoucherSummary`, `SaveVoucherBody`, `UpdateVoucherBody`, `MeResponse` (see code below; they mirror the Plan B API).
- Produces (`api/endpoints.ts`): `health`, `login`, `logout`, `me`, `listYears`, `listGroups`, `listLedgers`, `listBooks`, `pendingBills`, `saveVoucher`, `getVoucher`, `updateVoucher`, `deleteVoucher`, `listVouchers`; each takes the `ApiClient` first. Later tasks append the endpoints they need.
- Produces (`testing/fakeClient.ts`): `createFakeClient(routes: FakeRoute[]): FakeClient` where `FakeRoute = { method: Method; path: string | RegExp; reply: (req: { path: string; query: URLSearchParams; body: any }) => unknown }`; `FakeClient extends ApiClient` and has `calls: { method: Method; path: string; body?: unknown }[]`. A route's `reply` may throw an `ApiError`; returning `undefined` means "204 no content"; an unmatched request throws `ApiError(404, 'NO_ROUTE', …)`.

- [ ] **Step 1: Write the failing tests**

`packages/app/src/renderer/api/client.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import type { RequestArgs, RequestResult } from '../../shared/bridge';
import { ApiError, createBridgeClient } from './client';

function bridgeReturning(result: RequestResult) {
  const request = vi.fn(async (_args: RequestArgs) => result);
  return { request };
}

describe('createBridgeClient', () => {
  it('sends the method, path, body and token and returns the JSON', async () => {
    const bridge = bridgeReturning({ status: 200, json: { ok: true } });
    const api = createBridgeClient(bridge);
    api.setToken('tok');
    const out = await api.request<{ ok: boolean }>('POST', '/api/x', { a: 1 });
    expect(out).toEqual({ ok: true });
    expect(bridge.request).toHaveBeenCalledWith({ method: 'POST', path: '/api/x', body: { a: 1 }, token: 'tok' });
  });

  it('resolves to undefined for 204', async () => {
    const api = createBridgeClient(bridgeReturning({ status: 204, json: null }));
    expect(await api.request('DELETE', '/api/x')).toBeUndefined();
  });

  it('throws ApiError with the server code and message', async () => {
    const api = createBridgeClient(bridgeReturning({ status: 422, json: { code: 'NOT_BALANCED', message: 'Debits 1 and credits 2 differ' } }));
    await expect(api.request('POST', '/api/vouchers', {})).rejects.toMatchObject({
      name: 'ApiError',
      status: 422,
      code: 'NOT_BALANCED',
      message: 'Debits 1 and credits 2 differ',
    });
  });

  it('turns an unreachable server into a NETWORK error', async () => {
    const api = createBridgeClient(bridgeReturning({ status: 0, json: { code: 'NETWORK', message: 'Cannot reach the server.' } }));
    const err = await api.request('GET', '/api/x').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.code).toBe('NETWORK');
  });

  it('gives a generic message when the error body has none', async () => {
    const api = createBridgeClient(bridgeReturning({ status: 500, json: null }));
    const err = await api.request('GET', '/api/x').catch((e) => e);
    expect(err.code).toBe('ERROR');
    expect(err.message).toMatch(/500/);
  });

  it('calls onUnauthorized for 401 NOT_AUTHENTICATED only', async () => {
    const onUnauthorized = vi.fn();
    const expired = createBridgeClient(bridgeReturning({ status: 401, json: { code: 'NOT_AUTHENTICATED', message: 'Please log in' } }));
    expired.onUnauthorized = onUnauthorized;
    await expired.request('GET', '/api/me').catch(() => {});
    expect(onUnauthorized).toHaveBeenCalledTimes(1);

    const badLogin = createBridgeClient(bridgeReturning({ status: 401, json: { code: 'BAD_CREDENTIALS', message: 'Wrong username or password' } }));
    badLogin.onUnauthorized = onUnauthorized;
    await badLogin.request('POST', '/api/login', {}).catch(() => {});
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
```

`packages/app/src/renderer/api/endpoints.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ApiError } from './client';
import * as api from './endpoints';
import { createFakeClient } from '../testing/fakeClient';

describe('fake client', () => {
  it('records calls, matches by method and path, and passes the query and body', async () => {
    const client = createFakeClient([
      { method: 'GET', path: '/api/companies/c1/years', reply: () => [{ id: 'y1' }] },
      { method: 'POST', path: /^\/api\/vouchers$/, reply: ({ body }) => ({ voucherId: 'v1', voucherNo: body.n }) },
      { method: 'GET', path: '/api/q', reply: ({ query }) => ({ x: query.get('x') }) },
      { method: 'DELETE', path: '/api/gone', reply: () => undefined },
    ]);
    expect(await client.request('GET', '/api/companies/c1/years')).toEqual([{ id: 'y1' }]);
    expect(await client.request('POST', '/api/vouchers', { n: 7 })).toEqual({ voucherId: 'v1', voucherNo: 7 });
    expect(await client.request('GET', '/api/q?x=5')).toEqual({ x: '5' });
    expect(await client.request('DELETE', '/api/gone')).toBeUndefined();
    expect(client.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /api/companies/c1/years',
      'POST /api/vouchers',
      'GET /api/q?x=5',
      'DELETE /api/gone',
    ]);
  });

  it('throws what a route throws, and 404 NO_ROUTE for anything unmatched', async () => {
    const client = createFakeClient([
      {
        method: 'POST',
        path: '/api/boom',
        reply: () => {
          throw new ApiError(409, 'STALE_VERSION', 'changed');
        },
      },
    ]);
    await expect(client.request('POST', '/api/boom')).rejects.toMatchObject({ status: 409, code: 'STALE_VERSION' });
    await expect(client.request('GET', '/api/none')).rejects.toMatchObject({ status: 404, code: 'NO_ROUTE' });
  });
});

describe('endpoints', () => {
  it('build the right requests', async () => {
    const client = createFakeClient([
      { method: 'GET', path: '/api/health', reply: () => ({ ok: true }) },
      { method: 'POST', path: '/api/login', reply: ({ body }) => ({ token: 't', actor: { userId: 'u', username: body.username, isAdmin: false } }) },
      { method: 'POST', path: '/api/logout', reply: () => undefined },
      { method: 'GET', path: '/api/me', reply: () => ({ actor: {}, rights: {}, companies: [] }) },
      { method: 'GET', path: '/api/companies/c1/years', reply: () => [] },
      { method: 'GET', path: '/api/companies/c1/groups', reply: () => [] },
      { method: 'GET', path: '/api/companies/c1/ledgers', reply: () => [] },
      { method: 'GET', path: '/api/companies/c1/books', reply: () => [] },
      { method: 'GET', path: '/api/companies/c1/ledgers/l1/pending-bills', reply: () => [] },
      { method: 'POST', path: '/api/vouchers', reply: () => ({ voucherId: 'v', voucherNo: 1 }) },
      { method: 'GET', path: '/api/vouchers/v', reply: () => ({ id: 'v' }) },
      { method: 'PUT', path: '/api/vouchers/v', reply: () => ({ version: 2 }) },
      { method: 'DELETE', path: '/api/vouchers/v', reply: () => undefined },
      { method: 'GET', path: '/api/companies/c1/vouchers', reply: () => [] },
    ]);
    await api.health(client);
    expect((await api.login(client, 'asha', 'pw')).actor.username).toBe('asha');
    await api.logout(client);
    await api.me(client);
    await api.listYears(client, 'c1');
    await api.listGroups(client, 'c1');
    await api.listLedgers(client, 'c1');
    await api.listBooks(client, 'c1');
    await api.pendingBills(client, 'c1', 'l1');
    await api.saveVoucher(client, { companyId: 'c1' } as never);
    await api.getVoucher(client, 'v');
    await api.updateVoucher(client, 'v', { version: 1 } as never);
    await api.deleteVoucher(client, 'v', 3);
    await api.listVouchers(client, 'c1', { yearId: 'y1', from: '2026-05-01', limit: 20 });
    const paths = client.calls.map((c) => c.path);
    expect(paths).toContain('/api/vouchers/v?version=3');
    expect(paths).toContain('/api/companies/c1/vouchers?yearId=y1&from=2026-05-01&limit=20');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/app/src/renderer/api`
Expected: FAIL — cannot find modules `./client`, `./endpoints`, `../testing/fakeClient`.

- [ ] **Step 3: Write the implementation**

`packages/app/src/renderer/api/client.ts`:
```ts
import type { SasBridge } from '../../shared/bridge';

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClient {
  /** Resolves to the parsed JSON, or undefined for an empty (204) answer. Throws ApiError otherwise. */
  request<T = unknown>(method: Method, path: string, body?: unknown): Promise<T>;
  setToken(token: string | null): void;
  /** Called when the server says the session is gone (401 NOT_AUTHENTICATED). */
  onUnauthorized: (() => void) | null;
}

export function createBridgeClient(bridge: Pick<SasBridge, 'request'>): ApiClient {
  let token: string | null = null;
  const client: ApiClient = {
    onUnauthorized: null,
    setToken(t) {
      token = t;
    },
    async request<T>(method: Method, path: string, body?: unknown): Promise<T> {
      const res = await bridge.request({ method, path, body, token });
      if (res.status >= 200 && res.status < 300) return (res.status === 204 || res.json === null ? undefined : res.json) as T;
      const err = (res.json ?? {}) as { code?: string; message?: string };
      const apiError = new ApiError(res.status, err.code ?? 'ERROR', err.message ?? `The server answered ${res.status}`);
      if (res.status === 401 && apiError.code === 'NOT_AUTHENTICATED') client.onUnauthorized?.();
      throw apiError;
    },
  };
  return client;
}
```

`packages/app/src/renderer/api/types.ts`:
```ts
import type { AdjustmentKind, Actor, ModuleName, Rights, Side, VoucherKind } from '@sas/shared';

export interface CompanyLite {
  id: string;
  code: string;
  name: string;
}

export interface YearLite {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface GroupLite {
  id: string;
  code: number;
  name: string;
  nature: string;
  parentId: string | null;
}

export interface LedgerLite {
  id: string;
  name: string;
  groupId: string;
  groupCode: number;
  groupName: string;
  city: string | null;
  gstin: string | null;
  status: string;
}

export interface BookLite {
  id: string;
  code: string;
  name: string;
  type: string;
  defaultLedgerId: string | null;
}

export interface PendingBill {
  id: string;
  billNo: string;
  billDate: string;
  dueDate: string | null;
  side: Side;
  original: string;
  pending: string;
}

export interface BillAdjustment {
  billId: string;
  amount: string;
  kind: AdjustmentKind;
}

export interface VoucherLineBody {
  ledgerId: string;
  side: Side;
  amount: string;
  narration?: string;
  adjustments?: BillAdjustment[];
}

export interface SaveVoucherBody {
  companyId: string;
  yearId: string;
  bookId: string;
  kind: VoucherKind;
  date: string;
  narration?: string;
  lines: VoucherLineBody[];
}

export interface UpdateVoucherBody {
  version: number;
  date: string;
  narration?: string;
  lines: VoucherLineBody[];
}

export interface VoucherView {
  id: string;
  companyId: string;
  yearId: string;
  bookId: string;
  kind: VoucherKind;
  voucherNo: number;
  date: string;
  narration: string | null;
  version: number;
  lines: {
    lineNo: number;
    ledgerId: string;
    ledgerName: string;
    side: Side;
    amount: string;
    narration: string | null;
    adjustments: BillAdjustment[];
  }[];
}

export interface VoucherSummary {
  id: string;
  voucherNo: number;
  date: string;
  kind: VoucherKind;
  bookCode: string;
  narration: string | null;
  total: string;
}

export interface MeResponse {
  actor: Actor;
  rights: Record<ModuleName, Rights>;
  companies: CompanyLite[];
}
```

`packages/app/src/renderer/api/endpoints.ts`:
```ts
import type { Actor } from '@sas/shared';
import type { ApiClient } from './client';
import type {
  BookLite,
  GroupLite,
  LedgerLite,
  MeResponse,
  PendingBill,
  SaveVoucherBody,
  UpdateVoucherBody,
  VoucherSummary,
  VoucherView,
  YearLite,
} from './types';

export const health = (api: ApiClient) => api.request<{ ok: boolean }>('GET', '/api/health');

export const login = (api: ApiClient, username: string, password: string) =>
  api.request<{ token: string; actor: Actor }>('POST', '/api/login', { username, password });

export const logout = (api: ApiClient) => api.request<void>('POST', '/api/logout');

export const me = (api: ApiClient) => api.request<MeResponse>('GET', '/api/me');

export const listYears = (api: ApiClient, companyId: string) =>
  api.request<YearLite[]>('GET', `/api/companies/${companyId}/years`);

export const listGroups = (api: ApiClient, companyId: string) =>
  api.request<GroupLite[]>('GET', `/api/companies/${companyId}/groups`);

export const listLedgers = (api: ApiClient, companyId: string) =>
  api.request<LedgerLite[]>('GET', `/api/companies/${companyId}/ledgers`);

export const listBooks = (api: ApiClient, companyId: string) =>
  api.request<BookLite[]>('GET', `/api/companies/${companyId}/books`);

export const pendingBills = (api: ApiClient, companyId: string, ledgerId: string) =>
  api.request<PendingBill[]>('GET', `/api/companies/${companyId}/ledgers/${ledgerId}/pending-bills`);

export const saveVoucher = (api: ApiClient, body: SaveVoucherBody) =>
  api.request<{ voucherId: string; voucherNo: number }>('POST', '/api/vouchers', body);

export const getVoucher = (api: ApiClient, id: string) => api.request<VoucherView>('GET', `/api/vouchers/${id}`);

export const updateVoucher = (api: ApiClient, id: string, body: UpdateVoucherBody) =>
  api.request<{ version: number }>('PUT', `/api/vouchers/${id}`, body);

export const deleteVoucher = (api: ApiClient, id: string, version: number) =>
  api.request<void>('DELETE', `/api/vouchers/${id}?version=${version}`);

export interface VoucherListQuery {
  yearId: string;
  bookId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

/** Builds "?a=1&b=2" from the defined values, in a stable order. */
export function queryString(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export const listVouchers = (api: ApiClient, companyId: string, q: VoucherListQuery) =>
  api.request<VoucherSummary[]>(
    'GET',
    `/api/companies/${companyId}/vouchers${queryString({ yearId: q.yearId, bookId: q.bookId, from: q.from, to: q.to, limit: q.limit, offset: q.offset })}`,
  );
```

`packages/app/src/renderer/testing/fakeClient.ts`:
```ts
import { ApiError, type ApiClient, type Method } from '../api/client';

export interface FakeRoute {
  method: Method;
  path: string | RegExp;
  reply: (req: { path: string; query: URLSearchParams; body: any }) => unknown;
}

export interface FakeClient extends ApiClient {
  calls: { method: Method; path: string; body?: unknown }[];
}

/** An in-memory API for component tests. Unmatched requests fail loudly with 404 NO_ROUTE. */
export function createFakeClient(routes: FakeRoute[]): FakeClient {
  const calls: FakeClient['calls'] = [];
  return {
    calls,
    onUnauthorized: null,
    setToken() {},
    async request<T>(method: Method, path: string, body?: unknown): Promise<T> {
      calls.push({ method, path, body });
      const [pathname, search = ''] = path.split('?');
      const route = routes.find(
        (r) => r.method === method && (typeof r.path === 'string' ? r.path === pathname : r.path.test(pathname!)),
      );
      if (!route) throw new ApiError(404, 'NO_ROUTE', `No fake route for ${method} ${path}`);
      return (await route.reply({ path: pathname!, query: new URLSearchParams(search), body })) as T;
    },
  };
}
```

- [ ] **Step 4: Run the tests and the type-check**

Run: `npx vitest run packages/app && npm run typecheck`
Expected: PASS and no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/app
git commit -m "feat(app): API client with bridge transport, typed endpoints and a fake client for tests" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 5: Session, shell, connection and login screens, screen palette

**Files:**
- Create: `packages/app/src/renderer/session/deps.tsx`, `session/Session.tsx`
- Create: `packages/app/src/renderer/shell/nav.tsx`, `visibility.ts`, `Shell.tsx`, `Palette.tsx`, `SwitchDialog.tsx`, `Home.tsx`, `screenComponents.tsx`
- Create: `packages/app/src/renderer/screens/ConnectScreen.tsx`, `LoginScreen.tsx`
- Create: `packages/app/src/renderer/ui/Dialog.tsx`, `ui/Field.tsx`, `ui/NavRoot.tsx`
- Create: `packages/app/src/renderer/testing/sampleData.ts`, `testing/fakeBridge.ts`, `testing/render.tsx`
- Modify: `packages/app/src/renderer/App.tsx`, `packages/app/src/renderer/main.tsx`, `packages/app/src/renderer/App.test.tsx`
- Test: `shell/visibility.test.ts`, `shell/Palette.test.tsx`, `App.test.tsx`, `shell/Shell.test.tsx`

**Interfaces:**
- Consumes: `ApiClient`, `ApiError`, `createBridgeClient` (Task 4); endpoints `health`, `login`, `logout`, `me`, `listYears` (Task 4); `SCREENS`, `ALL_GLOBAL`, `OPENERS` (Task 3); `useShortcuts` (Task 2); `Help` (Task 3).
- Produces:
  - `AppDeps = { api: ApiClient; bridge: Pick<SasBridge, 'getConfig' | 'setConfig' | 'saveFile' | 'printToPdf'> }`; `<DepsProvider deps>`; `useDeps()`, `useApi()`, `useBridge()`.
  - `SessionValue = { actor: Actor; rights: Record<ModuleName, Rights>; companies: CompanyLite[]; company: CompanyLite | null; year: YearLite | null; years: YearLite[]; selectCompany(id): Promise<void>; selectYear(id): void; refreshCompanies(): Promise<void>; reloadYears(): Promise<void>; can(module, action): boolean; logout(): void }`; `SessionContext`, `useSession()`, `<SessionProvider me onLogout>`.
  - `ScreenRef = { id: ScreenId; props?: Record<string, unknown> }`; `NavValue = { current: ScreenRef; open(id, props?): void; back(): void }`; `NavContext`, `useNav()`.
  - `canSee(screen: ScreenDef, s: { actor: Actor; rights: Record<ModuleName, Rights> }): boolean`.
  - `NavRoot` (Enter moves to the next `[data-nav]` element; on the last one calls `onLast`), `navElements(root)`, `focusNextNav(from)`.
  - `SCREEN_COMPONENTS: Record<ScreenId, ComponentType<any>>` — every screen not built yet maps to a placeholder; later tasks replace entries.
  - Test helpers: `ME_ADMIN`, `ME_CLERK`, `COMPANY`, `YEAR_2026`, `YEAR_2025`, `LEDGERS`, `BOOKS`, `rightsFor(partial)`, `baseRoutes({ me?, extra? })`, `createFakeBridge(initial?, hooks?)`, `renderApp(opts)`, `signIn(user, username?, password?)`.

**Behaviour:** the app starts by checking the server (`GET /api/health`). Unreachable: the Connect screen (address field, Enter saves and retries). Reachable: the Login screen. After login the shell opens with a menu of the screens the user may see (admins see all; others see a screen when they have any right on one of its modules; the Audit Log is admin-only). `F1` opens Help, `F2`/`Ctrl+K` the screen palette, `F9` the company/year switch dialog, the opener hotkeys (`F4`…`F8`) open their screens when visible, `Esc` closes an overlay or goes back one screen. A `401 NOT_AUTHENTICATED` from any call returns to the login screen with a notice. The last company and year are remembered in the config.

- [ ] **Step 1: Write the test helpers and the failing tests**

`packages/app/src/renderer/testing/sampleData.ts`:
```ts
import { MODULES, NO_RIGHTS, type Actor, type ModuleName, type Rights } from '@sas/shared';
import { ApiError } from '../api/client';
import type { BookLite, CompanyLite, GroupLite, LedgerLite, MeResponse, YearLite } from '../api/types';
import type { FakeRoute } from './fakeClient';

export const COMPANY: CompanyLite = { id: 'c1', code: 'C1', name: 'Test Textiles' };
export const YEAR_2026: YearLite = { id: 'y1', label: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31', status: 'open' };
export const YEAR_2025: YearLite = { id: 'y0', label: '2025-26', startDate: '2025-04-01', endDate: '2026-03-31', status: 'closed' };

export const ADMIN = { userId: 'u-admin', username: 'boss', isAdmin: true } satisfies Actor;
export const CLERK = { userId: 'u-clerk', username: 'clerk', isAdmin: false } satisfies Actor;

export function rightsFor(partial: Partial<Record<ModuleName, Partial<Rights>>> = {}): Record<ModuleName, Rights> {
  return Object.fromEntries(MODULES.map((m) => [m, { ...NO_RIGHTS, ...(partial[m] ?? {}) }])) as Record<ModuleName, Rights>;
}

export const ME_ADMIN: MeResponse = { actor: ADMIN, rights: rightsFor(), companies: [COMPANY] };
export const ME_CLERK: MeResponse = {
  actor: CLERK,
  rights: rightsFor({ cash_book: { add: true, find: true, show: true } }),
  companies: [COMPANY],
};

const ledger = (id: string, name: string, groupCode: number, groupName: string, city: string | null = null): LedgerLite => ({
  id,
  name,
  groupId: `g${groupCode}`,
  groupCode,
  groupName,
  city,
  gstin: null,
  status: 'active',
});

export const LEDGERS: LedgerLite[] = [
  ledger('l-cash', 'Cash', 16, 'Cash-in-Hand'),
  ledger('l-ramesh', 'Ramesh Traders', 42, 'Sundry Debtors', 'Surat'),
  ledger('l-suresh', 'Suresh Textiles', 42, 'Sundry Debtors', 'Surat'),
  ledger('l-discount', 'Discount', 32, 'Profit & Loss Expense'),
];

export const GROUPS: GroupLite[] = [
  { id: 'g16', code: 16, name: 'Cash-in-Hand', nature: 'asset', parentId: null },
  { id: 'g32', code: 32, name: 'Profit & Loss Expense', nature: 'expense', parentId: null },
  { id: 'g42', code: 42, name: 'Sundry Debtors', nature: 'asset', parentId: null },
];

export const BOOKS: BookLite[] = [
  { id: 'b-cash', code: 'CB', name: 'Cash Book', type: 'cash', defaultLedgerId: 'l-cash' },
  { id: 'b-jv', code: 'JV', name: 'Journal', type: 'journal', defaultLedgerId: null },
];

/** The routes every screen test needs. `extra` routes win because they are listed first. */
export function baseRoutes(opts: { me?: MeResponse; extra?: FakeRoute[] } = {}): FakeRoute[] {
  const me = opts.me ?? ME_ADMIN;
  return [
    ...(opts.extra ?? []),
    { method: 'GET', path: '/api/health', reply: () => ({ ok: true }) },
    {
      method: 'POST',
      path: '/api/login',
      reply: ({ body }) => {
        if (body.password !== 'secret') throw new ApiError(401, 'BAD_CREDENTIALS', 'Wrong username or password');
        return { token: 'tok', actor: me.actor };
      },
    },
    { method: 'POST', path: '/api/logout', reply: () => undefined },
    { method: 'GET', path: '/api/me', reply: () => me },
    { method: 'GET', path: '/api/companies/c1/years', reply: () => [YEAR_2025, YEAR_2026] },
    { method: 'GET', path: '/api/companies/c1/groups', reply: () => GROUPS },
    { method: 'GET', path: '/api/companies/c1/ledgers', reply: () => LEDGERS },
    { method: 'GET', path: '/api/companies/c1/books', reply: () => BOOKS },
  ];
}
```

`packages/app/src/renderer/testing/fakeBridge.ts`:
```ts
import { DEFAULT_CONFIG, type AppConfig, type SaveFileArgs } from '../../shared/bridge';
import type { AppBridge } from '../session/deps';

export interface FakeBridge extends AppBridge {
  saved: SaveFileArgs[];
  pdfs: string[];
  readonly config: AppConfig;
}

export function createFakeBridge(
  initial: Partial<AppConfig> = {},
  hooks: { onSetConfig?: (patch: Partial<AppConfig>) => void } = {},
): FakeBridge {
  let config: AppConfig = { ...DEFAULT_CONFIG, ...initial };
  const saved: SaveFileArgs[] = [];
  const pdfs: string[] = [];
  return {
    saved,
    pdfs,
    get config() {
      return config;
    },
    getConfig: async () => ({ ...config }),
    setConfig: async (patch) => {
      hooks.onSetConfig?.(patch);
      config = { ...config, ...patch };
      return { ...config };
    },
    saveFile: async (args) => {
      saved.push(args);
      return true;
    },
    printToPdf: async (args) => {
      pdfs.push(args.suggestedName);
      return true;
    },
  };
}
```

`packages/app/src/renderer/testing/render.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { App } from '../App';
import type { MeResponse } from '../api/types';
import { createFakeBridge, type FakeBridge } from './fakeBridge';
import { createFakeClient, type FakeClient, type FakeRoute } from './fakeClient';
import { baseRoutes } from './sampleData';

export function renderApp(opts: { me?: MeResponse; routes?: FakeRoute[]; bridge?: FakeBridge } = {}) {
  const api: FakeClient = createFakeClient(baseRoutes({ me: opts.me, extra: opts.routes }));
  const bridge = opts.bridge ?? createFakeBridge();
  const utils = render(<App deps={{ api, bridge }} />);
  return { api, bridge, ...utils };
}

/** Type the credentials on the login screen and press Enter. */
export async function signIn(user: UserEvent, username = 'boss', password = 'secret') {
  await user.type(await screen.findByLabelText('Username'), username);
  await user.type(screen.getByLabelText('Password'), `${password}{Enter}`);
}
```

`packages/app/src/renderer/shell/visibility.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ADMIN, CLERK, rightsFor } from '../testing/sampleData';
import { SCREEN_BY_ID, SCREENS } from './screens';
import { canSee } from './visibility';

describe('canSee', () => {
  it('shows every screen to an admin', () => {
    const s = { actor: ADMIN, rights: rightsFor() };
    expect(SCREENS.every((screen) => canSee(screen, s))).toBe(true);
  });

  it('always shows Home and Help', () => {
    const s = { actor: CLERK, rights: rightsFor() };
    expect(canSee(SCREEN_BY_ID.home, s)).toBe(true);
    expect(canSee(SCREEN_BY_ID.help, s)).toBe(true);
  });

  it('shows a screen when the user has any right on one of its modules', () => {
    const s = { actor: CLERK, rights: rightsFor({ cash_book: { add: true } }) };
    expect(canSee(SCREEN_BY_ID.receipt, s)).toBe(true);
    expect(canSee(SCREEN_BY_ID.vouchers, s)).toBe(true); // cash_book or journal
    expect(canSee(SCREEN_BY_ID.journal, s)).toBe(false);
    expect(canSee(SCREEN_BY_ID.rTrial, s)).toBe(false);
  });

  it('hides screens from a user with no rights at all', () => {
    const s = { actor: CLERK, rights: rightsFor() };
    expect(SCREENS.filter((screen) => canSee(screen, s)).map((screen) => screen.id)).toEqual(['home', 'help']);
  });

  it('keeps the audit log for administrators only', () => {
    const s = { actor: CLERK, rights: rightsFor({ users: { add: true, edit: true, delete: true, print: true, find: true, show: true } }) };
    expect(canSee(SCREEN_BY_ID.audit, s)).toBe(false);
    expect(canSee(SCREEN_BY_ID.users, s)).toBe(true);
  });
});
```

`packages/app/src/renderer/shell/Palette.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SCREEN_BY_ID } from './screens';
import { Palette } from './Palette';

const screens = [SCREEN_BY_ID.home, SCREEN_BY_ID.receipt, SCREEN_BY_ID.rTrial, SCREEN_BY_ID.rPL, SCREEN_BY_ID.ledgers];

describe('Palette', () => {
  it('lists the screens, focuses the search box and filters as you type', async () => {
    const user = userEvent.setup();
    render(<Palette screens={screens} onPick={() => {}} onClose={() => {}} />);
    const input = screen.getByRole('combobox', { name: 'Go to screen' });
    expect(input).toHaveFocus();
    expect(screen.getAllByRole('option')).toHaveLength(5);
    await user.type(input, 'bal');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([expect.stringContaining('Trial Balance')]);
  });

  it('Enter opens the highlighted screen; the arrow keys move the highlight', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Palette screens={screens} onPick={onPick} onClose={() => {}} />);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onPick).toHaveBeenCalledWith('receipt');
  });

  it('puts titles that start with the text before titles that only contain it', async () => {
    const user = userEvent.setup();
    render(<Palette screens={screens} onPick={() => {}} onClose={() => {}} />);
    await user.type(screen.getByRole('combobox', { name: 'Go to screen' }), 'a');
    const titles = screen.getAllByRole('option').map((o) => o.textContent ?? '');
    expect(titles[0]).toMatch(/^Account Master/);
  });

  it('Esc closes it', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Palette screens={screens} onPick={() => {}} onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows hotkeys next to the titles', () => {
    render(<Palette screens={screens} onPick={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('option', { name: /Cash \/ Bank Receipt/ })).toHaveTextContent('F4');
  });
});
```

`packages/app/src/renderer/App.test.tsx` (replace the Task 1 test):
```tsx
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from './api/client';
import { createFakeBridge } from './testing/fakeBridge';
import { renderApp, signIn } from './testing/render';
import { ME_CLERK } from './testing/sampleData';

describe('App start-up and login', () => {
  it('shows the login screen when the server answers', async () => {
    renderApp();
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'SAS' })).toBeInTheDocument();
  });

  it('asks for both fields before calling the server', async () => {
    const user = userEvent.setup();
    const { api } = renderApp();
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/enter your username and password/i);
    expect(api.calls.some((c) => c.path === '/api/login')).toBe(false);
  });

  it('shows the server\'s message for a wrong password and stays on the login screen', async () => {
    const user = userEvent.setup();
    renderApp();
    await signIn(user, 'boss', 'wrong');
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or password');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('signs in with the keyboard and shows the company and year', async () => {
    const user = userEvent.setup();
    const { bridge } = renderApp();
    await signIn(user);
    expect(await screen.findByText('Test Textiles')).toBeInTheDocument();
    expect(screen.getByText('2026-27')).toBeInTheDocument(); // the open year is chosen
    await waitFor(() => expect(bridge.config.lastCompanyId).toBe('c1'));
    expect(bridge.config.lastYearId).toBe('y1');
  });

  it('opens the year it remembered', async () => {
    const user = userEvent.setup();
    renderApp({ bridge: createFakeBridge({ lastCompanyId: 'c1', lastYearId: 'y0' }) });
    await signIn(user);
    expect(await screen.findByText('2025-26')).toBeInTheDocument();
  });

  it('offers to fix the server address when the server cannot be reached', async () => {
    const user = userEvent.setup();
    let up = false;
    const bridge = createFakeBridge({}, { onSetConfig: () => (up = true) });
    renderApp({
      bridge,
      routes: [
        {
          method: 'GET',
          path: '/api/health',
          reply: () => {
            if (!up) throw new ApiError(0, 'NETWORK', 'Cannot reach the server.');
            return { ok: true };
          },
        },
      ],
    });
    expect(await screen.findByText('Cannot reach the server.')).toBeInTheDocument();
    const address = screen.getByLabelText('Server address');
    await user.clear(address);
    await user.type(address, 'http://192.168.1.10:4100{Enter}');
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(bridge.config.serverUrl).toBe('http://192.168.1.10:4100');
  });

  it('returns to the login screen with a notice when the session ends', async () => {
    const user = userEvent.setup();
    const { api } = renderApp();
    await signIn(user);
    await screen.findByText('Test Textiles');
    act(() => api.onUnauthorized?.());
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText(/session has ended/i)).toBeInTheDocument();
  });

  it('signs out from the top bar', async () => {
    const user = userEvent.setup();
    const { api } = renderApp({ me: ME_CLERK });
    await signIn(user, 'clerk');
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(api.calls.some((c) => c.path === '/api/logout')).toBe(true);
  });
});
```

`packages/app/src/renderer/shell/Shell.test.tsx`:
```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp, signIn } from '../testing/render';
import { ME_CLERK, rightsFor, ADMIN } from '../testing/sampleData';

async function openShell(opts: Parameters<typeof renderApp>[0] = {}) {
  const user = userEvent.setup();
  const utils = renderApp(opts);
  await signIn(user, opts.me?.actor.username ?? 'boss');
  await screen.findByRole('navigation', { name: 'Screens' });
  return { user, ...utils };
}
const menu = () => within(screen.getByRole('navigation', { name: 'Screens' }));

describe('Shell menu', () => {
  it('shows an admin every screen, including the audit log', async () => {
    await openShell();
    expect(menu().getByRole('button', { name: /Trial Balance/ })).toBeInTheDocument();
    expect(menu().getByRole('button', { name: /Audit Log/ })).toBeInTheDocument();
    expect(menu().getByRole('button', { name: /Cash \/ Bank Receipt/ })).toHaveTextContent('F4');
  });

  it('shows a clerk only what their rights allow', async () => {
    await openShell({ me: ME_CLERK });
    expect(menu().getByRole('button', { name: /Cash \/ Bank Receipt/ })).toBeInTheDocument();
    expect(menu().queryByRole('button', { name: /Trial Balance/ })).toBeNull();
    expect(menu().queryByRole('button', { name: /Users & Rights/ })).toBeNull();
    expect(menu().queryByRole('button', { name: /Audit Log/ })).toBeNull();
  });

  it('marks the current screen', async () => {
    await openShell();
    expect(menu().getByRole('button', { name: /Home/ })).toHaveAttribute('aria-current', 'page');
  });
});

describe('Shell keyboard', () => {
  it('F1 opens Help and Esc goes back', async () => {
    const { user } = await openShell();
    await user.keyboard('{F1}');
    expect(await screen.findByRole('heading', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('heading', { name: /Welcome/ })).toBeInTheDocument();
  });

  it('F2 opens the screen palette; typing and Enter opens a screen; Esc closes the palette only', async () => {
    const { user } = await openShell();
    await user.keyboard('{F2}');
    const input = await screen.findByRole('combobox', { name: 'Go to screen' });
    await user.type(input, 'trial{Enter}');
    expect(await screen.findByRole('heading', { name: 'Trial Balance' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Go to screen' })).toBeNull();

    await user.keyboard('{F2}');
    await screen.findByRole('combobox', { name: 'Go to screen' });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('combobox', { name: 'Go to screen' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Trial Balance' })).toBeInTheDocument(); // still here
  });

  it('Ctrl+K opens the palette too', async () => {
    const { user } = await openShell();
    await user.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('combobox', { name: 'Go to screen' })).toBeInTheDocument();
  });

  it('opener hotkeys open their screen when the user may see it', async () => {
    const { user } = await openShell({ me: ME_CLERK });
    await user.keyboard('{F4}');
    expect(await screen.findByRole('heading', { name: 'Cash / Bank Receipt' })).toBeInTheDocument();
    await user.keyboard('{F6}'); // the journal is not allowed for this clerk
    expect(screen.getByRole('heading', { name: 'Cash / Bank Receipt' })).toBeInTheDocument();
  });

  it('Esc steps back through the screens one at a time and stops at Home', async () => {
    const { user } = await openShell();
    await user.keyboard('{F4}');
    await user.keyboard('{F5}');
    await screen.findByRole('heading', { name: 'Cash / Bank Payment' });
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('heading', { name: 'Cash / Bank Receipt' })).toBeInTheDocument();
    await user.keyboard('{Escape}{Escape}{Escape}');
    expect(await screen.findByRole('heading', { name: /Welcome/ })).toBeInTheDocument();
  });

  it('F9 switches the financial year', async () => {
    const { user } = await openShell();
    await user.keyboard('{F9}');
    const year = await screen.findByLabelText('Financial year');
    await user.selectOptions(year, 'y0');
    await user.keyboard('{Escape}');
    expect(await screen.findByText('2025-26')).toBeInTheDocument();
  });
});

describe('Home', () => {
  it('invites an administrator to create the first company', async () => {
    const user = userEvent.setup();
    renderApp({ me: { actor: ADMIN, rights: rightsFor(), companies: [] } });
    await signIn(user);
    expect(await screen.findByText(/no company yet/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create a company' }));
    expect(await screen.findByRole('heading', { name: 'Company & Years' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/app/src/renderer/shell packages/app/src/renderer/App.test.tsx`
Expected: FAIL — cannot find modules `./visibility`, `./Palette`, `../testing/render`, and `App` does not take `deps`.

- [ ] **Step 3: Write the implementation**

`packages/app/src/renderer/session/deps.tsx`:
```tsx
import { createContext, useContext, type ReactNode } from 'react';
import type { SasBridge } from '../../shared/bridge';
import type { ApiClient } from '../api/client';

export type AppBridge = Pick<SasBridge, 'getConfig' | 'setConfig' | 'saveFile' | 'printToPdf'>;

export interface AppDeps {
  api: ApiClient;
  bridge: AppBridge;
}

const DepsContext = createContext<AppDeps | null>(null);

export function DepsProvider({ deps, children }: { deps: AppDeps; children: ReactNode }) {
  return <DepsContext.Provider value={deps}>{children}</DepsContext.Provider>;
}

export function useDeps(): AppDeps {
  const deps = useContext(DepsContext);
  if (!deps) throw new Error('DepsProvider is missing');
  return deps;
}

export const useApi = () => useDeps().api;
export const useBridge = () => useDeps().bridge;
```

`packages/app/src/renderer/session/Session.tsx`:
```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Actor, ModuleName, RightAction, Rights } from '@sas/shared';
import { listYears, me as fetchMe } from '../api/endpoints';
import type { CompanyLite, MeResponse, YearLite } from '../api/types';
import { useDeps } from './deps';

export interface SessionValue {
  actor: Actor;
  rights: Record<ModuleName, Rights>;
  companies: CompanyLite[];
  company: CompanyLite | null;
  year: YearLite | null;
  years: YearLite[];
  selectCompany(id: string): Promise<void>;
  selectYear(id: string): void;
  refreshCompanies(): Promise<void>;
  reloadYears(): Promise<void>;
  can(module: ModuleName, action: RightAction): boolean;
  logout(): void;
}

export const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const s = useContext(SessionContext);
  if (!s) throw new Error('SessionProvider is missing');
  return s;
}

/** The remembered year if it still exists, otherwise the newest open year, otherwise the newest year. */
export function pickYear(years: YearLite[], preferredId?: string): YearLite | null {
  if (years.length === 0) return null;
  const preferred = years.find((y) => y.id === preferredId);
  if (preferred) return preferred;
  const byStart = [...years].sort((a, b) => a.startDate.localeCompare(b.startDate));
  return [...byStart].reverse().find((y) => y.status === 'open') ?? byStart[byStart.length - 1]!;
}

export function SessionProvider({ me, onLogout, children }: { me: MeResponse; onLogout: () => void; children: ReactNode }) {
  const { api, bridge } = useDeps();
  const [companies, setCompanies] = useState<CompanyLite[]>(me.companies);
  const [company, setCompany] = useState<CompanyLite | null>(null);
  const [years, setYears] = useState<YearLite[]>([]);
  const [year, setYear] = useState<YearLite | null>(null);
  const [ready, setReady] = useState(false);

  const loadCompany = useCallback(
    async (c: CompanyLite | null, preferredYearId?: string) => {
      setCompany(c);
      if (!c) {
        setYears([]);
        setYear(null);
        return;
      }
      const ys = await listYears(api, c.id);
      const y = pickYear(ys, preferredYearId);
      setYears(ys);
      setYear(y);
      await bridge.setConfig({ lastCompanyId: c.id, ...(y ? { lastYearId: y.id } : {}) });
    },
    [api, bridge],
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      const cfg = await bridge.getConfig();
      const c = me.companies.find((x) => x.id === cfg.lastCompanyId) ?? me.companies[0] ?? null;
      await loadCompany(c, cfg.lastYearId);
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
    // Only on first mount: later changes go through selectCompany / selectYear.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      actor: me.actor,
      rights: me.rights,
      companies,
      company,
      year,
      years,
      async selectCompany(id) {
        const c = companies.find((x) => x.id === id);
        if (c) await loadCompany(c);
      },
      selectYear(id) {
        const y = years.find((x) => x.id === id);
        if (!y) return;
        setYear(y);
        void bridge.setConfig({ lastYearId: y.id });
      },
      async refreshCompanies() {
        const fresh = await fetchMe(api);
        setCompanies(fresh.companies);
        if (!company && fresh.companies[0]) await loadCompany(fresh.companies[0]);
      },
      async reloadYears() {
        if (company) await loadCompany(company, year?.id);
      },
      can: (module, action) => me.actor.isAdmin || me.rights[module]?.[action] === true,
      logout: onLogout,
    }),
    [me, companies, company, year, years, api, bridge, loadCompany, onLogout],
  );

  if (!ready) return <p style={{ padding: 16 }}>Loading…</p>;
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
```

`packages/app/src/renderer/shell/nav.tsx`:
```tsx
import { createContext, useContext } from 'react';
import type { ScreenId } from './screens';

export interface ScreenRef {
  id: ScreenId;
  props?: Record<string, unknown>;
}

export interface NavValue {
  current: ScreenRef;
  /** Open a screen on top of the current one. Opening the screen that is already on top replaces its props. */
  open(id: ScreenId, props?: Record<string, unknown>): void;
  back(): void;
}

export const NavContext = createContext<NavValue | null>(null);

export function useNav(): NavValue {
  const n = useContext(NavContext);
  if (!n) throw new Error('NavContext is missing');
  return n;
}
```

`packages/app/src/renderer/shell/visibility.ts`:
```ts
import type { Actor, ModuleName, Rights } from '@sas/shared';
import type { ScreenDef } from './screens';

/** Menu visibility. The server still checks every request; this only keeps the menu tidy. */
export function canSee(screen: ScreenDef, s: { actor: Actor; rights: Record<ModuleName, Rights> }): boolean {
  if (screen.adminOnly) return s.actor.isAdmin;
  if (s.actor.isAdmin || screen.modules.length === 0) return true;
  return screen.modules.some((m) => {
    const r = s.rights[m];
    return !!r && (r.show || r.add || r.edit || r.delete || r.print || r.find);
  });
}
```

`packages/app/src/renderer/ui/NavRoot.tsx`:
```tsx
import type { KeyboardEvent, ReactNode } from 'react';

export function navElements(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-nav]')).filter(
    (el) => !(el as HTMLInputElement).disabled && el.getAttribute('aria-hidden') !== 'true',
  );
}

/** Move focus to the next [data-nav] element after `from`. Returns false when `from` was the last one. */
export function focusNextNav(from: HTMLElement): boolean {
  const root = from.closest('[data-nav-root]') ?? document;
  const nav = navElements(root);
  const i = nav.indexOf(from);
  const next = nav[i + 1];
  if (i < 0 || !next) return false;
  next.focus();
  return true;
}

/** Makes Enter act like Tab inside a form. On the very last field it calls `onLast` instead. */
export function NavRoot({ onLast, children, className }: { onLast?: () => void; children: ReactNode; className?: string }) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Enter' || e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    if (!target.hasAttribute('data-nav') || target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    if (!focusNextNav(target)) onLast?.();
  }
  return (
    <div data-nav-root className={className} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}
```

`packages/app/src/renderer/ui/Field.tsx`:
```tsx
import type { ReactNode } from 'react';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
```

`packages/app/src/renderer/ui/Dialog.tsx`:
```tsx
import { useEffect, useRef, type ReactNode } from 'react';

/** A modal box. Esc closes it and stops there, so the screen behind it does not also go back. */
export function Dialog({ title, onClose, children, width }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[data-autofocus], input, select, textarea, button')?.focus();
  }, []);
  return (
    <div className="overlay">
      <div
        ref={ref}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={width ? { width } : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
```

`packages/app/src/renderer/shell/Palette.tsx`:
```tsx
import { useMemo, useState } from 'react';
import { Dialog } from '../ui/Dialog';
import type { ScreenDef, ScreenId } from './screens';

export function filterScreens(screens: ScreenDef[], query: string): ScreenDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return screens;
  const starts: ScreenDef[] = [];
  const contains: ScreenDef[] = [];
  for (const s of screens) {
    const t = s.title.toLowerCase();
    if (t.startsWith(q)) starts.push(s);
    else if (t.includes(q) || s.group.toLowerCase().includes(q)) contains.push(s);
  }
  return [...starts, ...contains];
}

/** F2 / Ctrl+K: jump to any screen you are allowed to see by typing part of its name. */
export function Palette({ screens, onPick, onClose }: { screens: ScreenDef[]; onPick: (id: ScreenId) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [hi, setHi] = useState(0);
  const items = useMemo(() => filterScreens(screens, query), [screens, query]);
  const active = Math.min(hi, Math.max(items.length - 1, 0));

  return (
    <Dialog title="Go to screen" onClose={onClose} width={480}>
      <input
        role="combobox"
        aria-label="Go to screen"
        aria-expanded="true"
        aria-controls="palette-list"
        autoComplete="off"
        style={{ width: '100%' }}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setHi(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHi(Math.min(active + 1, items.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHi(Math.max(active - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const chosen = items[active];
            if (chosen) onPick(chosen.id);
          }
        }}
      />
      <ul id="palette-list" role="listbox" style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', maxHeight: 320, overflow: 'auto' }}>
        {items.map((s, i) => (
          <li
            key={s.id}
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(s.id);
            }}
            style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: i === active ? '#e5eefb' : undefined, cursor: 'pointer' }}
          >
            <span>{s.title}</span>
            {s.hotkey && <kbd>{s.hotkey}</kbd>}
          </li>
        ))}
        {items.length === 0 && <li className="muted" style={{ padding: '4px 8px' }}>No screen matches.</li>}
      </ul>
    </Dialog>
  );
}
```

`packages/app/src/renderer/shell/SwitchDialog.tsx`:
```tsx
import { Dialog } from '../ui/Dialog';
import { Field } from '../ui/Field';
import { useSession } from '../session/Session';

export function SwitchDialog({ onClose }: { onClose: () => void }) {
  const s = useSession();
  const enterCloses = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onClose();
    }
  };
  return (
    <Dialog title="Switch company or year" onClose={onClose}>
      <div className="form-row">
        <Field label="Company">
          <select aria-label="Company" value={s.company?.id ?? ''} onChange={(e) => void s.selectCompany(e.target.value)} onKeyDown={enterCloses}>
            {s.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Financial year">
          <select aria-label="Financial year" value={s.year?.id ?? ''} onChange={(e) => s.selectYear(e.target.value)} onKeyDown={enterCloses}>
            {s.years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
                {y.status !== 'open' ? ` (${y.status})` : ''}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <button className="primary" onClick={onClose}>
        Done
      </button>
    </Dialog>
  );
}
```

`packages/app/src/renderer/shell/Home.tsx`:
```tsx
import { formatKeys } from '../keys/keys';
import { useSession } from '../session/Session';
import { useNav } from './nav';
import { OPENERS, SCREEN_BY_ID, type ScreenId } from './screens';
import { canSee } from './visibility';

export function Home() {
  const session = useSession();
  const nav = useNav();
  const quick = OPENERS.filter((o) => canSee(SCREEN_BY_ID[o.id.slice(5) as ScreenId], session));

  return (
    <div>
      <h2>Welcome, {session.actor.username}</h2>
      {!session.company ? (
        <div className="panel">
          <p>There is no company yet.</p>
          {session.can('company', 'add') ? (
            <button className="primary" onClick={() => nav.open('company')}>
              Create a company
            </button>
          ) : (
            <p className="muted">Ask an administrator to create a company for you.</p>
          )}
        </div>
      ) : (
        <div className="panel">
          <p>
            Working in <strong>{session.company.name}</strong>, year <strong>{session.year?.label ?? '—'}</strong>.
          </p>
          <ul>
            {quick.map((o) => (
              <li key={o.id}>
                <kbd>{formatKeys(o.keys)}</kbd> {o.description}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="muted">
        Press <kbd>F1</kbd> to see every keyboard shortcut, <kbd>F2</kbd> to go to any screen, <kbd>F9</kbd> to switch company or year.
      </p>
    </div>
  );
}
```

`packages/app/src/renderer/shell/screenComponents.tsx`:
```tsx
import type { ComponentType } from 'react';
import { Help } from '../screens/Help';
import { Home } from './Home';
import { SCREENS, type ScreenId } from './screens';

function placeholder(title: string): ComponentType {
  return function Placeholder() {
    return (
      <div className="panel">
        <h2>{title}</h2>
        <p className="muted">This screen is built in a later task.</p>
      </div>
    );
  };
}

const placeholders = Object.fromEntries(SCREENS.map((s) => [s.id, placeholder(s.title)])) as Record<ScreenId, ComponentType<any>>;

/** Every screen id maps to a component. Later tasks replace the placeholders. */
export const SCREEN_COMPONENTS: Record<ScreenId, ComponentType<any>> = {
  ...placeholders,
  home: Home,
  help: Help,
};
```

`packages/app/src/renderer/shell/Shell.tsx`:
```tsx
import { useCallback, useMemo, useState } from 'react';
import { formatKeys } from '../keys/keys';
import { useShortcuts } from '../keys/useShortcuts';
import { useSession } from '../session/Session';
import { NavContext, type NavValue, type ScreenRef } from './nav';
import { Palette } from './Palette';
import { SCREEN_COMPONENTS } from './screenComponents';
import { ALL_GLOBAL, SCREENS, type ScreenGroup, type ScreenId } from './screens';
import { SwitchDialog } from './SwitchDialog';
import { canSee } from './visibility';

const GROUP_ORDER: ScreenGroup[] = ['General', 'Transactions', 'Masters', 'Reports', 'Admin'];

export function Shell() {
  const session = useSession();
  const [stack, setStack] = useState<ScreenRef[]>([{ id: 'home' }]);
  const [overlay, setOverlay] = useState<null | 'palette' | 'switch'>(null);
  const current = stack[stack.length - 1]!;

  const open = useCallback((id: ScreenId, props?: Record<string, unknown>) => {
    setStack((s) => {
      const top = s[s.length - 1]!;
      return top.id === id ? [...s.slice(0, -1), { id, props }] : [...s, { id, props }];
    });
    setOverlay(null);
  }, []);
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);

  const visible = useMemo(() => SCREENS.filter((s) => canSee(s, session)), [session]);
  const nav = useMemo<NavValue>(() => ({ current, open, back }), [current, open, back]);

  const openerHandlers = Object.fromEntries(
    visible
      .filter((s) => s.hotkey)
      .map((s) => [`open:${s.id}`, () => open(s.id)] as const),
  );
  useShortcuts(ALL_GLOBAL, {
    help: () => open('help'),
    openScreen: () => setOverlay('palette'),
    openScreenAlt: () => setOverlay('palette'),
    switchCompany: () => setOverlay('switch'),
    close: () => (overlay ? setOverlay(null) : back()),
    ...openerHandlers,
  });

  const Screen = SCREEN_COMPONENTS[current.id];

  return (
    <NavContext.Provider value={nav}>
      <div className="app">
        <header className="topbar">
          <strong>SAS</strong>
          <span>{session.company?.name ?? 'No company'}</span>
          <span>{session.year?.label}</span>
          <span className="spacer" />
          <span>{session.actor.username}</span>
          <button onClick={session.logout}>Sign out</button>
        </header>
        <div className="layout">
          <nav className="menu" aria-label="Screens">
            {GROUP_ORDER.map((group) => {
              const items = visible.filter((s) => s.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group}>
                  <h3>{group}</h3>
                  {items.map((s) => (
                    <button key={s.id} aria-current={s.id === current.id ? 'page' : undefined} onClick={() => open(s.id)}>
                      <span>{s.title}</span>
                      {s.hotkey && <kbd>{formatKeys(s.hotkey)}</kbd>}
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>
          <main className="main">
            <Screen {...(current.props ?? {})} />
          </main>
        </div>
        <footer className="statusbar no-print">
          <kbd>F1</kbd> Help · <kbd>F2</kbd> Go to screen · <kbd>F9</kbd> Company / year · <kbd>Esc</kbd> Back
        </footer>
        {overlay === 'palette' && <Palette screens={visible} onPick={open} onClose={() => setOverlay(null)} />}
        {overlay === 'switch' && <SwitchDialog onClose={() => setOverlay(null)} />}
      </div>
    </NavContext.Provider>
  );
}
```

`packages/app/src/renderer/screens/ConnectScreen.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useBridge } from '../session/deps';
import { NavRoot } from '../ui/NavRoot';
import { Field } from '../ui/Field';

/** Shown when the server cannot be reached: lets the user correct its address. */
export function ConnectScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  const bridge = useBridge();
  const [url, setUrl] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    void bridge.getConfig().then((c) => setUrl(c.serverUrl));
  }, [bridge]);

  async function save() {
    setProblem(null);
    try {
      await bridge.setConfig({ serverUrl: url.trim() });
      onRetry();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="overlay">
      <div className="dialog" role="dialog" aria-label="Connect to the server">
        <h1>SAS</h1>
        <p role="status">{error || 'Enter the address of the SAS server.'}</p>
        <NavRoot onLast={save}>
          <Field label="Server address">
            <input aria-label="Server address" data-nav autoFocus value={url} onChange={(e) => setUrl(e.target.value)} style={{ width: 360 }} />
          </Field>
        </NavRoot>
        {problem && <p className="err" role="alert">{problem}</p>}
        <p>
          <button className="primary" onClick={() => void save()}>
            Save and try again
          </button>
        </p>
      </div>
    </div>
  );
}
```

`packages/app/src/renderer/screens/LoginScreen.tsx`:
```tsx
import { useState } from 'react';
import { Field } from '../ui/Field';
import { NavRoot } from '../ui/NavRoot';

export function LoginScreen({
  onSubmit,
  onChangeServer,
  notice,
}: {
  onSubmit: (username: string, password: string) => Promise<void>;
  onChangeServer: () => void;
  notice?: string;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    if (!username.trim() || !password) {
      setError('Enter your username and password');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(username.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="overlay">
      <div className="dialog" role="dialog" aria-label="Sign in">
        <h1>SAS</h1>
        {notice && <p role="status">{notice}</p>}
        <NavRoot onLast={() => void submit()}>
          <div className="form-row">
            <Field label="Username">
              <input aria-label="Username" data-nav autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
            <Field label="Password">
              <input aria-label="Password" data-nav type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </div>
        </NavRoot>
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        <p>
          <button className="primary" disabled={busy} onClick={() => void submit()}>
            Sign in
          </button>{' '}
          <button onClick={onChangeServer}>Change server address</button>
        </p>
      </div>
    </div>
  );
}
```

`packages/app/src/renderer/App.tsx`:
```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, createBridgeClient } from './api/client';
import { health, login, logout, me } from './api/endpoints';
import type { MeResponse } from './api/types';
import { ConnectScreen } from './screens/ConnectScreen';
import { LoginScreen } from './screens/LoginScreen';
import { DepsProvider, useDeps, type AppDeps } from './session/deps';
import { SessionProvider } from './session/Session';
import { Shell } from './shell/Shell';

type Phase =
  | { name: 'checking' }
  | { name: 'connect'; error: string }
  | { name: 'login'; notice?: string }
  | { name: 'ready'; me: MeResponse };

function defaultDeps(): AppDeps {
  return { api: createBridgeClient(window.sas), bridge: window.sas };
}

function AppInner() {
  const { api } = useDeps();
  const [phase, setPhase] = useState<Phase>({ name: 'checking' });

  const check = useCallback(async () => {
    setPhase({ name: 'checking' });
    try {
      await health(api);
      setPhase({ name: 'login' });
    } catch (e) {
      setPhase({ name: 'connect', error: e instanceof ApiError ? e.message : String(e) });
    }
  }, [api]);

  useEffect(() => {
    void check();
  }, [check]);

  useEffect(() => {
    api.onUnauthorized = () => {
      api.setToken(null);
      setPhase((p) => (p.name === 'ready' ? { name: 'login', notice: 'Your session has ended. Please sign in again.' } : p));
    };
    return () => {
      api.onUnauthorized = null;
    };
  }, [api]);

  async function signIn(username: string, password: string) {
    const { token } = await login(api, username, password);
    api.setToken(token);
    setPhase({ name: 'ready', me: await me(api) });
  }

  async function signOut() {
    try {
      await logout(api);
    } catch {
      /* the token may already be gone */
    }
    api.setToken(null);
    setPhase({ name: 'login' });
  }

  switch (phase.name) {
    case 'checking':
      return <p style={{ padding: 16 }}>Connecting to the server…</p>;
    case 'connect':
      return <ConnectScreen error={phase.error} onRetry={() => void check()} />;
    case 'login':
      return <LoginScreen notice={phase.notice} onSubmit={signIn} onChangeServer={() => setPhase({ name: 'connect', error: '' })} />;
    case 'ready':
      return (
        <SessionProvider me={phase.me} onLogout={() => void signOut()}>
          <Shell />
        </SessionProvider>
      );
  }
}

export function App({ deps }: { deps?: AppDeps }) {
  const resolved = useMemo(() => deps ?? defaultDeps(), [deps]);
  return (
    <DepsProvider deps={resolved}>
      <AppInner />
    </DepsProvider>
  );
}
```
`main.tsx` needs no change (`<App />` with no props uses the real bridge).

- [ ] **Step 4: Run the tests and the type-check**

Run: `npx vitest run packages/app && npm run typecheck`
Expected: PASS — visibility (5), Palette (5), App (8), Shell (9) and all earlier app tests; no type errors. If a Shell test cannot find `heading "Cash / Bank Receipt"`, the placeholder renders the title in an `<h2>`; check that `screenComponents.tsx` uses the screen's `title`.

- [ ] **Step 5: Commit**

```bash
git add packages/app
git commit -m "feat(app): session, shell with menu, F1/F2/F9 navigation, connect and login screens" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Keyboard-first form controls — Indian number format, dates, money, date and lookup inputs

**Files:**
- Create: `packages/app/src/renderer/ui/format.ts`, `dates.ts`, `MoneyInput.tsx`, `DateInput.tsx`, `Lookup.tsx`
- Test: `ui/format.test.ts`, `ui/dates.test.ts`, `ui/NavRoot.test.tsx`, `ui/MoneyInput.test.tsx`, `ui/DateInput.test.tsx`, `ui/Lookup.test.tsx`

**Interfaces:**
- Consumes: `NavRoot`, `focusNextNav` (Task 5); `toPaise`, `fromPaise` from `@sas/shared`.
- Produces:
  - `format.ts`: `formatInr(amount: string): string` (`"1234567.5"` → `"12,34,567.50"`; negatives keep the sign); `formatDrCr(x: { amount: string; side: 'Dr' | 'Cr' }): string` (`"1,500.00 Dr"`); `normalizeAmount(text: string): string` (`""`→`""`, `"5"`→`"5.00"`, `".5"`→`"0.50"`, `"1,234.5"`→`"1234.50"`).
  - `dates.ts`: `interface DateCtx { yearStart: string; yearEnd: string; base: string }`; `parseDateInput(text: string, ctx: DateCtx): string | null`; `formatDisplay(iso: string): string` (`dd-mm-yyyy`); `todayIso(now?: Date): string`; `clampToYear(iso: string, start: string, end: string): string`.
  - `MoneyInput({ value, onChange, label, disabled?, ...inputProps })`: digits and one dot only, two decimals at most; on blur the value becomes a normalised two-decimal amount; selects its text on focus; carries `data-nav`.
  - `DateInput({ value: string | null, onChange(iso: string | null), ctx: DateCtx, label })`: shows `dd-mm-yyyy`; accepts `10`, `1005`, `100526`, `10052026`, `10/5`, `10-05-26`; Enter or blur commits; an unreadable date marks the field invalid and Enter does not move on; carries `data-nav`.
  - `Lookup({ items, value, onChange, label, placeholder?, autoFocus?, disabled?, ...data })` with `LookupItem = { id: string; label: string; sub?: string }` and `filterItems(items, query, limit?)`. Behaviour: typing filters (names that start with the text first); Down opens the list; Up/Down move; Enter picks the highlighted entry **and moves to the next field**; Tab picks the highlighted entry when something was typed; Esc closes the list (consumed, so the screen does not go back); leaving the field with unmatched text restores the selected name; clearing the text clears the selection. ARIA roles: `combobox`, `listbox`, `option`.

- [ ] **Step 1: Write the failing tests**

`packages/app/src/renderer/ui/format.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatDrCr, formatInr, normalizeAmount } from './format';

describe('formatInr', () => {
  it('groups digits the Indian way', () => {
    expect(formatInr('0')).toBe('0.00');
    expect(formatInr('999')).toBe('999.00');
    expect(formatInr('1000')).toBe('1,000.00');
    expect(formatInr('100000')).toBe('1,00,000.00');
    expect(formatInr('1234567.5')).toBe('12,34,567.50');
    expect(formatInr('123456789.05')).toBe('12,34,56,789.05');
  });
  it('keeps the sign of negative amounts', () => {
    expect(formatInr('-100000')).toBe('-1,00,000.00');
    expect(formatInr('-0.5')).toBe('-0.50');
  });
});

describe('formatDrCr', () => {
  it('prints the amount with its side', () => {
    expect(formatDrCr({ amount: '1500', side: 'Dr' })).toBe('1,500.00 Dr');
    expect(formatDrCr({ amount: '20.5', side: 'Cr' })).toBe('20.50 Cr');
  });
});

describe('normalizeAmount', () => {
  it('turns typed text into a two-decimal amount, or empty', () => {
    expect(normalizeAmount('')).toBe('');
    expect(normalizeAmount('.')).toBe('');
    expect(normalizeAmount('5')).toBe('5.00');
    expect(normalizeAmount('.5')).toBe('0.50');
    expect(normalizeAmount('5.')).toBe('5.00');
    expect(normalizeAmount('1,234.5')).toBe('1234.50');
    expect(normalizeAmount('007.1')).toBe('7.10');
    expect(normalizeAmount('12.345')).toBe('12.34');
  });
});
```

`packages/app/src/renderer/ui/dates.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { clampToYear, formatDisplay, parseDateInput, todayIso, type DateCtx } from './dates';

const ctx: DateCtx = { yearStart: '2026-04-01', yearEnd: '2027-03-31', base: '2026-05-03' };

describe('parseDateInput', () => {
  it('a day alone uses the month and year of the base date', () => {
    expect(parseDateInput('10', ctx)).toBe('2026-05-10');
    expect(parseDateInput('7', ctx)).toBe('2026-05-07');
  });
  it('day and month take the year from the financial year', () => {
    expect(parseDateInput('1005', ctx)).toBe('2026-05-10');
    expect(parseDateInput('0102', ctx)).toBe('2027-02-01');
    expect(parseDateInput('1/2', ctx)).toBe('2027-02-01');
    expect(parseDateInput('10/5', ctx)).toBe('2026-05-10');
  });
  it('accepts two-digit and four-digit years, with or without separators', () => {
    expect(parseDateInput('100526', ctx)).toBe('2026-05-10');
    expect(parseDateInput('10052026', ctx)).toBe('2026-05-10');
    expect(parseDateInput('10-05-26', ctx)).toBe('2026-05-10');
    expect(parseDateInput('10/05/2026', ctx)).toBe('2026-05-10');
    expect(parseDateInput('10.05.2026', ctx)).toBe('2026-05-10');
  });
  it('handles leap days using the financial year', () => {
    const leap: DateCtx = { yearStart: '2027-04-01', yearEnd: '2028-03-31', base: '2027-04-01' };
    expect(parseDateInput('2902', leap)).toBe('2028-02-29');
    expect(parseDateInput('2902', ctx)).toBeNull();
  });
  it('rejects nonsense', () => {
    for (const bad of ['', '  ', 'abc', '10a', '31/02', '3104', '0013', '999999999', '1005-', '35']) {
      expect(parseDateInput(bad, ctx), bad).toBeNull();
    }
  });
  it('a day that does not exist in the base month is rejected', () => {
    expect(parseDateInput('31', { ...ctx, base: '2026-04-03' })).toBeNull();
  });
});

describe('formatDisplay / todayIso / clampToYear', () => {
  it('formats as dd-mm-yyyy', () => {
    expect(formatDisplay('2026-05-03')).toBe('03-05-2026');
  });
  it('todayIso uses the local calendar date', () => {
    expect(todayIso(new Date(2026, 4, 3, 23, 30))).toBe('2026-05-03');
  });
  it('clamps a date into the year', () => {
    expect(clampToYear('2026-01-01', '2026-04-01', '2027-03-31')).toBe('2026-04-01');
    expect(clampToYear('2028-01-01', '2026-04-01', '2027-03-31')).toBe('2027-03-31');
    expect(clampToYear('2026-08-01', '2026-04-01', '2027-03-31')).toBe('2026-08-01');
  });
});
```

`packages/app/src/renderer/ui/NavRoot.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NavRoot } from './NavRoot';

function Form({ onLast }: { onLast: () => void }) {
  return (
    <NavRoot onLast={onLast}>
      <input aria-label="one" data-nav />
      <input aria-label="skipped (no data-nav)" />
      <input aria-label="two" data-nav />
      <textarea aria-label="notes" data-nav />
      <input aria-label="disabled" data-nav disabled />
      <input aria-label="three" data-nav />
    </NavRoot>
  );
}

describe('NavRoot', () => {
  it('Enter moves to the next data-nav field, skipping other and disabled ones', async () => {
    const user = userEvent.setup();
    render(<Form onLast={() => {}} />);
    await user.click(screen.getByLabelText('one'));
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('two')).toHaveFocus();
  });

  it('leaves Enter alone inside a textarea', async () => {
    const user = userEvent.setup();
    render(<Form onLast={() => {}} />);
    await user.click(screen.getByLabelText('notes'));
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('notes')).toHaveFocus();
    expect(screen.getByLabelText('notes')).toHaveValue('\n');
  });

  it('calls onLast from the last field', async () => {
    const user = userEvent.setup();
    const onLast = vi.fn();
    render(<Form onLast={onLast} />);
    await user.click(screen.getByLabelText('three'));
    await user.keyboard('{Enter}');
    expect(onLast).toHaveBeenCalledTimes(1);
  });

  it('ignores an Enter that something else already handled', async () => {
    const user = userEvent.setup();
    const onLast = vi.fn();
    render(
      <NavRoot onLast={onLast}>
        <input aria-label="a" data-nav onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
        <input aria-label="b" data-nav />
      </NavRoot>,
    );
    await user.click(screen.getByLabelText('a'));
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('a')).toHaveFocus();
  });
});
```

`packages/app/src/renderer/ui/MoneyInput.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { MoneyInput } from './MoneyInput';

function Harness({ initial = '' }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <MoneyInput label="Amount" value={v} onChange={setV} />
      <input aria-label="other" />
      <output aria-label="value">{v}</output>
    </>
  );
}

describe('MoneyInput', () => {
  it('accepts only digits and one dot, with at most two decimals', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText('Amount'), 'a1b2.3.4,5x6');
    expect(screen.getByLabelText('Amount')).toHaveValue('12.34');
  });

  it('turns the text into a two-decimal amount when you leave the field', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText('Amount'), '5');
    await user.tab();
    expect(screen.getByLabelText('Amount')).toHaveValue('5.00');
    await user.clear(screen.getByLabelText('Amount'));
    await user.type(screen.getByLabelText('Amount'), '.5');
    await user.tab();
    expect(screen.getByLabelText('Amount')).toHaveValue('0.50');
  });

  it('leaves an empty field empty', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByLabelText('Amount'));
    await user.tab();
    expect(screen.getByLabelText('Amount')).toHaveValue('');
  });

  it('selects the existing text when it gets focus, so typing replaces it', async () => {
    const user = userEvent.setup();
    render(<Harness initial="100.00" />);
    await user.tab();
    await user.keyboard('25');
    expect(screen.getByLabelText('Amount')).toHaveValue('25');
  });

  it('is part of the Enter-key navigation unless it opts out', () => {
    const { rerender } = render(<MoneyInput label="Amount" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Amount')).toHaveAttribute('data-nav');
    rerender(<MoneyInput label="Amount" value="" onChange={() => {}} nav={false} />);
    expect(screen.getByLabelText('Amount')).not.toHaveAttribute('data-nav');
  });
});
```

`packages/app/src/renderer/ui/DateInput.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { DateCtx } from './dates';
import { DateInput } from './DateInput';

const ctx: DateCtx = { yearStart: '2026-04-01', yearEnd: '2027-03-31', base: '2026-05-03' };

function Harness({ initial = null }: { initial?: string | null }) {
  const [v, setV] = useState<string | null>(initial);
  return (
    <>
      <DateInput label="Date" value={v} onChange={setV} ctx={ctx} />
      <input aria-label="next" data-nav />
      <output aria-label="iso">{v ?? 'none'}</output>
    </>
  );
}

describe('DateInput', () => {
  it('shows an ISO value as dd-mm-yyyy', () => {
    render(<Harness initial="2026-05-03" />);
    expect(screen.getByLabelText('Date')).toHaveValue('03-05-2026');
  });

  it('understands short typing and commits on blur', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText('Date'), '1005');
    await user.tab();
    expect(screen.getByLabelText('iso')).toHaveTextContent('2026-05-10');
    expect(screen.getByLabelText('Date')).toHaveValue('10-05-2026');
  });

  it('Enter commits the date', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText('Date'), '12{Enter}');
    expect(screen.getByLabelText('iso')).toHaveTextContent('2026-05-12');
  });

  it('marks an unreadable date invalid and does not let Enter move on', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText('Date');
    await user.type(input, '31/02{Enter}');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, '0302{Enter}');
    expect(input).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('iso')).toHaveTextContent('2027-02-03');
  });

  it('clearing the field clears the date', async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-05-03" />);
    await user.clear(screen.getByLabelText('Date'));
    await user.tab();
    expect(screen.getByLabelText('iso')).toHaveTextContent('none');
  });
});
```

`packages/app/src/renderer/ui/Lookup.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { filterItems, Lookup, type LookupItem } from './Lookup';
import { NavRoot } from './NavRoot';

const ITEMS: LookupItem[] = [
  { id: 'a', label: 'Ramesh Traders', sub: 'Surat' },
  { id: 'b', label: 'Suresh Textiles', sub: 'Surat' },
  { id: 'c', label: 'Mahesh Fabrics', sub: 'Mumbai' },
  { id: 'd', label: 'Rameshwar Cloth', sub: 'Surat' },
];

function Harness({ onChange = () => {}, initial = null }: { onChange?: (id: string | null) => void; initial?: string | null }) {
  const [v, setV] = useState<string | null>(initial);
  return (
    <NavRoot>
      <Lookup
        label="Account"
        items={ITEMS}
        value={v}
        onChange={(id) => {
          setV(id);
          onChange(id);
        }}
      />
      <input aria-label="Amount" data-nav />
    </NavRoot>
  );
}

describe('filterItems', () => {
  it('puts names that start with the text first, then names or details that contain it', () => {
    expect(filterItems(ITEMS, 'ram').map((i) => i.id)).toEqual(['a', 'd']);
    expect(filterItems(ITEMS, 'esh').map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(filterItems(ITEMS, 'mumbai').map((i) => i.id)).toEqual(['c']);
    expect(filterItems(ITEMS, '').length).toBe(4);
    expect(filterItems(ITEMS, 'zzz')).toEqual([]);
    expect(filterItems(ITEMS, 'esh', 2).length).toBe(2);
  });
});

describe('Lookup', () => {
  it('filters while typing and shows the details', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('combobox', { name: 'Account' }), 'sur');
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([expect.stringContaining('Suresh Textiles')]);
  });

  it('Enter picks the highlighted entry and moves to the next field', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(screen.getByRole('combobox', { name: 'Account' }), 'ram{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('a');
    expect(screen.getByRole('combobox', { name: 'Account' })).toHaveValue('Ramesh Traders');
    expect(screen.getByLabelText('Amount')).toHaveFocus();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('Down opens the list and the arrow keys choose', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('combobox', { name: 'Account' }));
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')).toHaveLength(4);
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('b');
  });

  it('Esc closes the list and nothing else reacts to it', async () => {
    const user = userEvent.setup();
    const outer = vi.fn();
    render(
      <div onKeyDown={(e) => e.key === 'Escape' && outer(e.defaultPrevented)}>
        <Harness />
      </div>,
    );
    await user.type(screen.getByRole('combobox', { name: 'Account' }), 'ram');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(outer).toHaveBeenCalledWith(true); // preventDefault() was called, so the app's global Esc is skipped
  });

  it('Esc with the list closed is left for the app', async () => {
    const user = userEvent.setup();
    const outer = vi.fn();
    render(
      <div onKeyDown={(e) => e.key === 'Escape' && outer(e.defaultPrevented)}>
        <Harness />
      </div>,
    );
    await user.click(screen.getByRole('combobox', { name: 'Account' }));
    await user.keyboard('{Escape}');
    expect(outer).toHaveBeenCalledWith(false);
  });

  it('Tab picks the highlighted entry when something was typed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(screen.getByRole('combobox', { name: 'Account' }), 'mah');
    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith('c');
    expect(screen.getByRole('combobox', { name: 'Account' })).toHaveValue('Mahesh Fabrics');
  });

  it('leaving the field with text that matches nothing puts the selected name back (or empties it when nothing is selected)', async () => {
    const user = userEvent.setup();
    render(<Harness initial="a" />);
    const box = screen.getByRole('combobox', { name: 'Account' });
    expect(box).toHaveValue('Ramesh Traders');
    // Typing junk without clearing first: the selection is kept, so leaving restores the name.
    await user.type(box, 'zzz'); // whether this replaces or follows the name, the text matches nothing
    await user.tab();
    expect(box).toHaveValue('Ramesh Traders');
    // After clearing, nothing is selected any more, so leaving with junk text leaves the field empty.
    await user.clear(box);
    await user.type(box, 'qqq');
    await user.tab();
    expect(box).toHaveValue('');
  });

  it('clearing the text clears the selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial="a" onChange={onChange} />);
    await user.clear(screen.getByRole('combobox', { name: 'Account' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('Enter with nothing highlighted does not move on while the text matches nothing', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('combobox', { name: 'Account' }), 'qqq{Enter}');
    expect(screen.getByRole('combobox', { name: 'Account' })).toHaveFocus();
  });

  it('a click on an entry picks it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('combobox', { name: 'Account' }));
    await user.keyboard('{ArrowDown}');
    await user.click(screen.getByRole('option', { name: /Mahesh Fabrics/ }));
    expect(onChange).toHaveBeenLastCalledWith('c');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/app/src/renderer/ui`
Expected: FAIL — cannot find modules `./format`, `./dates`, `./MoneyInput`, `./DateInput`, `./Lookup`.

- [ ] **Step 3: Write the implementation**

`packages/app/src/renderer/ui/format.ts`:
```ts
import { fromPaise, toPaise } from '@sas/shared';

/** 1234567.5 -> "12,34,567.50": the last three digits, then groups of two. */
export function formatInr(amount: string): string {
  const negative = amount.startsWith('-');
  const [whole = '0', frac = ''] = (negative ? amount.slice(1) : amount).split('.');
  const tail = whole.slice(-3);
  let rest = whole.slice(0, -3);
  const groups: string[] = [];
  while (rest.length > 2) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) groups.unshift(rest);
  const grouped = groups.length ? `${groups.join(',')},${tail}` : tail;
  return `${negative ? '-' : ''}${grouped}.${frac.padEnd(2, '0').slice(0, 2)}`;
}

export function formatDrCr(x: { amount: string; side: 'Dr' | 'Cr' }): string {
  return `${formatInr(x.amount)} ${x.side}`;
}

/** Typed text to a two-decimal amount, or "" when there is nothing to normalise. Extra decimals are cut, never rounded. */
export function normalizeAmount(text: string): string {
  const t = text.replace(/,/g, '').trim();
  if (t === '' || t === '.') return '';
  const [whole = '', frac = ''] = t.split('.');
  return fromPaise(toPaise(`${whole === '' ? '0' : whole}.${frac.slice(0, 2).padEnd(2, '0')}`));
}
```

`packages/app/src/renderer/ui/dates.ts`:
```ts
export interface DateCtx {
  /** Start and end of the financial year, ISO. */
  yearStart: string;
  yearEnd: string;
  /** Used when only a day is typed: its month and year apply. */
  base: string;
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

function isReal(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const toIso = (y: number, m: number, d: number) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

export function formatDisplay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

export function todayIso(now: Date = new Date()): string {
  return toIso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function clampToYear(iso: string, start: string, end: string): string {
  return iso < start ? start : iso > end ? end : iso;
}

/**
 * Operators type dates in a hurry: "10", "1005", "100526", "10052026", "10/5", "10-05-26".
 * A day and month without a year take the year of the financial year that contains that date.
 */
export function parseDateInput(text: string, ctx: DateCtx): string | null {
  const t = text.trim();
  if (t === '' || /[^0-9\s/.\-]/.test(t)) return null;

  let d: number;
  let m: number | undefined;
  let y: number | undefined;
  const parts = t.split(/[^0-9]+/).filter(Boolean);
  if (parts.length >= 2) {
    d = Number(parts[0]);
    m = Number(parts[1]);
    if (parts[2] !== undefined) y = parts[2].length <= 2 ? 2000 + Number(parts[2]) : Number(parts[2]);
  } else {
    const digits = parts[0] ?? '';
    if (digits.length <= 2) d = Number(digits);
    else if (digits.length === 4) {
      d = Number(digits.slice(0, 2));
      m = Number(digits.slice(2));
    } else if (digits.length === 6) {
      d = Number(digits.slice(0, 2));
      m = Number(digits.slice(2, 4));
      y = 2000 + Number(digits.slice(4));
    } else if (digits.length === 8) {
      d = Number(digits.slice(0, 2));
      m = Number(digits.slice(2, 4));
      y = Number(digits.slice(4));
    } else return null;
  }

  if (m === undefined) {
    const [by, bm] = ctx.base.split('-').map(Number) as [number, number];
    m = bm;
    y = by;
  } else if (y === undefined) {
    const startYear = Number(ctx.yearStart.slice(0, 4));
    const endYear = Number(ctx.yearEnd.slice(0, 4));
    y = [startYear, endYear].find((cy) => {
      if (!isReal(cy, m!, d)) return false;
      const iso = toIso(cy, m!, d);
      return iso >= ctx.yearStart && iso <= ctx.yearEnd;
    });
    if (y === undefined) return null;
  }
  return isReal(y!, m, d) ? toIso(y!, m, d) : null;
}
```

`packages/app/src/renderer/ui/MoneyInput.tsx`:
```tsx
import type { InputHTMLAttributes } from 'react';
import { normalizeAmount } from './format';

/** Keep digits and at most one dot, with at most two decimals. */
function sanitize(raw: string): string {
  let s = raw.replace(/[^0-9.]/g, '');
  const dot = s.indexOf('.');
  if (dot >= 0) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  return s;
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: string;
  onChange: (value: string) => void;
  label: string;
  /** Set to false to leave this field out of Enter-key navigation (it can still be reached with Tab). */
  nav?: boolean;
};

export function MoneyInput({ value, onChange, label, nav = true, className, ...rest }: Props) {
  return (
    <input
      {...rest}
      data-nav={nav ? '' : undefined}
      inputMode="decimal"
      autoComplete="off"
      aria-label={label}
      className={`money ${className ?? ''}`.trim()}
      value={value}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => onChange(sanitize(e.target.value))}
      onBlur={() => {
        const normalized = normalizeAmount(value);
        if (normalized !== value) onChange(normalized);
      }}
    />
  );
}
```

`packages/app/src/renderer/ui/DateInput.tsx`:
```tsx
import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { formatDisplay, parseDateInput, type DateCtx } from './dates';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: string | null;
  onChange: (iso: string | null) => void;
  ctx: DateCtx;
  label: string;
};

export function DateInput({ value, onChange, ctx, label, ...rest }: Props) {
  const [text, setText] = useState(value ? formatDisplay(value) : '');
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setText(value ? formatDisplay(value) : '');
    setInvalid(false);
  }, [value]);

  /** Returns false when the text is not a readable date. */
  function commit(): boolean {
    if (text.trim() === '') {
      onChange(null);
      setInvalid(false);
      return true;
    }
    const iso = parseDateInput(text, ctx);
    if (!iso) {
      setInvalid(true);
      return false;
    }
    setInvalid(false);
    setText(formatDisplay(iso));
    onChange(iso);
    return true;
  }

  return (
    <input
      {...rest}
      data-nav=""
      autoComplete="off"
      placeholder="dd-mm-yyyy"
      aria-label={label}
      aria-invalid={invalid ? 'true' : undefined}
      value={text}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !commit()) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      style={invalid ? { borderColor: 'var(--bad)', width: 120 } : { width: 120 }}
    />
  );
}
```

`packages/app/src/renderer/ui/Lookup.tsx`:
```tsx
import { useEffect, useId, useMemo, useRef, useState, type InputHTMLAttributes } from 'react';
import { focusNextNav } from './NavRoot';

export interface LookupItem {
  id: string;
  label: string;
  /** Smaller text beside the name, such as the group or city. Also searched. */
  sub?: string;
}

export function filterItems(items: LookupItem[], query: string, limit = 50): LookupItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items.slice(0, limit);
  const starts: LookupItem[] = [];
  const contains: LookupItem[] = [];
  for (const item of items) {
    const label = item.label.toLowerCase();
    if (label.startsWith(q)) starts.push(item);
    else if (label.includes(q) || (item.sub ?? '').toLowerCase().includes(q)) contains.push(item);
  }
  return [...starts, ...contains].slice(0, limit);
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  items: LookupItem[];
  value: string | null;
  onChange: (id: string | null) => void;
  label: string;
};

/** A type-ahead picker over an in-memory list. Built for the keyboard: see the task description for the keys. */
export function Lookup({ items, value, onChange, label, ...rest }: Props) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = items.find((i) => i.id === value) ?? null;
  const [text, setText] = useState(selected?.label ?? '');
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);

  useEffect(() => {
    setText(selected?.label ?? '');
    setDirty(false);
  }, [selected?.id, selected?.label]);

  const matches = useMemo(() => filterItems(items, dirty ? text : ''), [items, text, dirty]);
  const active = Math.min(hi, Math.max(matches.length - 1, 0));

  function pick(item: LookupItem, advance: boolean) {
    onChange(item.id);
    setText(item.label);
    setDirty(false);
    setOpen(false);
    // Move on after React has re-rendered, so a field that only appears once this one is filled
    // (a book's ledger box, say) can take the cursor.
    if (advance) queueMicrotask(() => inputRef.current && focusNextNav(inputRef.current));
  }

  return (
    <div className="lookup">
      <input
        {...rest}
        ref={inputRef}
        data-nav=""
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={text}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
          setOpen(true);
          setHi(0);
          if (e.target.value === '') onChange(null);
        }}
        onBlur={() => {
          setOpen(false);
          if (dirty) {
            setText(selected?.label ?? '');
            setDirty(false);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!open) {
              setOpen(true);
              setHi(0);
            } else setHi(Math.min(active + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            if (open) {
              e.preventDefault();
              setHi(Math.max(active - 1, 0));
            }
          } else if (e.key === 'Enter') {
            const choice = matches[active];
            if (open && choice) {
              e.preventDefault();
              e.stopPropagation();
              pick(choice, true);
            } else if (dirty) {
              // text that matches nothing: stay put
              e.preventDefault();
              e.stopPropagation();
            }
          } else if (e.key === 'Escape') {
            if (open) {
              e.preventDefault();
              setOpen(false);
            }
          } else if (e.key === 'Tab') {
            const choice = matches[active];
            if (open && dirty && choice) pick(choice, false);
          }
        }}
      />
      {open && (
        <ul id={listId} role="listbox" aria-label={`${label} choices`}>
          {matches.map((item, i) => (
            <li
              key={item.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(item, true);
              }}
            >
              <span>{item.label}</span>
              {item.sub && <span className="muted">{item.sub}</span>}
            </li>
          ))}
          {matches.length === 0 && <li className="muted">Nothing matches</li>}
        </ul>
      )}
    </div>
  );
}
```
Note for the implementer: `scrollIntoView` is intentionally not used (jsdom lacks it); the list shows at most 50 entries in a scrolling box. If the highlighted entry scrolls out of view in the real app, add `el.scrollIntoView?.({ block: 'nearest' })` in an effect keyed on `active`.

- [ ] **Step 4: Run the tests and the type-check**

Run: `npx vitest run packages/app/src/renderer/ui && npm run typecheck`
Expected: PASS — format (3 groups), dates (8), NavRoot (4), MoneyInput (5), DateInput (5), Lookup (10); no type errors. A known trap: `user.type(input, 'ram{Enter}')` must find the list open because typing sets `open`; if the Enter test fails with focus still on the Lookup, check that `focusNextNav` is called after `onChange`.

- [ ] **Step 5: Commit**

```bash
git add packages/app
git commit -m "feat(app): keyboard-first controls — Indian amounts, quick dates, money input, type-ahead lookup" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Lookup data — ledgers, books and groups cached for the company

**Files:**
- Create: `packages/app/src/renderer/session/Lookups.tsx`
- Modify: `packages/app/src/renderer/App.tsx` (wrap the shell), `packages/app/src/renderer/testing/render.tsx` (add `renderScreen`)
- Test: `packages/app/src/renderer/session/Lookups.test.tsx`

**Interfaces:**
- Consumes: `listLedgers`, `listBooks`, `listGroups` (Task 4); `useSession`, `SessionContext` (Task 5); `LookupItem` (Task 6).
- Produces:
  ```ts
  interface LookupsValue {
    ledgers: LedgerLite[]; books: BookLite[]; groups: GroupLite[];
    loading: boolean; error: string | null;
    reload(): Promise<void>;
    ledgerItems: LookupItem[];                       // active ledgers: label = name, sub = "group · city"
    booksFor(kind: VoucherKind): BookLite[];         // receipt/payment: cash and bank books; journal: journal books
    bookItems(kind: VoucherKind): LookupItem[];      // label = name, sub = code
  }
  LookupsContext, useLookups(), <LookupsProvider>
  ```
  The provider loads once per company and keeps the lists in memory, so typing in an account field never waits on the network. `reload()` fetches them again (used after creating a ledger or book).
- Produces (test helper): `renderScreen(ui, opts?: { api?, routes?, session?: Partial<SessionValue>, lookups?: Partial<LookupsValue>, bridge?, nav? })` renders a single screen with a static session (admin, company `c1`, year `y1` 2026-27), real `LookupsProvider` reading from the fake API, and a recording `NavContext`.

- [ ] **Step 1: Write the failing test**

`packages/app/src/renderer/session/Lookups.test.tsx`:
```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import type { LedgerLite } from '../api/types';
import { createFakeClient } from '../testing/fakeClient';
import { BOOKS, LEDGERS, baseRoutes } from '../testing/sampleData';
import { renderScreen } from '../testing/render';
import { useLookups } from './Lookups';

function Probe() {
  const l = useLookups();
  return (
    <div>
      <p>{l.loading ? 'loading' : 'ready'}</p>
      {l.error && <p role="alert">{l.error}</p>}
      <ul aria-label="ledgers">{l.ledgerItems.map((i) => <li key={i.id}>{`${i.label}|${i.sub ?? ''}`}</li>)}</ul>
      <ul aria-label="receipt books">{l.booksFor('receipt').map((b) => <li key={b.id}>{b.code}</li>)}</ul>
      <ul aria-label="journal books">{l.bookItems('journal').map((b) => <li key={b.id}>{`${b.label}|${b.sub}`}</li>)}</ul>
      <button onClick={() => void l.reload()}>reload</button>
    </div>
  );
}

describe('LookupsProvider', () => {
  it('loads the ledgers and books of the company once', async () => {
    const { api } = renderScreen(<Probe />);
    expect(await screen.findByText('ready')).toBeInTheDocument();
    const items = screen.getByLabelText('ledgers').textContent;
    expect(items).toContain('Ramesh Traders|Sundry Debtors · Surat');
    expect(items).toContain('Cash|Cash-in-Hand');
    expect(api.calls.filter((c) => c.path.endsWith('/ledgers')).length).toBe(1);
  });

  it('offers only cash and bank books for receipts and only journal books for journals', async () => {
    renderScreen(<Probe />);
    await screen.findByText('ready');
    expect(screen.getByLabelText('receipt books').textContent).toBe('CB');
    expect(screen.getByLabelText('journal books').textContent).toBe('Journal|JV');
  });

  it('leaves blocked ledgers out of the picker', async () => {
    const blocked: LedgerLite = { ...LEDGERS[0]!, id: 'l-x', name: 'Old Account', status: 'blocked' };
    renderScreen(<Probe />, {
      routes: [{ method: 'GET', path: '/api/companies/c1/ledgers', reply: () => [...LEDGERS, blocked] }],
    });
    await screen.findByText('ready');
    expect(screen.getByLabelText('ledgers').textContent).not.toContain('Old Account');
  });

  it('reload picks up changes', async () => {
    const user = userEvent.setup();
    let extra: LedgerLite[] = [];
    renderScreen(<Probe />, {
      routes: [{ method: 'GET', path: '/api/companies/c1/ledgers', reply: () => [...LEDGERS, ...extra] }],
    });
    await screen.findByText('ready');
    extra = [{ ...LEDGERS[0]!, id: 'l-new', name: 'Brand New Party' }];
    await user.click(screen.getByRole('button', { name: 'reload' }));
    await waitFor(() => expect(screen.getByLabelText('ledgers').textContent).toContain('Brand New Party'));
  });

  it('reports a failure instead of crashing', async () => {
    renderScreen(<Probe />, {
      routes: [
        {
          method: 'GET',
          path: '/api/companies/c1/ledgers',
          reply: () => {
            throw new ApiError(0, 'NETWORK', 'Cannot reach the server.');
          },
        },
      ],
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
  });
});

describe('fake routes used by the helper', () => {
  it('serve the sample data', async () => {
    const api = createFakeClient(baseRoutes());
    expect(await api.request('GET', '/api/companies/c1/books')).toEqual(BOOKS);
  });
});
```
(`render` and `screen` are imported from Testing Library; `render` is unused above except via `renderScreen` — remove the unused import if the linter complains.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/app/src/renderer/session/Lookups.test.tsx`
Expected: FAIL — cannot find module `./Lookups` and `renderScreen` is not exported.

- [ ] **Step 3: Write the implementation**

`packages/app/src/renderer/session/Lookups.tsx`:
```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { VoucherKind } from '@sas/shared';
import { listBooks, listGroups, listLedgers } from '../api/endpoints';
import type { BookLite, GroupLite, LedgerLite } from '../api/types';
import type { LookupItem } from '../ui/Lookup';
import { useApi } from './deps';
import { useSession } from './Session';

export interface LookupsValue {
  ledgers: LedgerLite[];
  books: BookLite[];
  groups: GroupLite[];
  loading: boolean;
  error: string | null;
  reload(): Promise<void>;
  ledgerItems: LookupItem[];
  booksFor(kind: VoucherKind): BookLite[];
  bookItems(kind: VoucherKind): LookupItem[];
}

export const LookupsContext = createContext<LookupsValue | null>(null);

export function useLookups(): LookupsValue {
  const v = useContext(LookupsContext);
  if (!v) throw new Error('LookupsProvider is missing');
  return v;
}

export function LookupsProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const companyId = useSession().company?.id ?? null;
  const [ledgers, setLedgers] = useState<LedgerLite[]>([]);
  const [books, setBooks] = useState<BookLite[]>([]);
  const [groups, setGroups] = useState<GroupLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!companyId) {
      setLedgers([]);
      setBooks([]);
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [l, b, g] = await Promise.all([listLedgers(api, companyId), listBooks(api, companyId), listGroups(api, companyId)]);
      setLedgers(l);
      setBooks(b);
      setGroups(g);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [api, companyId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo<LookupsValue>(() => {
    const booksFor = (kind: VoucherKind) =>
      books.filter((b) => (kind === 'journal' ? b.type === 'journal' : b.type === 'cash' || b.type === 'bank'));
    return {
      ledgers,
      books,
      groups,
      loading,
      error,
      reload,
      ledgerItems: ledgers
        .filter((l) => l.status === 'active')
        .map((l) => ({ id: l.id, label: l.name, sub: [l.groupName, l.city].filter(Boolean).join(' · ') })),
      booksFor,
      bookItems: (kind) => booksFor(kind).map((b) => ({ id: b.id, label: b.name, sub: b.code })),
    };
  }, [ledgers, books, groups, loading, error, reload]);

  return <LookupsContext.Provider value={value}>{children}</LookupsContext.Provider>;
}
```

In `packages/app/src/renderer/App.tsx` import `LookupsProvider` from `./session/Lookups` and wrap the shell:
```tsx
        <SessionProvider me={phase.me} onLogout={() => void signOut()}>
          <LookupsProvider>
            <Shell />
          </LookupsProvider>
        </SessionProvider>
```

Append to `packages/app/src/renderer/testing/render.tsx` (add the imports at the top of the file):
```tsx
import type { ReactElement } from 'react';
import { NavContext, type NavValue } from '../shell/nav';
import { DepsProvider } from '../session/deps';
import { LookupsContext, LookupsProvider, type LookupsValue } from '../session/Lookups';
import { SessionContext, type SessionValue } from '../session/Session';
import { COMPANY, ME_ADMIN, YEAR_2025, YEAR_2026 } from './sampleData';

export interface ScreenHarness {
  api: FakeClient;
  bridge: FakeBridge;
  /** Every open()/back() call the screen made, in order. */
  navCalls: string[];
}

function staticSession(partial: Partial<SessionValue>): SessionValue {
  return {
    actor: ME_ADMIN.actor,
    rights: ME_ADMIN.rights,
    companies: [COMPANY],
    company: COMPANY,
    year: YEAR_2026,
    years: [YEAR_2025, YEAR_2026],
    selectCompany: async () => {},
    selectYear: () => {},
    refreshCompanies: async () => {},
    reloadYears: async () => {},
    can: () => true,
    logout: () => {},
    ...partial,
  };
}

/**
 * Render one screen with an admin session (company c1, year 2026-27), a fake API and the real lookup cache.
 * Pass `lookups` to supply the cache directly instead of loading it through the fake API.
 */
export function renderScreen(
  ui: ReactElement,
  opts: {
    api?: FakeClient;
    routes?: FakeRoute[];
    session?: Partial<SessionValue>;
    lookups?: LookupsValue;
    bridge?: FakeBridge;
  } = {},
) {
  const api = opts.api ?? createFakeClient(baseRoutes({ extra: opts.routes }));
  const bridge = opts.bridge ?? createFakeBridge();
  const navCalls: string[] = [];
  const nav: NavValue = {
    current: { id: 'home' },
    open: (id, props) => navCalls.push(`open:${id}${props ? ` ${JSON.stringify(props)}` : ''}`),
    back: () => navCalls.push('back'),
  };
  const session = staticSession(opts.session ?? {});

  const utils = render(
    <DepsProvider deps={{ api, bridge }}>
      <SessionContext.Provider value={session}>
        <NavContext.Provider value={nav}>
          {opts.lookups ? <LookupsContext.Provider value={opts.lookups}>{ui}</LookupsContext.Provider> : <LookupsProvider>{ui}</LookupsProvider>}
        </NavContext.Provider>
      </SessionContext.Provider>
    </DepsProvider>,
  );
  return { api, bridge, navCalls, ...utils };
}
```
Add the missing imports at the top of `render.tsx`: `import { createFakeClient, type FakeClient, type FakeRoute } from './fakeClient';` is already present from Task 5; `FakeBridge`/`createFakeBridge` too. Keep one import line per module.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/app && npm run typecheck`
Expected: PASS — Lookups (6) and everything earlier; no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/app
git commit -m "feat(app): in-memory lookup cache for ledgers, books and groups plus a screen test harness" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Voucher form logic (pure functions) — totals, validation, payloads, bill allocation

**Files:**
- Create: `packages/app/src/renderer/vouchers/form.ts`
- Test: `packages/app/src/renderer/vouchers/form.test.ts`

**Interfaces:**
- Consumes: `buildEntries`, `toPaise`, `fromPaise`, `VoucherError`, `Side`, `VoucherKind`, `BillAdjustmentInput` from `@sas/shared`; `normalizeAmount` (Task 6); `VoucherView`, `PendingBill`, `SaveVoucherBody`, `UpdateVoucherBody` (Task 4).
- Produces (`vouchers/form.ts`):
  ```ts
  interface FormLine { key: string; ledgerId: string | null; side: Side; amount: string; narration: string; adjustments: BillAdjustmentInput[] }
  interface VoucherForm { kind: VoucherKind; bookId: string | null; date: string | null; narration: string; lines: FormLine[]; editing: { voucherId: string; version: number; voucherNo: number } | null }
  defaultSide(kind): Side            // receipt Cr, payment Dr, journal Dr
  newLine(kind, side?, amount?): FormLine
  emptyForm(kind, base: { bookId: string | null; date: string | null }): VoucherForm   // journal starts with a Dr and a Cr line, others with one line
  isBlank(line): boolean             // no account and no amount
  activeLines(form): FormLine[]
  totals(form): { debit: string; credit: string; difference: string; total: string }  // difference = debit - credit; total = debit + credit
  adjustedTotal(line): string        // sum of the line's bill adjustments
  onAccountOf(line): string          // line amount minus adjusted (what becomes on-account money)
  suggestNextLine(form): { side: Side; amount: string }   // journal: the side and amount that would balance it
  validateForm(form): string[]       // user-facing messages; empty when the form can be sent
  toSavePayload(form, ctx: { companyId: string; yearId: string }): SaveVoucherBody
  toUpdatePayload(form): UpdateVoucherBody      // throws if the form is not editing
  formFromVoucher(view: VoucherView): VoucherForm
  allocateOldestFirst(bills: PendingBill[], amount: string): { billId: string; amount: string }[]
  ```

- [ ] **Step 1: Write the failing test**

`packages/app/src/renderer/vouchers/form.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { PendingBill, VoucherView } from '../api/types';
import {
  activeLines,
  adjustedTotal,
  allocateOldestFirst,
  emptyForm,
  formFromVoucher,
  isBlank,
  newLine,
  onAccountOf,
  suggestNextLine,
  toSavePayload,
  toUpdatePayload,
  totals,
  validateForm,
  type VoucherForm,
} from './form';

const base = { bookId: 'b-cash', date: '2026-05-10' };

function filled(kind: 'receipt' | 'payment' | 'journal', lines: Partial<VoucherForm['lines'][number]>[]): VoucherForm {
  const f = emptyForm(kind, base);
  return { ...f, lines: lines.map((l) => ({ ...newLine(kind), ...l })) };
}

describe('emptyForm / newLine', () => {
  it('a receipt starts with one credit line, a payment with one debit line', () => {
    expect(emptyForm('receipt', base).lines.map((l) => l.side)).toEqual(['Cr']);
    expect(emptyForm('payment', base).lines.map((l) => l.side)).toEqual(['Dr']);
  });
  it('a journal starts with a debit line and a credit line', () => {
    expect(emptyForm('journal', base).lines.map((l) => l.side)).toEqual(['Dr', 'Cr']);
  });
  it('every line gets its own key', () => {
    const keys = emptyForm('journal', base).lines.map((l) => l.key);
    expect(new Set(keys).size).toBe(2);
  });
  it('keeps the book and the date it is given', () => {
    const f = emptyForm('receipt', base);
    expect(f.bookId).toBe('b-cash');
    expect(f.date).toBe('2026-05-10');
    expect(f.editing).toBeNull();
  });
});

describe('blank lines', () => {
  it('a line with no account and no amount is blank and ignored', () => {
    const f = filled('receipt', [{ ledgerId: 'l1', amount: '10.00' }, {}]);
    expect(isBlank(f.lines[1]!)).toBe(true);
    expect(activeLines(f)).toHaveLength(1);
  });
});

describe('totals', () => {
  it('adds debits and credits exactly and shows the difference', () => {
    const f = filled('journal', [
      { ledgerId: 'a', side: 'Dr', amount: '0.10' },
      { ledgerId: 'b', side: 'Dr', amount: '0.20' },
      { ledgerId: 'c', side: 'Cr', amount: '0.25' },
    ]);
    expect(totals(f)).toEqual({ debit: '0.30', credit: '0.25', difference: '0.05', total: '0.55' });
  });
  it('ignores amounts that are not yet readable', () => {
    const f = filled('receipt', [{ ledgerId: 'a', amount: '' }, { ledgerId: 'b', amount: '.' }]);
    expect(totals(f).total).toBe('0.00');
  });
});

describe('suggestNextLine', () => {
  it('a journal suggests the side and amount that would balance it', () => {
    const f = filled('journal', [{ ledgerId: 'a', side: 'Dr', amount: '100.00' }, { ledgerId: 'b', side: 'Cr', amount: '40.00' }]);
    expect(suggestNextLine(f)).toEqual({ side: 'Cr', amount: '60.00' });
    const g = filled('journal', [{ ledgerId: 'a', side: 'Cr', amount: '100.00' }]);
    expect(suggestNextLine(g)).toEqual({ side: 'Dr', amount: '100.00' });
  });
  it('a balanced journal suggests an empty debit line', () => {
    const f = filled('journal', [{ ledgerId: 'a', side: 'Dr', amount: '5.00' }, { ledgerId: 'b', side: 'Cr', amount: '5.00' }]);
    expect(suggestNextLine(f)).toEqual({ side: 'Dr', amount: '' });
  });
  it('receipts and payments always suggest their own side with no amount', () => {
    expect(suggestNextLine(emptyForm('receipt', base))).toEqual({ side: 'Cr', amount: '' });
    expect(suggestNextLine(emptyForm('payment', base))).toEqual({ side: 'Dr', amount: '' });
  });
});

describe('validateForm', () => {
  it('asks for the book, the date and at least one line', () => {
    const f = { ...emptyForm('receipt', { bookId: null, date: null }) };
    expect(validateForm(f)).toEqual([
      'Choose the cash or bank book',
      'Enter a valid voucher date',
      'Add at least one line',
    ]);
    expect(validateForm({ ...emptyForm('journal', { bookId: null, date: base.date }) })).toContain('Choose the journal book');
  });

  it('points at the line that is missing its account or amount', () => {
    const f = filled('receipt', [{ ledgerId: null, amount: '10.00' }, { ledgerId: 'l1', amount: '' }]);
    expect(validateForm(f)).toEqual(['Line 1: choose an account', 'Line 2: enter an amount']);
  });

  it('refuses a zero amount', () => {
    expect(validateForm(filled('receipt', [{ ledgerId: 'l1', amount: '0.00' }]))).toEqual(['Line 1: enter an amount']);
  });

  it('uses the shared rules for an unbalanced journal', () => {
    const f = filled('journal', [
      { ledgerId: 'a', side: 'Dr', amount: '100.00' },
      { ledgerId: 'b', side: 'Cr', amount: '90.00' },
    ]);
    expect(validateForm(f)).toEqual(['Debits 100.00 and credits 90.00 differ']);
  });

  it('wants at least two lines in a journal', () => {
    expect(validateForm(filled('journal', [{ ledgerId: 'a', side: 'Dr', amount: '1.00' }]))).toEqual(['A journal needs at least two lines']);
  });

  it('refuses bill adjustments that add up to more than the line', () => {
    const f = filled('receipt', [
      { ledgerId: 'l1', amount: '100.00', adjustments: [{ billId: 'x', amount: '150.00', kind: 'cash' }] },
    ]);
    expect(validateForm(f)).toEqual(['Line 1: the bills adjusted (150.00) are more than the amount']);
  });

  it('accepts a good receipt and a good journal', () => {
    expect(validateForm(filled('receipt', [{ ledgerId: 'l1', amount: '10.00' }]))).toEqual([]);
    expect(
      validateForm(
        filled('journal', [
          { ledgerId: 'a', side: 'Dr', amount: '10.00' },
          { ledgerId: 'b', side: 'Cr', amount: '10.00' },
        ]),
      ),
    ).toEqual([]);
  });

  it('skips blank lines', () => {
    const f = filled('receipt', [{ ledgerId: 'l1', amount: '10.00' }, {}, {}]);
    expect(validateForm(f)).toEqual([]);
  });
});

describe('adjustments on a line', () => {
  const line = { ...newLine('receipt'), ledgerId: 'l1', amount: '1000.00', adjustments: [{ billId: 'a', amount: '300.00', kind: 'cash' as const }, { billId: 'b', amount: '200.50', kind: 'discount' as const }] };
  it('adds them up and works out what is left on account', () => {
    expect(adjustedTotal(line)).toBe('500.50');
    expect(onAccountOf(line)).toBe('499.50');
    expect(onAccountOf({ ...line, adjustments: [] })).toBe('1000.00');
  });
});

describe('toSavePayload', () => {
  it('sends only filled lines, normalised amounts, and leaves out empty optional fields', () => {
    const f = filled('receipt', [
      { ledgerId: 'l1', amount: '5', narration: '', adjustments: [] },
      { ledgerId: 'l2', amount: '7.5', narration: 'cheque 123', adjustments: [{ billId: 'b1', amount: '7.50', kind: 'cash' }] },
      {},
    ]);
    expect(toSavePayload({ ...f, narration: '' }, { companyId: 'c1', yearId: 'y1' })).toEqual({
      companyId: 'c1',
      yearId: 'y1',
      bookId: 'b-cash',
      kind: 'receipt',
      date: '2026-05-10',
      lines: [
        { ledgerId: 'l1', side: 'Cr', amount: '5.00' },
        { ledgerId: 'l2', side: 'Cr', amount: '7.50', narration: 'cheque 123', adjustments: [{ billId: 'b1', amount: '7.50', kind: 'cash' }] },
      ],
    });
  });
  it('includes the voucher narration when there is one', () => {
    const f = { ...filled('journal', [{ ledgerId: 'a', side: 'Dr', amount: '1' }, { ledgerId: 'b', side: 'Cr', amount: '1' }]), narration: 'rent' };
    expect(toSavePayload(f, { companyId: 'c1', yearId: 'y1' }).narration).toBe('rent');
  });
});

const VIEW: VoucherView = {
  id: 'v1',
  companyId: 'c1',
  yearId: 'y1',
  bookId: 'b-cash',
  kind: 'receipt',
  voucherNo: 12,
  date: '2026-05-10',
  narration: 'part payment',
  version: 3,
  lines: [
    {
      lineNo: 1,
      ledgerId: 'l1',
      ledgerName: 'Ramesh Traders',
      side: 'Cr',
      amount: '300.00',
      narration: null,
      adjustments: [{ billId: 'b1', amount: '300.00', kind: 'cash' }],
    },
  ],
};

describe('formFromVoucher / toUpdatePayload', () => {
  it('loads a saved voucher into the form and remembers its version', () => {
    const f = formFromVoucher(VIEW);
    expect(f).toMatchObject({ kind: 'receipt', bookId: 'b-cash', date: '2026-05-10', narration: 'part payment' });
    expect(f.editing).toEqual({ voucherId: 'v1', version: 3, voucherNo: 12 });
    expect(f.lines).toHaveLength(1);
    expect(f.lines[0]).toMatchObject({ ledgerId: 'l1', side: 'Cr', amount: '300.00', narration: '', adjustments: [{ billId: 'b1', amount: '300.00', kind: 'cash' }] });
  });
  it('builds an update that carries the version', () => {
    const body = toUpdatePayload(formFromVoucher(VIEW));
    expect(body).toEqual({
      version: 3,
      date: '2026-05-10',
      narration: 'part payment',
      lines: [{ ledgerId: 'l1', side: 'Cr', amount: '300.00', adjustments: [{ billId: 'b1', amount: '300.00', kind: 'cash' }] }],
    });
  });
  it('refuses to build an update for a new voucher', () => {
    expect(() => toUpdatePayload(emptyForm('receipt', base))).toThrow();
  });
});

describe('allocateOldestFirst', () => {
  const bill = (id: string, billNo: string, billDate: string, pending: string): PendingBill => ({
    id,
    billNo,
    billDate,
    dueDate: null,
    side: 'Dr',
    original: pending,
    pending,
  });
  const bills = [bill('b3', 'S-3', '2026-06-01', '300.00'), bill('b1', 'S-1', '2026-04-01', '100.00'), bill('b2', 'S-2', '2026-05-01', '200.00')];

  it('fills the oldest bills first and stops when the money runs out', () => {
    expect(allocateOldestFirst(bills, '250.00')).toEqual([
      { billId: 'b1', amount: '100.00' },
      { billId: 'b2', amount: '150.00' },
    ]);
  });
  it('never allocates more than is pending', () => {
    expect(allocateOldestFirst(bills, '10000.00').map((a) => a.amount)).toEqual(['100.00', '200.00', '300.00']);
  });
  it('allocates nothing for no money, and skips settled bills', () => {
    expect(allocateOldestFirst(bills, '0.00')).toEqual([]);
    expect(allocateOldestFirst([bill('z', 'S-9', '2026-01-01', '0.00')], '50.00')).toEqual([]);
  });
  it('breaks ties on the bill number', () => {
    const tie = [bill('b', 'S-2', '2026-04-01', '10.00'), bill('a', 'S-1', '2026-04-01', '10.00')];
    expect(allocateOldestFirst(tie, '10.00')).toEqual([{ billId: 'a', amount: '10.00' }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/app/src/renderer/vouchers/form.test.ts`
Expected: FAIL — cannot find module `./form`.

- [ ] **Step 3: Write the implementation**

`packages/app/src/renderer/vouchers/form.ts`:
```ts
import {
  buildEntries,
  fromPaise,
  toPaise,
  VoucherError,
  type BillAdjustmentInput,
  type Side,
  type VoucherKind,
  type VoucherLineInput,
} from '@sas/shared';
import type { PendingBill, SaveVoucherBody, UpdateVoucherBody, VoucherLineBody, VoucherView } from '../api/types';
import { normalizeAmount } from '../ui/format';

export interface FormLine {
  key: string;
  ledgerId: string | null;
  side: Side;
  amount: string;
  narration: string;
  adjustments: BillAdjustmentInput[];
}

export interface VoucherForm {
  kind: VoucherKind;
  bookId: string | null;
  date: string | null;
  narration: string;
  lines: FormLine[];
  editing: { voucherId: string; version: number; voucherNo: number } | null;
}

let counter = 0;
const nextKey = () => `line-${++counter}`;

export function defaultSide(kind: VoucherKind): Side {
  return kind === 'receipt' ? 'Cr' : 'Dr';
}

export function newLine(kind: VoucherKind, side?: Side, amount = ''): FormLine {
  return { key: nextKey(), ledgerId: null, side: side ?? defaultSide(kind), amount, narration: '', adjustments: [] };
}

export function emptyForm(kind: VoucherKind, base: { bookId: string | null; date: string | null }): VoucherForm {
  return {
    kind,
    bookId: base.bookId,
    date: base.date,
    narration: '',
    lines: kind === 'journal' ? [newLine(kind, 'Dr'), newLine(kind, 'Cr')] : [newLine(kind)],
    editing: null,
  };
}

export const isBlank = (line: FormLine): boolean => !line.ledgerId && line.amount === '';
export const activeLines = (form: VoucherForm): FormLine[] => form.lines.filter((l) => !isBlank(l));

/** An amount typed so far, or 0 when it is not (yet) a readable number. */
function paise(amount: string): bigint {
  try {
    return toPaise(normalizeAmount(amount) || '0');
  } catch {
    return 0n;
  }
}

export interface Totals {
  debit: string;
  credit: string;
  difference: string;
  total: string;
}

export function totals(form: VoucherForm): Totals {
  let debit = 0n;
  let credit = 0n;
  for (const l of form.lines) {
    if (l.side === 'Dr') debit += paise(l.amount);
    else credit += paise(l.amount);
  }
  return { debit: fromPaise(debit), credit: fromPaise(credit), difference: fromPaise(debit - credit), total: fromPaise(debit + credit) };
}

export function adjustedTotal(line: FormLine): string {
  return fromPaise(line.adjustments.reduce((sum, a) => sum + paise(a.amount), 0n));
}

export function onAccountOf(line: FormLine): string {
  return fromPaise(paise(line.amount) - paise(adjustedTotal(line)));
}

/** What the next line should start with: in a journal, whatever would balance it. */
export function suggestNextLine(form: VoucherForm): { side: Side; amount: string } {
  if (form.kind !== 'journal') return { side: defaultSide(form.kind), amount: '' };
  const diff = paise(totals(form).difference);
  if (diff > 0n) return { side: 'Cr', amount: fromPaise(diff) };
  if (diff < 0n) return { side: 'Dr', amount: fromPaise(-diff) };
  return { side: 'Dr', amount: '' };
}

export function validateForm(form: VoucherForm): string[] {
  const problems: string[] = [];
  if (!form.bookId) problems.push(form.kind === 'journal' ? 'Choose the journal book' : 'Choose the cash or bank book');
  if (!form.date) problems.push('Enter a valid voucher date');

  const numbered = form.lines.map((line, i) => ({ line, n: i + 1 })).filter((x) => !isBlank(x.line));
  if (numbered.length === 0) {
    problems.push('Add at least one line');
    return problems;
  }
  for (const { line, n } of numbered) {
    if (!line.ledgerId) problems.push(`Line ${n}: choose an account`);
    if (paise(line.amount) <= 0n) problems.push(`Line ${n}: enter an amount`);
    else if (paise(adjustedTotal(line)) > paise(line.amount)) {
      problems.push(`Line ${n}: the bills adjusted (${adjustedTotal(line)}) are more than the amount`);
    }
  }
  if (problems.length > 0) return problems;

  // The same rules the server applies, for instant feedback (balanced journals, correct sides).
  try {
    const lines: VoucherLineInput[] = numbered.map(({ line }) => ({
      ledgerId: line.ledgerId!,
      side: line.side,
      amount: normalizeAmount(line.amount),
    }));
    buildEntries(form.kind, 'book', lines);
  } catch (e) {
    if (e instanceof VoucherError) problems.push(e.message);
    else throw e;
  }
  return problems;
}

function lineBodies(form: VoucherForm): VoucherLineBody[] {
  return activeLines(form).map((l) => ({
    ledgerId: l.ledgerId!,
    side: l.side,
    amount: normalizeAmount(l.amount),
    ...(l.narration.trim() ? { narration: l.narration.trim() } : {}),
    ...(l.adjustments.length > 0 ? { adjustments: l.adjustments } : {}),
  }));
}

export function toSavePayload(form: VoucherForm, ctx: { companyId: string; yearId: string }): SaveVoucherBody {
  return {
    companyId: ctx.companyId,
    yearId: ctx.yearId,
    bookId: form.bookId!,
    kind: form.kind,
    date: form.date!,
    ...(form.narration.trim() ? { narration: form.narration.trim() } : {}),
    lines: lineBodies(form),
  };
}

export function toUpdatePayload(form: VoucherForm): UpdateVoucherBody {
  if (!form.editing) throw new Error('This voucher has not been saved yet');
  return {
    version: form.editing.version,
    date: form.date!,
    ...(form.narration.trim() ? { narration: form.narration.trim() } : {}),
    lines: lineBodies(form),
  };
}

export function formFromVoucher(view: VoucherView): VoucherForm {
  return {
    kind: view.kind,
    bookId: view.bookId,
    date: view.date,
    narration: view.narration ?? '',
    lines: view.lines.map((l) => ({
      key: nextKey(),
      ledgerId: l.ledgerId,
      side: l.side,
      amount: l.amount,
      narration: l.narration ?? '',
      adjustments: l.adjustments,
    })),
    editing: { voucherId: view.id, version: view.version, voucherNo: view.voucherNo },
  };
}

/** Spread `amount` over the pending bills, oldest first, never more than a bill's pending amount. */
export function allocateOldestFirst(bills: PendingBill[], amount: string): { billId: string; amount: string }[] {
  let left = paise(amount);
  const out: { billId: string; amount: string }[] = [];
  const ordered = [...bills].sort((a, b) => a.billDate.localeCompare(b.billDate) || a.billNo.localeCompare(b.billNo));
  for (const bill of ordered) {
    if (left <= 0n) break;
    const pending = toPaise(bill.pending);
    if (pending <= 0n) continue;
    const take = left < pending ? left : pending;
    out.push({ billId: bill.id, amount: fromPaise(take) });
    left -= take;
  }
  return out;
}
```

- [ ] **Step 4: Run the tests and the type-check**

Run: `npx vitest run packages/app && npm run typecheck`
Expected: PASS — form (about 25 tests) and all earlier ones; no type errors. If the unbalanced-journal message differs, it comes from `@sas/shared` `buildEntries` (`Debits 100.00 and credits 90.00 differ`); keep the test aligned with that message rather than rewording it here.

- [ ] **Step 5: Commit**

```bash
git add packages/app
git commit -m "feat(app): voucher form logic — totals, validation, payloads and oldest-first bill allocation" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 9: Voucher entry screen (receipt, payment, journal) with the bills panel

**Files:**
- Create: `packages/app/src/renderer/ui/ConfirmDialog.tsx`
- Create: `packages/app/src/renderer/vouchers/BillAdjuster.tsx`, `vouchers/VoucherEntry.tsx`
- Modify: `packages/app/src/renderer/shell/screens.ts` (export `VOUCHER_KEYS`), `shell/Shell.tsx` (remount on new props), `shell/screenComponents.tsx`
- Test: `vouchers/BillAdjuster.test.tsx`, `vouchers/VoucherEntry.test.tsx`

**Interfaces:**
- Consumes: `VoucherForm` and helpers (Task 8); `Lookup`, `MoneyInput`, `DateInput`, `NavRoot`, `Dialog`, `Field` (Tasks 5–6); `useLookups` (Task 7); `useScreenShortcuts`, `useShortcuts`, `VOUCHER_KEYS` (Tasks 2–3); endpoints `saveVoucher`, `getVoucher`, `updateVoucher`, `deleteVoucher`, `pendingBills` (Task 4).
- Produces:
  - `<VoucherEntry kind editId? />` for `kind` `'receipt' | 'payment' | 'journal'`.
  - `<BillAdjuster companyId ledgerId ledgerName lineSide lineAmount current onDone(adjustments) onCancel />`.
  - `<ConfirmDialog title message confirmLabel cancelLabel? onConfirm onCancel />` (the confirm button has focus, so `Enter` confirms and `Esc` cancels).
  - `VOUCHER_KEYS` is now exported from `screens.ts`.

**Behaviour (what the tests pin down):**
- The screen waits for the lookup cache, then shows: Book, Date, Narration, then one row per line (Account, amount, line narration, Bills button) and a totals footer. A single cash/bank (or journal) book is chosen automatically and the cursor starts on **Date**; otherwise it starts on **Book**.
- Receipt and payment rows have one **Amount** box. Journal rows have **Debit** and **Credit** boxes; only the box on the line's side takes part in Enter-navigation, and typing in the other box switches the side.
- `Enter` moves along the fields. On the last field of the last line it adds a new line and puts the cursor on its Account (in a journal the new line is pre-filled with the amount and side that would balance it). It does nothing if that last line is still blank.
- `Ctrl+S` saves: it first commits the field being typed in, then checks the form with `validateForm`; problems are listed in an alert and nothing is sent. On success a new voucher shows "Saved as voucher no. N", clears the lines (book and date stay) and puts the cursor on the first Account. An existing voucher shows "Voucher no. N updated" and reloads (new version).
- `Ctrl+B` opens the bills panel for the current line (needs an account and an amount). `Alt+A` fills the amounts from the oldest bill; `Ctrl+Enter` (or `Enter` on the last bill) accepts; `Esc` cancels. The panel refuses a bill amount above its pending amount and a total above the line amount.
- `Ctrl+Del` deletes the current line (the last remaining line is cleared instead). `Ctrl+N` starts a new voucher (when editing it opens a fresh screen). `Ctrl+D` on an existing voucher asks for confirmation, then deletes it and goes back.
- A server error is shown as is. A `STALE_VERSION` answer also offers a "Reload voucher" button.

- [ ] **Step 1: Write the failing tests**

`packages/app/src/renderer/vouchers/BillAdjuster.test.tsx`:
```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PendingBill } from '../api/types';
import { renderScreen } from '../testing/render';
import { BillAdjuster } from './BillAdjuster';

const bill = (id: string, billNo: string, billDate: string, pending: string, side: 'Dr' | 'Cr' = 'Dr'): PendingBill => ({
  id,
  billNo,
  billDate,
  dueDate: null,
  side,
  original: pending,
  pending,
});
const BILLS = [bill('b2', 'S-2', '2026-05-01', '400.00'), bill('b1', 'S-1', '2026-04-01', '300.00'), bill('bx', 'P-1', '2026-04-15', '999.00', 'Cr')];

function setup(props: Partial<React.ComponentProps<typeof BillAdjuster>> = {}) {
  const onDone = vi.fn();
  const onCancel = vi.fn();
  const utils = renderScreen(
    <BillAdjuster
      companyId="c1"
      ledgerId="l-ramesh"
      ledgerName="Ramesh Traders"
      lineSide="Cr"
      lineAmount="500.00"
      current={[]}
      onDone={onDone}
      onCancel={onCancel}
      {...props}
    />,
    { routes: [{ method: 'GET', path: '/api/companies/c1/ledgers/l-ramesh/pending-bills', reply: () => BILLS }] },
  );
  return { onDone, onCancel, ...utils };
}

describe('BillAdjuster', () => {
  it('lists only the bills this line can settle (opposite side), oldest first', async () => {
    setup();
    expect(await screen.findByRole('dialog', { name: 'Bills of Ramesh Traders' })).toBeInTheDocument();
    await screen.findByLabelText('Amount for bill S-1');
    expect(screen.queryByLabelText('Amount for bill P-1')).toBeNull(); // a credit bill cannot be settled by a credit line
    const inputs = screen.getAllByLabelText(/^Amount for bill/).map((i) => i.getAttribute('aria-label'));
    expect(inputs).toEqual(['Amount for bill S-1', 'Amount for bill S-2']);
  });

  it('starts from the adjustments already chosen', async () => {
    setup({ current: [{ billId: 'b2', amount: '120.00', kind: 'discount' }] });
    expect(await screen.findByLabelText('Amount for bill S-2')).toHaveValue('120.00');
    expect(screen.getByLabelText('Type for bill S-2')).toHaveValue('discount');
  });

  it('Alt+A fills the amounts from the oldest bill and shows the rest as on account', async () => {
    const user = userEvent.setup();
    setup({ lineAmount: '500.00' });
    await screen.findByLabelText('Amount for bill S-1');
    await user.keyboard('{Alt>}a{/Alt}');
    expect(screen.getByLabelText('Amount for bill S-1')).toHaveValue('300.00');
    expect(screen.getByLabelText('Amount for bill S-2')).toHaveValue('200.00');
    expect(screen.getByText(/On account 0\.00/)).toBeInTheDocument();
  });

  it('Ctrl+Enter accepts the amounts, with their types', async () => {
    const user = userEvent.setup();
    const { onDone } = setup({ lineAmount: '500.00' });
    await screen.findByLabelText('Amount for bill S-1');
    await user.keyboard('{Alt>}a{/Alt}');
    await user.selectOptions(screen.getByLabelText('Type for bill S-2'), 'discount');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(onDone).toHaveBeenCalledWith([
      { billId: 'b1', amount: '300.00', kind: 'cash' },
      { billId: 'b2', amount: '200.00', kind: 'discount' },
    ]);
  });

  it('Enter on the last bill accepts too', async () => {
    const user = userEvent.setup();
    const { onDone } = setup({ lineAmount: '500.00' });
    await user.type(await screen.findByLabelText('Amount for bill S-1'), '100{Enter}');
    await user.keyboard('50{Enter}');
    expect(onDone).toHaveBeenCalledWith([
      { billId: 'b1', amount: '100.00', kind: 'cash' },
      { billId: 'b2', amount: '50.00', kind: 'cash' },
    ]);
  });

  it('refuses more than a bill\'s pending amount', async () => {
    const user = userEvent.setup();
    const { onDone } = setup({ lineAmount: '900.00' });
    await user.type(await screen.findByLabelText('Amount for bill S-1'), '400');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(screen.getByRole('alert')).toHaveTextContent('Bill S-1: more than the pending 300.00');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('refuses a total above the line amount', async () => {
    const user = userEvent.setup();
    const { onDone } = setup({ lineAmount: '100.00' });
    await user.type(await screen.findByLabelText('Amount for bill S-1'), '300');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(screen.getByRole('alert')).toHaveTextContent(/more than the line amount/i);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('Esc cancels without changing anything', async () => {
    const user = userEvent.setup();
    const { onCancel, onDone } = setup();
    await screen.findByLabelText('Amount for bill S-1');
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('shows the credit bill to a debit line, and not the debit bills', async () => {
    setup({ lineSide: 'Dr' });
    expect(await screen.findByLabelText('Amount for bill P-1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Amount for bill S-1')).toBeNull();
  });

  it('says so when the account has no bills to settle', async () => {
    renderScreen(
      <BillAdjuster companyId="c1" ledgerId="l-ramesh" ledgerName="Ramesh Traders" lineSide="Cr" lineAmount="10.00" current={[]} onDone={() => {}} onCancel={() => {}} />,
      { routes: [{ method: 'GET', path: '/api/companies/c1/ledgers/l-ramesh/pending-bills', reply: () => [] }] },
    );
    expect(await screen.findByText(/no pending bills/i)).toBeInTheDocument();
  });
});
```

`packages/app/src/renderer/vouchers/VoucherEntry.test.tsx`:
```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import type { PendingBill, VoucherView } from '../api/types';
import type { FakeRoute } from '../testing/fakeClient';
import { renderScreen } from '../testing/render';
import { VoucherEntry } from './VoucherEntry';

const BILLS: PendingBill[] = [
  { id: 'b1', billNo: 'S-1', billDate: '2026-04-01', dueDate: null, side: 'Dr', original: '300.00', pending: '300.00' },
  { id: 'b2', billNo: 'S-2', billDate: '2026-05-01', dueDate: null, side: 'Dr', original: '400.00', pending: '400.00' },
];

function serverRoutes() {
  const saved: any[] = [];
  const routes: FakeRoute[] = [
    {
      method: 'POST',
      path: '/api/vouchers',
      reply: ({ body }) => {
        saved.push(body);
        return { voucherId: `v${saved.length}`, voucherNo: saved.length };
      },
    },
    { method: 'GET', path: '/api/companies/c1/ledgers/l-ramesh/pending-bills', reply: () => BILLS },
  ];
  return { saved, routes };
}

const account = (n: number) => screen.getByRole('combobox', { name: `Account line ${n}` });

/** Date, then Enter through Narration to the first account. */
async function fillDate(user: ReturnType<typeof userEvent.setup>, date = '12052026') {
  await screen.findByRole('combobox', { name: 'Book' });
  await user.keyboard(`${date}{Enter}{Enter}`); // the cursor starts on Date; Enter commits it, Enter skips the narration
}

describe('receipt', () => {
  it('can be entered and saved with the keyboard alone', async () => {
    const user = userEvent.setup();
    const { saved, routes } = serverRoutes();
    renderScreen(<VoucherEntry kind="receipt" />, { routes });
    await fillDate(user);
    await user.keyboard('ram{Enter}1000{Enter}{Enter}'); // account, amount, line narration -> a second (blank) line appears
    expect(account(2)).toHaveFocus();
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('status')).toHaveTextContent('Saved as voucher no. 1');
    expect(saved).toEqual([
      {
        companyId: 'c1',
        yearId: 'y1',
        bookId: 'b-cash',
        kind: 'receipt',
        date: '2026-05-12',
        lines: [{ ledgerId: 'l-ramesh', side: 'Cr', amount: '1000.00' }],
      },
    ]);
    // ready for the next voucher: lines cleared, book and date kept, cursor on the first account
    expect(account(1)).toHaveValue('');
    expect(account(1)).toHaveFocus();
    expect(screen.getByLabelText('Date')).toHaveValue('12-05-2026');
  });

  it('commits a date that is still being typed when Ctrl+S is pressed', async () => {
    const user = userEvent.setup();
    const { saved, routes } = serverRoutes();
    renderScreen(<VoucherEntry kind="receipt" />, { routes });
    await screen.findByRole('combobox', { name: 'Book' });
    await user.keyboard('13052026'); // not committed with Enter
    await user.keyboard('{Control>}s{/Control}'); // missing account, so nothing is saved ...
    expect(await screen.findByRole('alert')).toHaveTextContent('Add at least one line');
    expect(screen.getByLabelText('Date')).toHaveValue('13-05-2026'); // ... but the date was committed
    expect(saved).toHaveLength(0);
  });

  it('lists the problems and sends nothing when the form is not complete', async () => {
    const user = userEvent.setup();
    const { saved, routes } = serverRoutes();
    renderScreen(<VoucherEntry kind="receipt" />, { routes });
    await fillDate(user);
    await user.keyboard('ram{Enter}'); // account chosen, amount missing
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Line 1: enter an amount');
    expect(saved).toHaveLength(0);
  });

  it('shows the server\'s message when the save is refused', async () => {
    const user = userEvent.setup();
    const { routes } = serverRoutes();
    renderScreen(<VoucherEntry kind="receipt" />, {
      routes: [
        {
          method: 'POST',
          path: '/api/vouchers',
          reply: () => {
            throw new ApiError(422, 'PERIOD_FROZEN', 'Entries on or before 2026-06-30 are frozen');
          },
        },
        ...routes,
      ],
    });
    await fillDate(user);
    await user.keyboard('ram{Enter}50{Enter}');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Entries on or before 2026-06-30 are frozen');
  });

  it('Enter on a blank last line does not add another line', async () => {
    const user = userEvent.setup();
    renderScreen(<VoucherEntry kind="receipt" />, { routes: serverRoutes().routes });
    await fillDate(user);
    await screen.findByRole('combobox', { name: 'Account line 1' });
    await user.keyboard('{Enter}'); // nothing typed: Lookup with no text and no pick lets Enter through to the next field
    await user.keyboard('{Enter}{Enter}');
    expect(screen.queryByRole('combobox', { name: 'Account line 2' })).toBeNull();
  });

  it('Ctrl+Del removes the current line, and clears the only line instead of removing it', async () => {
    const user = userEvent.setup();
    renderScreen(<VoucherEntry kind="receipt" />, { routes: serverRoutes().routes });
    await fillDate(user);
    await user.keyboard('ram{Enter}10{Enter}{Enter}');
    await user.keyboard('suresh{Enter}20{Enter}'); // line 2 filled
    expect(account(2)).toHaveValue('Suresh Textiles');
    await user.keyboard('{Control>}{Delete}{/Control}');
    expect(screen.queryByRole('combobox', { name: 'Account line 2' })).toBeNull();
    await user.keyboard('{Control>}{Delete}{/Control}');
    expect(account(1)).toHaveValue('');
  });
});

describe('journal', () => {
  async function fillJournal(user: ReturnType<typeof userEvent.setup>) {
    await fillDate(user);
    await user.keyboard('ram{Enter}100{Enter}{Enter}'); // line 1: debit 100; then line narration; Enter moves to line 2
    await user.keyboard('cash{Enter}90'); // line 2: credit 90 (the credit box is the one in Enter-navigation for a credit line)
  }

  it('refuses an unbalanced journal, then saves once it balances', async () => {
    const user = userEvent.setup();
    const { saved, routes } = serverRoutes();
    renderScreen(<VoucherEntry kind="journal" />, { routes });
    await fillJournal(user);
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Debits 100.00 and credits 90.00 differ');
    expect(saved).toHaveLength(0);

    const credit = screen.getByLabelText('Credit line 2');
    await user.clear(credit);
    await user.type(credit, '100');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('status')).toHaveTextContent('Saved as voucher no. 1');
    expect(saved[0]).toMatchObject({
      kind: 'journal',
      bookId: 'b-jv',
      lines: [
        { ledgerId: 'l-ramesh', side: 'Dr', amount: '100.00' },
        { ledgerId: 'l-cash', side: 'Cr', amount: '100.00' },
      ],
    });
  });

  it('a new line is pre-filled with the amount and side that would balance the voucher', async () => {
    const user = userEvent.setup();
    renderScreen(<VoucherEntry kind="journal" />, { routes: serverRoutes().routes });
    await fillJournal(user);
    await user.keyboard('{Enter}{Enter}'); // credit 90 -> line narration -> last field: add a line
    expect(account(3)).toHaveFocus();
    expect(screen.getByLabelText('Credit line 3')).toHaveValue('10.00'); // debits 100, credits 90: 10 more credit balances it
  });

  it('typing in the other column switches the side of the line', async () => {
    const user = userEvent.setup();
    renderScreen(<VoucherEntry kind="journal" />, { routes: serverRoutes().routes });
    await fillDate(user);
    await user.keyboard('ram{Enter}');
    const debit = screen.getByLabelText('Debit line 1');
    const credit = screen.getByLabelText('Credit line 1');
    await user.type(debit, '40');
    expect(debit).toHaveValue('40');
    await user.type(credit, '7');
    expect(credit).toHaveValue('7');
    expect(debit).toHaveValue('');
  });
});

describe('bills', () => {
  it('Ctrl+B opens the bills of the account; the adjustments go into the saved voucher', async () => {
    const user = userEvent.setup();
    const { saved, routes } = serverRoutes();
    renderScreen(<VoucherEntry kind="receipt" />, { routes });
    await fillDate(user);
    await user.keyboard('ram{Enter}500{Control>}b{/Control}');
    const panel = await screen.findByRole('dialog', { name: 'Bills of Ramesh Traders' });
    await within(panel).findByLabelText('Amount for bill S-1');
    await user.keyboard('{Alt>}a{/Alt}{Control>}{Enter}{/Control}');
    expect(screen.queryByRole('dialog', { name: /Bills of/ })).toBeNull();
    await user.keyboard('{Control>}s{/Control}');
    await screen.findByRole('status');
    expect(saved[0].lines[0].adjustments).toEqual([
      { billId: 'b1', amount: '300.00', kind: 'cash' },
      { billId: 'b2', amount: '200.00', kind: 'cash' },
    ]);
  });

  it('asks for the account and the amount first', async () => {
    const user = userEvent.setup();
    renderScreen(<VoucherEntry kind="receipt" />, { routes: serverRoutes().routes });
    await fillDate(user);
    await user.keyboard('{Control>}b{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent(/choose the account first/i);
    await user.keyboard('ram{Enter}');
    await user.keyboard('{Control>}b{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent(/enter the amount first/i);
  });

  it('changing the account of a line drops its bill adjustments', async () => {
    const user = userEvent.setup();
    const { saved, routes } = serverRoutes();
    renderScreen(<VoucherEntry kind="receipt" />, { routes });
    await fillDate(user);
    await user.keyboard('ram{Enter}300{Control>}b{/Control}');
    await screen.findByLabelText('Amount for bill S-1');
    await user.keyboard('{Alt>}a{/Alt}{Control>}{Enter}{/Control}');
    await user.click(account(1));
    await user.keyboard('suresh{Enter}');
    await user.keyboard('{Control>}s{/Control}');
    await screen.findByRole('status');
    expect(saved[0].lines[0]).toEqual({ ledgerId: 'l-suresh', side: 'Cr', amount: '300.00' });
  });
});

describe('editing an existing voucher', () => {
  const VIEW = (version: number, amount = '300.00'): VoucherView => ({
    id: 'v1',
    companyId: 'c1',
    yearId: 'y1',
    bookId: 'b-cash',
    kind: 'receipt',
    voucherNo: 12,
    date: '2026-05-10',
    narration: null,
    version,
    lines: [{ lineNo: 1, ledgerId: 'l-ramesh', ledgerName: 'Ramesh Traders', side: 'Cr', amount, narration: null, adjustments: [] }],
  });

  function editRoutes(opts: { putError?: ApiError } = {}) {
    let version = 3;
    let amount = '300.00';
    const puts: any[] = [];
    const deletes: string[] = [];
    const routes: FakeRoute[] = [
      { method: 'GET', path: '/api/vouchers/v1', reply: () => VIEW(version, amount) },
      {
        method: 'PUT',
        path: '/api/vouchers/v1',
        reply: ({ body }) => {
          if (opts.putError) throw opts.putError;
          puts.push(body);
          version += 1;
          amount = body.lines[0].amount;
          return { version };
        },
      },
      {
        method: 'DELETE',
        path: '/api/vouchers/v1',
        reply: ({ query }) => {
          deletes.push(query.get('version')!);
          return undefined;
        },
      },
    ];
    return { routes, puts, deletes };
  }

  it('loads the voucher, sends its version on save, and reloads the new one', async () => {
    const user = userEvent.setup();
    const { routes, puts } = editRoutes();
    renderScreen(<VoucherEntry kind="receipt" editId="v1" />, { routes });
    expect(await screen.findByRole('heading', { name: /Cash \/ Bank Receipt — no\. 12/ })).toBeInTheDocument();
    expect(account(1)).toHaveValue('Ramesh Traders');
    expect(screen.getByRole('combobox', { name: 'Book' })).toBeDisabled();
    const amount = screen.getByLabelText('Amount line 1');
    await user.clear(amount);
    await user.type(amount, '450');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('status')).toHaveTextContent('Voucher no. 12 updated');
    expect(puts).toEqual([{ version: 3, date: '2026-05-10', lines: [{ ledgerId: 'l-ramesh', side: 'Cr', amount: '450.00' }] }]);
    expect(screen.getByLabelText('Amount line 1')).toHaveValue('450.00');
  });

  it('offers to reload when someone else changed the voucher', async () => {
    const user = userEvent.setup();
    const { routes } = editRoutes({ putError: new ApiError(409, 'STALE_VERSION', 'This voucher was changed by someone else. Reload and try again.') });
    const { api } = renderScreen(<VoucherEntry kind="receipt" editId="v1" />, { routes });
    await screen.findByRole('heading', { name: /no\. 12/ });
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent('changed by someone else');
    const gets = () => api.calls.filter((c) => c.method === 'GET' && c.path === '/api/vouchers/v1').length;
    expect(gets()).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Reload voucher' }));
    await waitFor(() => expect(gets()).toBe(2));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Ctrl+D asks first; confirming deletes with the version and goes back', async () => {
    const user = userEvent.setup();
    const { routes, deletes } = editRoutes();
    const { navCalls } = renderScreen(<VoucherEntry kind="receipt" editId="v1" />, { routes });
    await screen.findByRole('heading', { name: /no\. 12/ });
    await user.keyboard('{Control>}d{/Control}');
    expect(await screen.findByRole('dialog', { name: 'Delete voucher' })).toBeInTheDocument();
    expect(deletes).toEqual([]);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(deletes).toEqual(['3']));
    await waitFor(() => expect(navCalls).toContain('back'));
  });

  it('Esc in the delete question keeps the voucher', async () => {
    const user = userEvent.setup();
    const { routes, deletes } = editRoutes();
    renderScreen(<VoucherEntry kind="receipt" editId="v1" />, { routes });
    await screen.findByRole('heading', { name: /no\. 12/ });
    await user.keyboard('{Control>}d{/Control}{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Delete voucher' })).toBeNull();
    expect(deletes).toEqual([]);
  });

  it('Ctrl+D does nothing on a new voucher; Ctrl+N on an existing one opens a fresh screen', async () => {
    const user = userEvent.setup();
    const { routes } = editRoutes();
    const fresh = renderScreen(<VoucherEntry kind="receipt" />, { routes });
    await screen.findByRole('combobox', { name: 'Book' });
    await user.keyboard('{Control>}d{/Control}');
    expect(screen.queryByRole('dialog', { name: 'Delete voucher' })).toBeNull();
    fresh.unmount();

    const edit = renderScreen(<VoucherEntry kind="receipt" editId="v1" />, { routes });
    await screen.findByRole('heading', { name: /no\. 12/ });
    await user.keyboard('{Control>}n{/Control}');
    expect(edit.navCalls).toContain('open:receipt');
  });

  it('shows a message when the voucher cannot be loaded', async () => {
    renderScreen(<VoucherEntry kind="receipt" editId="gone" />, {
      routes: [
        {
          method: 'GET',
          path: '/api/vouchers/gone',
          reply: () => {
            throw new ApiError(404, 'NOT_FOUND', 'Voucher not found');
          },
        },
      ],
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Voucher not found');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/app/src/renderer/vouchers/BillAdjuster.test.tsx packages/app/src/renderer/vouchers/VoucherEntry.test.tsx`
Expected: FAIL — cannot find modules `./BillAdjuster`, `./VoucherEntry`.

- [ ] **Step 3: Small edits to existing files**

In `packages/app/src/renderer/shell/screens.ts` change `const VOUCHER_KEYS: ShortcutDecl[] = [` to `export const VOUCHER_KEYS: ShortcutDecl[] = [`.

In `packages/app/src/renderer/shell/Shell.tsx` make the screen remount when it is opened with different props (so "open this voucher" and "new voucher" start clean):
```tsx
            <Screen key={`${current.id}:${current.props ? JSON.stringify(current.props) : ''}`} {...(current.props ?? {})} />
```

In `packages/app/src/renderer/shell/screenComponents.tsx` add imports and entries:
```tsx
import { VoucherEntry } from '../vouchers/VoucherEntry';

const Receipt = (p: { editId?: string }) => <VoucherEntry kind="receipt" editId={p.editId} />;
const Payment = (p: { editId?: string }) => <VoucherEntry kind="payment" editId={p.editId} />;
const Journal = (p: { editId?: string }) => <VoucherEntry kind="journal" editId={p.editId} />;

export const SCREEN_COMPONENTS: Record<ScreenId, ComponentType<any>> = {
  ...placeholders,
  home: Home,
  help: Help,
  receipt: Receipt,
  payment: Payment,
  journal: Journal,
};
```

- [ ] **Step 4: Write the components**

`packages/app/src/renderer/ui/ConfirmDialog.tsx`:
```tsx
import { Dialog } from './Dialog';

/** A yes/no question. The confirm button has focus, so Enter confirms and Esc cancels. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog title={title} onClose={onCancel}>
      <p>{message}</p>
      <button className="primary" onClick={onConfirm}>
        {confirmLabel}
      </button>{' '}
      <button onClick={onCancel}>{cancelLabel}</button>
    </Dialog>
  );
}
```

`packages/app/src/renderer/vouchers/BillAdjuster.tsx`:
```tsx
import { useEffect, useMemo, useState } from 'react';
import { ADJUSTMENT_KINDS, fromPaise, toPaise, type AdjustmentKind, type BillAdjustmentInput, type Side } from '@sas/shared';
import { pendingBills } from '../api/endpoints';
import type { PendingBill } from '../api/types';
import { useShortcuts } from '../keys/useShortcuts';
import { useApi } from '../session/deps';
import { VOUCHER_KEYS } from '../shell/screens';
import { Dialog } from '../ui/Dialog';
import { formatInr, normalizeAmount } from '../ui/format';
import { formatDisplay } from '../ui/dates';
import { MoneyInput } from '../ui/MoneyInput';
import { NavRoot } from '../ui/NavRoot';
import { allocateOldestFirst } from './form';

const KIND_LABELS: Record<AdjustmentKind, string> = {
  cash: 'Cash / bank',
  discount: 'Discount',
  rd: 'Rate difference',
  rg: 'Goods returned',
  claim: 'Claim',
  bc: 'Bank charges',
  interest: 'Interest',
  close: 'Close bill',
};

interface Row {
  amount: string;
  kind: AdjustmentKind;
}

const paise = (text: string): bigint => {
  try {
    return toPaise(normalizeAmount(text) || '0');
  } catch {
    return 0n;
  }
};

/** Match one voucher line to the party's pending bills. */
export function BillAdjuster(props: {
  companyId: string;
  ledgerId: string;
  ledgerName: string;
  lineSide: Side;
  lineAmount: string;
  current: BillAdjustmentInput[];
  onDone: (adjustments: BillAdjustmentInput[]) => void;
  onCancel: () => void;
}) {
  const { companyId, ledgerId, ledgerName, lineSide, lineAmount, current, onDone, onCancel } = props;
  const api = useApi();
  const [bills, setBills] = useState<PendingBill[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(current.map((a) => [a.billId, { amount: a.amount, kind: a.kind }])),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    pendingBills(api, companyId, ledgerId)
      .then((all) => alive && setBills(all.filter((b) => b.side !== lineSide).sort((a, b) => a.billDate.localeCompare(b.billDate) || a.billNo.localeCompare(b.billNo))))
      .catch((e) => alive && setLoadError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [api, companyId, ledgerId, lineSide]);

  const adjusted = useMemo(() => Object.values(rows).reduce((sum, r) => sum + paise(r.amount), 0n), [rows]);
  const onAccount = paise(lineAmount) - adjusted;

  function autoFill() {
    if (!bills) return;
    const alloc = allocateOldestFirst(bills, lineAmount);
    setRows(Object.fromEntries(alloc.map((a) => [a.billId, { amount: a.amount, kind: 'cash' as AdjustmentKind }])));
    setError(null);
  }

  function done() {
    if (!bills) return;
    const chosen: BillAdjustmentInput[] = [];
    for (const bill of bills) {
      const row = rows[bill.id];
      if (!row || paise(row.amount) <= 0n) continue;
      if (paise(row.amount) > toPaise(bill.pending)) {
        setError(`Bill ${bill.billNo}: more than the pending ${bill.pending}`);
        return;
      }
      chosen.push({ billId: bill.id, amount: normalizeAmount(row.amount), kind: row.kind });
    }
    if (adjusted > paise(lineAmount)) {
      setError(`The bills add up to ${formatInr(fromPaise(adjusted))}, more than the line amount ${formatInr(lineAmount)}`);
      return;
    }
    onDone(chosen);
  }

  useShortcuts(VOUCHER_KEYS, { autoAllocate: autoFill, billsDone: done });

  return (
    <Dialog title={`Bills of ${ledgerName}`} onClose={onCancel} width={760}>
      {loadError && <p className="err" role="alert">{loadError}</p>}
      {!bills && !loadError && <p>Loading bills…</p>}
      {bills && bills.length === 0 && <p>This account has no pending bills to settle with this line.</p>}
      {bills && bills.length > 0 && (
        <NavRoot onLast={done}>
          <table className="data">
            <thead>
              <tr>
                <th>Bill</th>
                <th>Date</th>
                <th className="num">Pending</th>
                <th className="num">Amount</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id}>
                  <td>{b.billNo}</td>
                  <td>{formatDisplay(b.billDate)}</td>
                  <td className="num">{formatInr(b.pending)}</td>
                  <td className="num">
                    <MoneyInput
                      label={`Amount for bill ${b.billNo}`}
                      value={rows[b.id]?.amount ?? ''}
                      onChange={(v) => setRows((r) => ({ ...r, [b.id]: { kind: r[b.id]?.kind ?? 'cash', amount: v } }))}
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`Type for bill ${b.billNo}`}
                      value={rows[b.id]?.kind ?? 'cash'}
                      onChange={(e) => setRows((r) => ({ ...r, [b.id]: { amount: r[b.id]?.amount ?? '', kind: e.target.value as AdjustmentKind } }))}
                    >
                      {ADJUSTMENT_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </NavRoot>
      )}
      <p>
        Line amount {formatInr(lineAmount)} · Adjusted {formatInr(fromPaise(adjusted))} · On account {formatInr(fromPaise(onAccount))}
      </p>
      {error && <p className="err" role="alert">{error}</p>}
      <p>
        <button onClick={autoFill}>
          Fill from oldest <kbd>Alt+A</kbd>
        </button>{' '}
        <button className="primary" onClick={done}>
          Done <kbd>Ctrl+Enter</kbd>
        </button>{' '}
        <button onClick={onCancel}>Cancel</button>
      </p>
    </Dialog>
  );
}
```

`packages/app/src/renderer/vouchers/VoucherEntry.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { toPaise, type VoucherKind } from '@sas/shared';
import { ApiError } from '../api/client';
import { deleteVoucher, getVoucher, saveVoucher, updateVoucher } from '../api/endpoints';
import { useScreenShortcuts } from '../keys/useScreenShortcuts';
import { useApi } from '../session/deps';
import { useLookups } from '../session/Lookups';
import { useSession } from '../session/Session';
import { useNav } from '../shell/nav';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { clampToYear, todayIso, type DateCtx } from '../ui/dates';
import { DateInput } from '../ui/DateInput';
import { Field } from '../ui/Field';
import { formatInr, normalizeAmount } from '../ui/format';
import { Lookup } from '../ui/Lookup';
import { MoneyInput } from '../ui/MoneyInput';
import { NavRoot } from '../ui/NavRoot';
import { BillAdjuster } from './BillAdjuster';
import {
  emptyForm,
  formFromVoucher,
  isBlank,
  newLine,
  onAccountOf,
  suggestNextLine,
  toSavePayload,
  toUpdatePayload,
  totals,
  validateForm,
  type FormLine,
  type VoucherForm,
} from './form';

const TITLES: Record<VoucherKind, string> = {
  receipt: 'Cash / Bank Receipt',
  payment: 'Cash / Bank Payment',
  journal: 'Journal Voucher',
};

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function VoucherEntry({ kind, editId }: { kind: VoucherKind; editId?: string }) {
  const session = useSession();
  const lookups = useLookups();
  if (!session.company || !session.year) return <p className="panel">Choose a company and year first (F9).</p>;
  if (lookups.loading) return <p className="panel">Loading accounts…</p>;
  return <VoucherEditor kind={kind} editId={editId} companyId={session.company.id} yearId={session.year.id} yearStart={session.year.startDate} yearEnd={session.year.endDate} />;
}

function VoucherEditor(props: { kind: VoucherKind; editId?: string; companyId: string; yearId: string; yearStart: string; yearEnd: string }) {
  const { kind, editId, companyId, yearId, yearStart, yearEnd } = props;
  const api = useApi();
  const lookups = useLookups();
  const nav = useNav();

  const ctx: DateCtx = { yearStart, yearEnd, base: clampToYear(todayIso(), yearStart, yearEnd) };
  const books = lookups.booksFor(kind);
  const startOnBook = useRef(books.length !== 1 && !editId).current;

  const [form, setForm] = useState<VoucherForm>(() =>
    emptyForm(kind, { bookId: books.length === 1 ? books[0]!.id : null, date: ctx.base }),
  );
  const [loading, setLoading] = useState(!!editId);
  const [problems, setProblems] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [billsKey, setBillsKey] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveTick, setSaveTick] = useState(0);
  const lastFocus = useRef<HTMLElement | null>(null);

  // ---- loading an existing voucher
  async function load(id: string) {
    try {
      setForm(formFromVoucher(await getVoucher(api, id)));
      setProblems([]);
      setStale(false);
    } catch (e) {
      setProblems([messageOf(e)]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (editId) void load(editId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // ---- put the cursor on a line's account after the form has re-rendered
  useEffect(() => {
    if (!focusKey) return;
    document.querySelector<HTMLElement>(`[data-line="${focusKey}"][data-field="account"]`)?.focus();
    setFocusKey(null);
  }, [focusKey, form.lines]);

  const setLine = (key: string, patch: Partial<FormLine>) =>
    setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));

  function addLine() {
    const last = form.lines[form.lines.length - 1];
    if (last && isBlank(last)) return;
    const s = suggestNextLine(form);
    const line = newLine(kind, s.side, s.amount);
    setForm((f) => ({ ...f, lines: [...f.lines, line] }));
    setFocusKey(line.key);
  }

  function deleteLine() {
    const key = currentKey ?? form.lines[form.lines.length - 1]?.key;
    if (!key) return;
    if (form.lines.length === 1) {
      const fresh = newLine(kind);
      setForm((f) => ({ ...f, lines: [fresh] }));
      setFocusKey(fresh.key);
      return;
    }
    const idx = form.lines.findIndex((l) => l.key === key);
    const remaining = form.lines.filter((l) => l.key !== key);
    setForm((f) => ({ ...f, lines: remaining }));
    setCurrentKey(null);
    setFocusKey(remaining[Math.max(0, idx - 1)]!.key);
  }

  function newVoucher() {
    if (form.editing) {
      nav.open(kind);
      return;
    }
    const next = emptyForm(kind, { bookId: form.bookId, date: form.date });
    setForm(next);
    setProblems([]);
    setStatus(null);
    setFocusKey(next.lines[0]!.key);
  }

  function openBills(key?: string) {
    const wanted = key ?? currentKey;
    const line = form.lines.find((l) => l.key === wanted) ?? form.lines[form.lines.length - 1];
    if (!line || !line.ledgerId) {
      setProblems(['Choose the account first, then press Ctrl+B for its bills']);
      return;
    }
    let positive = false;
    try {
      positive = toPaise(normalizeAmount(line.amount) || '0') > 0n;
    } catch {
      positive = false;
    }
    if (!positive) {
      setProblems(['Enter the amount first, then press Ctrl+B for its bills']);
      return;
    }
    setProblems([]);
    setBillsKey(line.key);
  }

  // ---- saving. Ctrl+S first leaves the field being typed in, so a date or amount that is still
  // uncommitted is part of the form when it is checked.
  function requestSave() {
    lastFocus.current = document.activeElement as HTMLElement | null;
    lastFocus.current?.blur();
    setSaveTick((t) => t + 1);
  }
  useEffect(() => {
    if (saveTick > 0) void save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveTick]);

  async function save() {
    const found = validateForm(form);
    setProblems(found);
    setStatus(null);
    if (found.length > 0) {
      lastFocus.current?.focus();
      return;
    }
    setBusy(true);
    try {
      if (form.editing) {
        await updateVoucher(api, form.editing.voucherId, toUpdatePayload(form));
        const fresh = await getVoucher(api, form.editing.voucherId);
        setForm(formFromVoucher(fresh));
        setStatus(`Voucher no. ${fresh.voucherNo} updated`);
      } else {
        const result = await saveVoucher(api, toSavePayload(form, { companyId, yearId }));
        const next = emptyForm(kind, { bookId: form.bookId, date: form.date });
        setForm(next);
        setStatus(`Saved as voucher no. ${result.voucherNo}`);
        setFocusKey(next.lines[0]!.key);
      }
      setStale(false);
    } catch (e) {
      setProblems([messageOf(e)]);
      setStale(e instanceof ApiError && e.code === 'STALE_VERSION');
      lastFocus.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function confirmedDelete() {
    if (!form.editing) return;
    setConfirmDelete(false);
    try {
      await deleteVoucher(api, form.editing.voucherId, form.editing.version);
      nav.back();
    } catch (e) {
      setProblems([messageOf(e)]);
      setStale(e instanceof ApiError && e.code === 'STALE_VERSION');
    }
  }

  useScreenShortcuts(
    kind,
    {
      save: requestSave,
      bills: () => openBills(),
      deleteLine,
      newVoucher,
      deleteVoucher: () => form.editing && setConfirmDelete(true),
    },
    !billsKey && !confirmDelete,
  );

  if (loading) return <p className="panel">Loading voucher…</p>;

  const t = totals(form);
  const billsLine = form.lines.find((l) => l.key === billsKey);

  return (
    <>
      <NavRoot onLast={addLine} className="panel voucher-grid">
        <h2>
          {TITLES[kind]}
          {form.editing ? ` — no. ${form.editing.voucherNo}` : ''}
        </h2>
        <div className="form-row">
          <Field label="Book">
            <Lookup
              label="Book"
              items={lookups.bookItems(kind)}
              value={form.bookId}
              onChange={(id) => setForm((f) => ({ ...f, bookId: id }))}
              disabled={!!form.editing}
              autoFocus={startOnBook}
            />
          </Field>
          <Field label="Date">
            <DateInput label="Date" value={form.date} ctx={ctx} onChange={(iso) => setForm((f) => ({ ...f, date: iso }))} autoFocus={!startOnBook} />
          </Field>
          <Field label="Narration">
            <input
              aria-label="Narration"
              data-nav=""
              style={{ width: 320 }}
              value={form.narration}
              onChange={(e) => setForm((f) => ({ ...f, narration: e.target.value }))}
            />
          </Field>
        </div>

        <table className="data">
          <thead>
            <tr>
              <th>#</th>
              <th>Account</th>
              {kind === 'journal' ? (
                <>
                  <th className="num">Debit</th>
                  <th className="num">Credit</th>
                </>
              ) : (
                <th className="num">Amount</th>
              )}
              <th>Narration</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {form.lines.map((line, i) => {
              const n = i + 1;
              return (
                <tr key={line.key} onFocusCapture={() => setCurrentKey(line.key)}>
                  <td>{n}</td>
                  <td className="account">
                    <Lookup
                      label={`Account line ${n}`}
                      items={lookups.ledgerItems}
                      value={line.ledgerId}
                      onChange={(id) => setLine(line.key, id === line.ledgerId ? {} : { ledgerId: id, adjustments: [] })}
                      data-line={line.key}
                      data-field="account"
                    />
                  </td>
                  {kind === 'journal' ? (
                    <>
                      <td className="num">
                        <MoneyInput label={`Debit line ${n}`} value={line.side === 'Dr' ? line.amount : ''} nav={line.side === 'Dr'} onChange={(v) => setLine(line.key, { side: 'Dr', amount: v })} />
                      </td>
                      <td className="num">
                        <MoneyInput label={`Credit line ${n}`} value={line.side === 'Cr' ? line.amount : ''} nav={line.side === 'Cr'} onChange={(v) => setLine(line.key, { side: 'Cr', amount: v })} />
                      </td>
                    </>
                  ) : (
                    <td className="num">
                      <MoneyInput label={`Amount line ${n}`} value={line.amount} onChange={(v) => setLine(line.key, { amount: v })} />
                    </td>
                  )}
                  <td>
                    <input aria-label={`Narration line ${n}`} data-nav="" value={line.narration} onChange={(e) => setLine(line.key, { narration: e.target.value })} />
                  </td>
                  <td>
                    <button type="button" tabIndex={-1} aria-label={`Bills for line ${n}`} onClick={() => openBills(line.key)}>
                      Bills{line.adjustments.length > 0 ? ` (${line.adjustments.length})` : ''}
                    </button>
                    {line.adjustments.length > 0 && <div className="muted">On account {formatInr(onAccountOf(line))}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Total</td>
              {kind === 'journal' ? (
                <>
                  <td className="num">{formatInr(t.debit)}</td>
                  <td className="num">{formatInr(t.credit)}</td>
                </>
              ) : (
                <td className="num">{formatInr(t.total)}</td>
              )}
              <td colSpan={2} className={kind === 'journal' && t.difference !== '0.00' ? 'err' : 'muted'}>
                {kind === 'journal' ? (t.difference === '0.00' ? 'Balanced' : `Difference ${formatInr(t.difference)}`) : ''}
              </td>
            </tr>
          </tfoot>
        </table>

        {problems.length > 0 && (
          <ul role="alert" className="err">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {stale && editId && (
          <p>
            <button onClick={() => void load(editId)}>Reload voucher</button>
          </p>
        )}
        {status && (
          <p role="status" className="ok">
            {status}
          </p>
        )}
        <p>
          <button className="primary" disabled={busy} onClick={requestSave}>
            {form.editing ? 'Update' : 'Save'} <kbd>Ctrl+S</kbd>
          </button>
        </p>
      </NavRoot>

      {billsLine && billsLine.ledgerId && (
        <BillAdjuster
          companyId={companyId}
          ledgerId={billsLine.ledgerId}
          ledgerName={lookups.ledgers.find((l) => l.id === billsLine.ledgerId)?.name ?? ''}
          lineSide={billsLine.side}
          lineAmount={normalizeAmount(billsLine.amount)}
          current={billsLine.adjustments}
          onCancel={() => setBillsKey(null)}
          onDone={(adjustments) => {
            setLine(billsLine.key, { adjustments });
            setBillsKey(null);
          }}
        />
      )}
      {confirmDelete && form.editing && (
        <ConfirmDialog
          title="Delete voucher"
          message={`Delete voucher no. ${form.editing.voucherNo}? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => void confirmedDelete()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
```
- [ ] **Step 5: Run the tests and the type-check**

Run: `npx vitest run packages/app && npm run typecheck`
Expected: PASS — BillAdjuster (9), VoucherEntry (about 19) and everything earlier. Likely snags and where to look: (a) a keyboard test that finds focus on the wrong field — print `document.activeElement` and compare with the DOM order of `data-nav` elements; (b) `Ctrl+S` test seeing a stale form — `save()` must run from the effect on `saveTick`, not directly from the shortcut; (c) a `Lookup` that does not advance after `Enter` — it relies on `focusNextNav` finding the enclosing `[data-nav-root]`.

- [ ] **Step 6: Commit**

```bash
git add packages/app
git commit -m "feat(app): voucher entry for receipts, payments and journals with the bills panel" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Data table, the commit-then-act helper and the Find Voucher screen

**Files:**
- Create: `packages/app/src/renderer/ui/DataTable.tsx`, `ui/useCommittedAction.ts`, `vouchers/VoucherList.tsx`
- Modify: `packages/app/src/renderer/shell/screenComponents.tsx`
- Test: `ui/DataTable.test.tsx`, `ui/useCommittedAction.test.tsx`, `vouchers/VoucherList.test.tsx`

**Interfaces:**
- Consumes: `listVouchers`, `VoucherListQuery` (Task 4); `Lookup`, `DateInput`, `Field`, `NavRoot` (Tasks 5–6); `useLookups` (Task 7); `useNav` (Task 5).
- Produces:
  - `Column<T> = { key: string; header: string; numeric?: boolean; value: (row: T) => string; render?: (row: T) => ReactNode }` — `value` is the plain text used for display and for CSV export; `render` overrides the display only.
  - `<DataTable columns rows rowKey onOpen? footer? caption? emptyText? tableRef? />`: a focusable grid. `Up`/`Down`/`Home`/`End`/`PgUp`/`PgDn` move the highlighted row, `Enter` calls `onOpen(row)`, a double-click opens, a single click highlights. `footer` is an object keyed by column key, rendered in a `<tfoot>`.
  - `<VoucherList />` — the Find Voucher screen.
  - `useCommittedAction(action: () => void | Promise<void>): () => void` — returns a function that first leaves the field being typed in (so a half-typed date or amount is committed to state) and then runs `action` on the next render, when state is up to date. Use it for every "save", "run" and "apply" that can be triggered from inside a field (Ctrl+S, Ctrl+Enter, or Enter on the last field). Calling the action directly from the key handler would use the values from before the field was committed.

**Behaviour of Find Voucher:** filters Book (optional), From and To (default: the whole financial year). It loads on open, on `Ctrl+Enter`, and when `Enter` is pressed on the To date (which then moves the cursor to the table). Columns: No., Date, Type, Book, Narration, Amount. `Enter` on a row opens that voucher in its own screen (`receipt`, `payment` or `journal`) with `editId`. It loads the newest 200; if exactly 200 come back it says so.

- [ ] **Step 1: Write the failing tests**

`packages/app/src/renderer/ui/DataTable.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataTable, type Column } from './DataTable';

interface Row {
  id: string;
  name: string;
  amount: string;
}
const ROWS: Row[] = [
  { id: '1', name: 'Alpha', amount: '1,000.00' },
  { id: '2', name: 'Beta', amount: '20.00' },
  { id: '3', name: 'Gamma', amount: '3.00' },
];
const COLUMNS: Column<Row>[] = [
  { key: 'name', header: 'Name', value: (r) => r.name },
  { key: 'amount', header: 'Amount', numeric: true, value: (r) => r.amount },
];

const selected = () => screen.getAllByRole('row').filter((r) => r.getAttribute('aria-selected') === 'true');

describe('DataTable', () => {
  it('shows headers, rows and right-aligns numbers', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} caption="Things" />);
    expect(screen.getByRole('grid', { name: 'Things' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Amount' })).toHaveClass('num');
    expect(screen.getByText('20.00').closest('td')).toHaveClass('num');
    expect(screen.getAllByRole('row')).toHaveLength(4); // header + 3
  });

  it('highlights the first row, and the arrow keys move the highlight', async () => {
    const user = userEvent.setup();
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
    expect(selected()[0]).toHaveTextContent('Alpha');
    await user.tab();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(selected()[0]).toHaveTextContent('Gamma');
    await user.keyboard('{ArrowDown}'); // stops at the end
    expect(selected()[0]).toHaveTextContent('Gamma');
    await user.keyboard('{ArrowUp}');
    expect(selected()[0]).toHaveTextContent('Beta');
    await user.keyboard('{Home}');
    expect(selected()[0]).toHaveTextContent('Alpha');
    await user.keyboard('{End}');
    expect(selected()[0]).toHaveTextContent('Gamma');
  });

  it('Enter opens the highlighted row; so does a double-click', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} onOpen={onOpen} />);
    await user.tab();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onOpen).toHaveBeenLastCalledWith(ROWS[1]);
    await user.dblClick(screen.getByRole('row', { name: /Gamma/ }));
    expect(onOpen).toHaveBeenLastCalledWith(ROWS[2]);
  });

  it('a click highlights a row without opening it', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} onOpen={onOpen} />);
    await user.click(screen.getByRole('row', { name: /Beta/ }));
    expect(selected()[0]).toHaveTextContent('Beta');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('goes back to the first row when the rows change', () => {
    const { rerender } = render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
    rerender(<DataTable columns={COLUMNS} rows={[...ROWS].reverse()} rowKey={(r) => r.id} />);
    expect(selected()[0]).toHaveTextContent('Gamma');
  });

  it('prints a footer row and an empty message', () => {
    const { rerender } = render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} footer={{ name: 'Total', amount: '1,023.00' }} />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('1,023.00').closest('td')).toHaveClass('num');
    rerender(<DataTable columns={COLUMNS} rows={[]} rowKey={(r) => r.id} emptyText="Nothing to show" />);
    expect(screen.getByText('Nothing to show')).toBeInTheDocument();
  });

  it('uses render for display when given', () => {
    const cols: Column<Row>[] = [{ key: 'name', header: 'Name', value: (r) => r.name, render: (r) => <strong>{r.name}!</strong> }];
    render(<DataTable columns={cols} rows={ROWS} rowKey={(r) => r.id} />);
    expect(screen.getByText('Alpha!')).toBeInTheDocument();
  });
});
```

`packages/app/src/renderer/vouchers/VoucherList.test.tsx`:
```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import type { VoucherSummary } from '../api/types';
import type { FakeRoute } from '../testing/fakeClient';
import { renderScreen } from '../testing/render';
import { VoucherList } from './VoucherList';

const ROWS: VoucherSummary[] = [
  { id: 'v2', voucherNo: 2, date: '2026-05-12', kind: 'payment', bookCode: 'CB', narration: 'rent', total: '25000.00' },
  { id: 'v1', voucherNo: 1, date: '2026-05-10', kind: 'receipt', bookCode: 'CB', narration: null, total: '1234567.50' },
];

function routes(rows = ROWS) {
  const seen: string[] = [];
  const list: FakeRoute = {
    method: 'GET',
    path: '/api/companies/c1/vouchers',
    reply: ({ query }) => {
      seen.push(query.toString());
      return rows;
    },
  };
  return { seen, routes: [list] };
}

describe('VoucherList', () => {
  it('loads the whole year on open and shows Indian-formatted amounts', async () => {
    const { seen, routes: r } = routes();
    renderScreen(<VoucherList />, { routes: r });
    expect(await screen.findByRole('row', { name: /rent/ })).toHaveTextContent('25,000.00');
    expect(screen.getByRole('row', { name: /^1 10-05-2026 Receipt/ })).toHaveTextContent('12,34,567.50');
    expect(seen[0]).toBe('yearId=y1&from=2026-04-01&to=2027-03-31&limit=200');
  });

  it('Enter on a row opens the voucher in its own screen', async () => {
    const user = userEvent.setup();
    const { routes: r } = routes();
    const { navCalls } = renderScreen(<VoucherList />, { routes: r });
    await screen.findByRole('row', { name: /rent/ });
    screen.getByRole('grid').focus();
    await user.keyboard('{Enter}');
    expect(navCalls).toEqual(['open:payment {"editId":"v2"}']);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(navCalls[1]).toBe('open:receipt {"editId":"v1"}');
  });

  it('Enter on the To date reloads with the new dates and moves into the table', async () => {
    const user = userEvent.setup();
    const { seen, routes: r } = routes();
    renderScreen(<VoucherList />, { routes: r });
    await screen.findByRole('row', { name: /rent/ });
    const from = screen.getByLabelText('From');
    await user.clear(from);
    await user.type(from, '01052026{Enter}');
    const to = screen.getByLabelText('To');
    expect(to).toHaveFocus(); // From -> To
    await user.clear(to);
    await user.type(to, '31052026{Enter}');
    await waitFor(() => expect(seen).toHaveLength(2));
    expect(seen[1]).toBe('yearId=y1&from=2026-05-01&to=2026-05-31&limit=200');
    await waitFor(() => expect(screen.getByRole('grid')).toHaveFocus());
  });

  it('Ctrl+Enter reloads', async () => {
    const user = userEvent.setup();
    const { seen, routes: r } = routes();
    renderScreen(<VoucherList />, { routes: r });
    await screen.findByRole('row', { name: /rent/ });
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(seen).toHaveLength(2));
  });

  it('filters by book', async () => {
    const user = userEvent.setup();
    const { seen, routes: r } = routes();
    renderScreen(<VoucherList />, { routes: r });
    await screen.findByRole('row', { name: /rent/ });
    await user.type(screen.getByRole('combobox', { name: 'Book' }), 'journal{Enter}');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(seen.at(-1)).toContain('bookId=b-jv'));
  });

  it('says when nothing was found, and warns when the list is cut at 200', async () => {
    const empty = routes([]);
    const first = renderScreen(<VoucherList />, { routes: empty.routes });
    expect(await screen.findByText(/no vouchers found/i)).toBeInTheDocument();
    first.unmount();
    const many = Array.from({ length: 200 }, (_, i): VoucherSummary => ({ ...ROWS[0]!, id: `v${i}`, voucherNo: i + 1 }));
    renderScreen(<VoucherList />, { routes: routes(many).routes });
    expect(await screen.findByText(/showing the newest 200/i)).toBeInTheDocument();
  });

  it('shows the server\'s message when loading fails', async () => {
    renderScreen(<VoucherList />, {
      routes: [
        {
          method: 'GET',
          path: '/api/companies/c1/vouchers',
          reply: () => {
            throw new ApiError(403, 'FORBIDDEN', 'You do not have find rights on cash book');
          },
        },
      ],
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have find rights on cash book');
  });
});
```

`packages/app/src/renderer/ui/useCommittedAction.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { DateInput } from './DateInput';
import { useCommittedAction } from './useCommittedAction';

function Harness({ log }: { log: (seen: string | null) => void }) {
  const [date, setDate] = useState<string | null>(null);
  // This is the bug the hook prevents: `run` reads `date`, which was typed but not yet committed
  // when the key was pressed.
  const run = useCommittedAction(() => log(date));
  return (
    <div onKeyDown={(e) => e.key === 'Enter' && e.ctrlKey && run()}>
      <DateInput label="Date" value={date} onChange={setDate} ctx={{ yearStart: '2026-04-01', yearEnd: '2027-03-31', base: '2026-05-03' }} />
      <button onClick={run}>Run</button>
    </div>
  );
}

describe('useCommittedAction', () => {
  it('runs the action with the value of the field that was still being typed in', async () => {
    const user = userEvent.setup();
    const seen: (string | null)[] = [];
    render(<Harness log={(v) => seen.push(v)} />);
    await user.type(screen.getByLabelText('Date'), '10052026');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(seen).toEqual(['2026-05-10']);
  });

  it('runs once per request', async () => {
    const user = userEvent.setup();
    const seen: (string | null)[] = [];
    render(<Harness log={(v) => seen.push(v)} />);
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await user.click(screen.getByRole('button', { name: 'Run' }));
    expect(seen).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/app/src/renderer/ui/DataTable.test.tsx packages/app/src/renderer/ui/useCommittedAction.test.tsx packages/app/src/renderer/vouchers/VoucherList.test.tsx`
Expected: FAIL — cannot find modules `./DataTable`, `./useCommittedAction`, `./VoucherList`.

- [ ] **Step 3: Write the implementation**

`packages/app/src/renderer/ui/DataTable.tsx`:
```tsx
import { useEffect, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  numeric?: boolean;
  /** Plain text: used for display, and by CSV export. */
  value: (row: T) => string;
  /** Overrides how the cell is displayed (not the CSV text). */
  render?: (row: T) => ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onOpen?: (row: T) => void;
  footer?: Record<string, ReactNode>;
  caption?: string;
  emptyText?: string;
  tableRef?: Ref<HTMLTableElement>;
}

export function DataTable<T>({ columns, rows, rowKey, onOpen, footer, caption, emptyText, tableRef }: Props<T>) {
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [rows]);

  function onKeyDown(e: KeyboardEvent<HTMLTableElement>) {
    const last = rows.length - 1;
    const move = (to: number) => {
      e.preventDefault();
      setActive(Math.max(0, Math.min(to, last)));
    };
    if (e.key === 'ArrowDown') move(active + 1);
    else if (e.key === 'ArrowUp') move(active - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(last);
    else if (e.key === 'PageDown') move(active + 10);
    else if (e.key === 'PageUp') move(active - 10);
    else if (e.key === 'Enter' && onOpen && rows[active]) {
      e.preventDefault();
      onOpen(rows[active]!);
    }
  }

  return (
    <table className="data" role="grid" aria-label={caption} tabIndex={0} ref={tableRef} onKeyDown={onKeyDown}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} className={c.numeric ? 'num' : undefined}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={rowKey(row)}
            aria-selected={i === active}
            ref={(el) => {
              if (el && i === active) el.scrollIntoView?.({ block: 'nearest' });
            }}
            onClick={() => setActive(i)}
            onDoubleClick={() => onOpen?.(row)}
          >
            {columns.map((c) => (
              <td key={c.key} className={c.numeric ? 'num' : undefined}>
                {c.render ? c.render(row) : c.value(row)}
              </td>
            ))}
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={columns.length} className="muted">
              {emptyText ?? 'Nothing to show'}
            </td>
          </tr>
        )}
      </tbody>
      {footer && (
        <tfoot>
          <tr>
            {columns.map((c) => (
              <td key={c.key} className={c.numeric ? 'num' : undefined}>
                {footer[c.key] ?? ''}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}
```

`packages/app/src/renderer/ui/useCommittedAction.ts`:
```ts
import { useEffect, useRef, useState } from 'react';

/**
 * Returns a function that runs `action` after the field currently being typed in has been committed.
 * It blurs that field (which commits it), then runs the action on the next render, when state is current.
 */
export function useCommittedAction(action: () => void | Promise<void>): () => void {
  const [tick, setTick] = useState(0);
  const latest = useRef(action);
  latest.current = action;
  useEffect(() => {
    if (tick > 0) void latest.current();
  }, [tick]);
  return () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    setTick((t) => t + 1);
  };
}
```

`packages/app/src/renderer/vouchers/VoucherList.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { listVouchers } from '../api/endpoints';
import type { VoucherSummary } from '../api/types';
import { useScreenShortcuts } from '../keys/useScreenShortcuts';
import { useApi } from '../session/deps';
import { useLookups } from '../session/Lookups';
import { useSession } from '../session/Session';
import { useNav } from '../shell/nav';
import { clampToYear, formatDisplay, todayIso, type DateCtx } from '../ui/dates';
import { DataTable, type Column } from '../ui/DataTable';
import { DateInput } from '../ui/DateInput';
import { Field } from '../ui/Field';
import { formatInr } from '../ui/format';
import { Lookup } from '../ui/Lookup';
import { NavRoot } from '../ui/NavRoot';
import { useCommittedAction } from '../ui/useCommittedAction';

const LIMIT = 200;
const KIND_LABEL = { receipt: 'Receipt', payment: 'Payment', journal: 'Journal' } as const;

const COLUMNS: Column<VoucherSummary>[] = [
  { key: 'no', header: 'No.', value: (r) => String(r.voucherNo) },
  { key: 'date', header: 'Date', value: (r) => formatDisplay(r.date) },
  { key: 'kind', header: 'Type', value: (r) => KIND_LABEL[r.kind] },
  { key: 'book', header: 'Book', value: (r) => r.bookCode },
  { key: 'narration', header: 'Narration', value: (r) => r.narration ?? '' },
  { key: 'total', header: 'Amount', numeric: true, value: (r) => formatInr(r.total) },
];

export function VoucherList() {
  const api = useApi();
  const { company, year } = useSession();
  const lookups = useLookups();
  const nav = useNav();
  const tableRef = useRef<HTMLTableElement>(null);

  const [bookId, setBookId] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(year?.startDate ?? null);
  const [to, setTo] = useState<string | null>(year?.endDate ?? null);
  const [rows, setRows] = useState<VoucherSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!company || !year) return;
    setError(null);
    try {
      setRows(await listVouchers(api, company.id, { yearId: year.id, bookId: bookId ?? undefined, from: from ?? undefined, to: to ?? undefined, limit: LIMIT }));
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, year?.id]);

  // Reload with the filters as they are once the field being typed in has been committed, then move into the table.
  const requestRun = useCommittedAction(async () => {
    await run();
    tableRef.current?.focus();
  });
  useScreenShortcuts('vouchers', { refresh: requestRun });

  if (!company || !year) return <p className="panel">Choose a company and year first (F9).</p>;
  const ctx: DateCtx = { yearStart: year.startDate, yearEnd: year.endDate, base: clampToYear(todayIso(), year.startDate, year.endDate) };

  return (
    <div>
      <h2>Find Voucher</h2>
      <NavRoot className="panel" onLast={requestRun}>
        <div className="form-row">
          <Field label="Book">
            <Lookup label="Book" items={lookups.books.map((b) => ({ id: b.id, label: b.name, sub: b.code }))} value={bookId} onChange={setBookId} />
          </Field>
          <Field label="From">
            <DateInput label="From" value={from} ctx={ctx} onChange={setFrom} />
          </Field>
          <Field label="To">
            <DateInput label="To" value={to} ctx={ctx} onChange={setTo} />
          </Field>
        </div>
      </NavRoot>
      {error && (
        <p role="alert" className="err">
          {error}
        </p>
      )}
      {loaded && !error && rows.length === 0 && <p className="muted">No vouchers found for these filters.</p>}
      {rows.length >= LIMIT && <p className="muted">Showing the newest {LIMIT}. Narrow the dates or pick a book to see others.</p>}
      {rows.length > 0 && (
        <DataTable
          caption="Vouchers"
          columns={COLUMNS}
          rows={rows}
          rowKey={(r) => r.id}
          tableRef={tableRef}
          onOpen={(r) => nav.open(r.kind, { editId: r.id })}
        />
      )}
    </div>
  );
}
```

In `screenComponents.tsx` add `import { VoucherList } from '../vouchers/VoucherList';` and the entry `vouchers: VoucherList,`.

- [ ] **Step 4: Run the tests and the type-check**

Run: `npx vitest run packages/app && npm run typecheck`
Expected: PASS — DataTable (7), VoucherList (7) and everything earlier; no type errors. The first `VoucherList` row assertion depends on the accessible name of a table row being its cell text joined by spaces (`1 10-05-2026 Receipt CB 12,34,567.50`); if Testing Library names it differently, match with `getByText` on the cells instead.

- [ ] **Step 5: Commit**

```bash
git add packages/app
git commit -m "feat(app): keyboard data table and the Find Voucher screen" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Master data screens — company, accounts, opening balances, books

**Files (service):**
- Modify: `packages/service/src/masters/queries.ts` (add `listOpenings`), `packages/service/src/api/routes/masters.ts` (add the route), `packages/service/src/api/masters.api.test.ts` (add tests)

**Files (app):**
- Modify: `packages/app/src/renderer/api/endpoints.ts` (append endpoints), `shell/screenComponents.tsx`
- Create: `packages/app/src/renderer/masters/CompanyScreen.tsx`, `LedgerScreen.tsx`, `OpeningScreen.tsx`, `BookScreen.tsx`
- Test: `masters/CompanyScreen.test.tsx`, `LedgerScreen.test.tsx`, `OpeningScreen.test.tsx`, `BookScreen.test.tsx`

**Interfaces:**
- Produces (service): `listOpenings(q, companyId, yearId, hiddenGroupIds?): Promise<{ ledgerId; ledgerName; groupName; amount: string; side: 'Dr' | 'Cr' }[]>` ordered by name; route `GET /api/companies/:companyId/openings?yearId=` (needs `account_master` + `find`, hides blocked groups).
- Produces (app endpoints, appended to `endpoints.ts`): `createCompany(api, body)` → `{companyId, yearId}`; `createLedger(api, companyId, body)` → `{id}`; `setOpening(api, ledgerId, body)`; `listOpenings(api, companyId, yearId)`; `createBook(api, companyId, body)` → `{id}`.
- Produces (screens): `<CompanyScreen />` (`company`), `<LedgerScreen />` (`ledgers`), `<OpeningScreen />` (`openings`), `<BookScreen />` (`books`); plus `defaultFinancialYear(now?)` exported from `CompanyScreen.tsx`.

**Known limit (state it in the screens):** the Plan B API can create ledgers, books and opening balances but not edit or delete them, so these screens list and create. Editing is added when a later sub-project needs it.

- [ ] **Step 1: Service — write the failing test, then the endpoint**

Append to `packages/service/src/api/masters.api.test.ts`:
```ts
describe('opening balances list', () => {
  const url = () => `/api/companies/${f.s.companyId}/openings?yearId=${f.s.yearId}`;

  it('lists the openings of a year, oldest name first, and respects rights and blocked groups', async () => {
    await post(`/api/ledgers/${f.s.partyLedgerId}/opening`, { yearId: f.s.yearId, amount: '1500.50', side: 'Dr' });
    await post(`/api/ledgers/${f.s.cashLedgerId}/opening`, { yearId: f.s.yearId, amount: '20', side: 'Cr' });
    const r = await get(url());
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual([
      { ledgerId: f.s.cashLedgerId, ledgerName: 'Cash', groupName: 'Cash-in-Hand', amount: '20.00', side: 'Cr' },
      { ledgerId: f.s.partyLedgerId, ledgerName: 'Ramesh Traders', groupName: 'Sundry Debtors', amount: '1500.50', side: 'Dr' },
    ]);

    const nobody = await f.addUser('nobody');
    expect((await get(url(), nobody.token)).statusCode).toBe(403);

    const viewer = await f.addUser('viewer', { account_master: { find: true } });
    expect((await get(url(), viewer.token)).json()).toHaveLength(2);
    const g42 = (await f.db.query<{ id: string }>('SELECT id FROM account_groups WHERE company_id = $1 AND code = 42', [f.s.companyId]))[0]!.id;
    await setBlockedGroups(f.db, viewer.id, [g42]);
    expect((await get(url(), viewer.token)).json().map((o: { ledgerName: string }) => o.ledgerName)).toEqual(['Cash']);
  });

  it('is empty for a year with no openings and rejects a missing year', async () => {
    expect((await get(url())).json()).toEqual([]);
    expect((await get(`/api/companies/${f.s.companyId}/openings`)).statusCode).toBe(400);
  });
});
```
Run: `npx vitest run packages/service/src/api/masters.api.test.ts` — Expected: the two new tests FAIL with 404.

Append to `packages/service/src/masters/queries.ts`:
```ts
export async function listOpenings(
  q: Queryable,
  companyId: string,
  yearId: string,
  hidden: string[] = [],
): Promise<{ ledgerId: string; ledgerName: string; groupName: string; amount: string; side: 'Dr' | 'Cr' }[]> {
  const rows = await q.query<{ ledger_id: string; ledger_name: string; group_name: string; amount: string; side: 'Dr' | 'Cr' }>(
    `SELECT l.id AS ledger_id, l.name AS ledger_name, g.name AS group_name, o.amount, o.side
     FROM ledger_openings o
     JOIN ledgers l ON l.id = o.ledger_id
     JOIN account_groups g ON g.id = l.group_id
     WHERE l.company_id = $1 AND o.year_id = $2 AND NOT (l.group_id = ANY($3::uuid[]))
     ORDER BY lower(l.name)`,
    [companyId, yearId, hidden],
  );
  return rows.map((r) => ({ ledgerId: r.ledger_id, ledgerName: r.ledger_name, groupName: r.group_name, amount: r.amount, side: r.side }));
}
```
In `packages/service/src/api/routes/masters.ts` import `listOpenings` with the other queries and add inside `registerMasterRoutes`:
```ts
  app.get('/api/companies/:companyId/openings', async (req) => {
    const { companyId } = companyParam.parse(req.params);
    const { yearId } = z.object({ yearId: uuid }).parse(req.query);
    const actor = req.actor!;
    await assertCompanyVisible(db, actor, companyId);
    await assertRight(db, actor, 'account_master', 'find');
    return listOpenings(db, companyId, yearId, await hiddenGroupIds(db, actor, companyId));
  });
```
Run: `npx vitest run packages/service` — Expected: PASS.

- [ ] **Step 2: App — append the endpoints**

Append to `packages/app/src/renderer/api/endpoints.ts`:
```ts
export interface NewCompanyBody {
  code: string;
  name: string;
  gstin?: string;
  pan?: string;
  stateCode?: string;
  fyLabel: string;
  fyStart: string;
  fyEnd: string;
}
export const createCompany = (api: ApiClient, body: NewCompanyBody) =>
  api.request<{ companyId: string; yearId: string }>('POST', '/api/companies', body);

export interface NewLedgerBody {
  groupCode: number;
  name: string;
  address?: string;
  city?: string;
  stateCode?: string;
  gstin?: string;
  pan?: string;
  creditDays?: number;
}
export const createLedger = (api: ApiClient, companyId: string, body: NewLedgerBody) =>
  api.request<{ id: string }>('POST', `/api/companies/${companyId}/ledgers`, body);

export const setOpening = (api: ApiClient, ledgerId: string, body: { yearId: string; amount: string; side: 'Dr' | 'Cr' }) =>
  api.request<void>('POST', `/api/ledgers/${ledgerId}/opening`, body);

export interface OpeningRow {
  ledgerId: string;
  ledgerName: string;
  groupName: string;
  amount: string;
  side: 'Dr' | 'Cr';
}
export const listOpenings = (api: ApiClient, companyId: string, yearId: string) =>
  api.request<OpeningRow[]>('GET', `/api/companies/${companyId}/openings${queryString({ yearId })}`);

export const createBook = (api: ApiClient, companyId: string, body: { code: string; name: string; type: string; defaultLedgerId?: string }) =>
  api.request<{ id: string }>('POST', `/api/companies/${companyId}/books`, body);
```

- [ ] **Step 3: App — write the failing tests**

`packages/app/src/renderer/masters/CompanyScreen.test.tsx`:
```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { renderScreen } from '../testing/render';
import { rightsFor, ME_CLERK } from '../testing/sampleData';
import { CompanyScreen, defaultFinancialYear } from './CompanyScreen';

describe('defaultFinancialYear', () => {
  it('April to March around today', () => {
    expect(defaultFinancialYear(new Date(2026, 9, 20))).toEqual({ label: '2026-27', start: '2026-04-01', end: '2027-03-31' });
    expect(defaultFinancialYear(new Date(2027, 1, 5))).toEqual({ label: '2026-27', start: '2026-04-01', end: '2027-03-31' });
    expect(defaultFinancialYear(new Date(2026, 3, 1))).toEqual({ label: '2026-27', start: '2026-04-01', end: '2027-03-31' });
    expect(defaultFinancialYear(new Date(2026, 2, 31))).toEqual({ label: '2025-26', start: '2025-04-01', end: '2026-03-31' });
  });
});

describe('CompanyScreen', () => {
  it('lists the companies and the years of the current one', async () => {
    renderScreen(<CompanyScreen />);
    expect(await screen.findByText('Test Textiles')).toBeInTheDocument();
    expect(screen.getByText('2026-27')).toBeInTheDocument();
    expect(screen.getByText('closed')).toBeInTheDocument(); // 2025-26
  });

  it('creates a company with the keyboard, then switches to it', async () => {
    const user = userEvent.setup();
    const bodies: any[] = [];
    const selected: string[] = [];
    let refreshed = 0;
    renderScreen(<CompanyScreen />, {
      session: { refreshCompanies: async () => void refreshed++, selectCompany: async (id) => void selected.push(id) },
      routes: [{ method: 'POST', path: '/api/companies', reply: ({ body }) => (bodies.push(body), { companyId: 'c2', yearId: 'y9' }) }],
    });
    await user.type(await screen.findByLabelText('Code'), 'C2{Enter}Second Traders{Enter}24ABCDE1234F1Z5{Enter}ABCDE1234F{Enter}24{Enter}');
    expect(screen.getByLabelText('Year name')).toHaveValue(defaultFinancialYear().label);
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('status')).toHaveTextContent('Company "Second Traders" created');
    expect(bodies[0]).toMatchObject({ code: 'C2', name: 'Second Traders', gstin: '24ABCDE1234F1Z5', pan: 'ABCDE1234F', stateCode: '24', fyLabel: defaultFinancialYear().label });
    expect(refreshed).toBe(1);
    expect(selected).toEqual(['c2']);
    expect(screen.getByLabelText('Code')).toHaveValue(''); // ready for another
  });

  it('asks for the code, name and a sensible year', async () => {
    const user = userEvent.setup();
    const { api } = renderScreen(<CompanyScreen />);
    await screen.findByLabelText('Code');
    await user.keyboard('{Control>}s{/Control}');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Enter a company code');
    expect(alert).toHaveTextContent('Enter the company name');
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('shows the server\'s message, e.g. for a duplicate code', async () => {
    const user = userEvent.setup();
    renderScreen(<CompanyScreen />, {
      routes: [{ method: 'POST', path: '/api/companies', reply: () => { throw new ApiError(409, 'DUPLICATE', 'That name or number already exists'); } }],
    });
    await user.type(await screen.findByLabelText('Code'), 'C1{Enter}Dup{Enter}');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent('That name or number already exists');
  });

  it('is read-only for someone without the right to add companies', async () => {
    renderScreen(<CompanyScreen />, { session: { actor: ME_CLERK.actor, rights: rightsFor(), can: () => false } });
    expect(await screen.findByText(/do not have the right to create companies/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Code')).toBeNull();
  });
});
```

`packages/app/src/renderer/masters/LedgerScreen.test.tsx`:
```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { renderScreen } from '../testing/render';
import { LedgerScreen } from './LedgerScreen';

describe('LedgerScreen', () => {
  it('lists the accounts and filters them as you type', async () => {
    const user = userEvent.setup();
    renderScreen(<LedgerScreen />);
    const grid = await screen.findByRole('grid', { name: 'Accounts' });
    expect(within(grid).getAllByRole('row')).toHaveLength(5); // header + 4
    await user.type(screen.getByLabelText('Find account'), 'sur');
    expect(within(grid).getAllByRole('row')).toHaveLength(3); // header + Ramesh (Surat) + Suresh
  });

  it('creates an account with the keyboard and refreshes the cache', async () => {
    const user = userEvent.setup();
    const bodies: any[] = [];
    let ledgerGets = 0;
    renderScreen(<LedgerScreen />, {
      routes: [
        { method: 'POST', path: '/api/companies/c1/ledgers', reply: ({ body }) => (bodies.push(body), { id: 'l-new' }) },
        { method: 'GET', path: '/api/companies/c1/ledgers', reply: () => (ledgerGets++, []) },
      ],
    });
    await screen.findByRole('grid', { name: 'Accounts' });
    const gets0 = ledgerGets;
    await user.click(screen.getByRole('combobox', { name: 'Group' }));
    await user.keyboard('debtors{Enter}Mahesh Fabrics{Enter}Surat{Enter}24AAAAA0000A1Z5{Enter}AAAAA0000A{Enter}45{Enter}');
    await user.type(screen.getByLabelText('Address'), 'Ring Road');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('status')).toHaveTextContent('Account "Mahesh Fabrics" created');
    expect(bodies[0]).toEqual({ groupCode: 42, name: 'Mahesh Fabrics', city: 'Surat', gstin: '24AAAAA0000A1Z5', pan: 'AAAAA0000A', creditDays: 45, address: 'Ring Road' });
    await waitFor(() => expect(ledgerGets).toBeGreaterThan(gets0));
    expect(screen.getByLabelText('Name')).toHaveValue('');
  });

  it('needs a group and a name', async () => {
    const user = userEvent.setup();
    const { api } = renderScreen(<LedgerScreen />);
    await screen.findByRole('grid', { name: 'Accounts' });
    await user.keyboard('{Control>}s{/Control}');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Choose the group');
    expect(alert).toHaveTextContent('Enter the account name');
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('only accepts whole numbers of credit days', async () => {
    const user = userEvent.setup();
    renderScreen(<LedgerScreen />);
    await screen.findByRole('grid', { name: 'Accounts' });
    await user.type(screen.getByLabelText('Credit days'), '4a5.');
    expect(screen.getByLabelText('Credit days')).toHaveValue('45');
  });

  it('shows the duplicate-name message from the server', async () => {
    const user = userEvent.setup();
    renderScreen(<LedgerScreen />, {
      routes: [{ method: 'POST', path: '/api/companies/c1/ledgers', reply: () => { throw new ApiError(409, 'DUPLICATE', 'That name or number already exists'); } }],
    });
    await screen.findByRole('grid', { name: 'Accounts' });
    await user.click(screen.getByRole('combobox', { name: 'Group' }));
    await user.keyboard('debtors{Enter}Ramesh Traders');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent('That name or number already exists');
  });

  it('Ctrl+N clears the form', async () => {
    const user = userEvent.setup();
    renderScreen(<LedgerScreen />);
    await screen.findByRole('grid', { name: 'Accounts' });
    await user.type(screen.getByLabelText('Name'), 'Half typed');
    await user.keyboard('{Control>}n{/Control}');
    expect(screen.getByLabelText('Name')).toHaveValue('');
  });
});
```

`packages/app/src/renderer/masters/OpeningScreen.test.tsx`:
```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { OpeningRow } from '../api/endpoints';
import type { SessionValue } from '../session/Session';
import type { FakeRoute } from '../testing/fakeClient';
import { renderScreen } from '../testing/render';
import { YEAR_2025 } from '../testing/sampleData';
import { OpeningScreen } from './OpeningScreen';

const OPENINGS: OpeningRow[] = [
  { ledgerId: 'l-cash', ledgerName: 'Cash', groupName: 'Cash-in-Hand', amount: '10000.00', side: 'Dr' },
  { ledgerId: 'l-ramesh', ledgerName: 'Ramesh Traders', groupName: 'Sundry Debtors', amount: '2500.50', side: 'Cr' },
];

function setup(opts: { openings?: OpeningRow[]; session?: Partial<SessionValue> } = {}) {
  const posts: { path: string; body: any }[] = [];
  const routes: FakeRoute[] = [
    { method: 'GET', path: '/api/companies/c1/openings', reply: () => opts.openings ?? OPENINGS },
    { method: 'POST', path: /^\/api\/ledgers\/[^/]+\/opening$/, reply: ({ path, body }) => void posts.push({ path, body }) },
  ];
  return { posts, ...renderScreen(<OpeningScreen />, { routes, session: opts.session }) };
}

describe('OpeningScreen', () => {
  it('lists the openings of the current year with Dr and Cr totals and the difference', async () => {
    const { api } = setup();
    const grid = await screen.findByRole('grid', { name: 'Opening balances' });
    expect(within(grid).getByRole('row', { name: /Cash/ })).toHaveTextContent('10,000.00');
    expect(within(grid).getByRole('row', { name: /Ramesh Traders/ })).toHaveTextContent('2,500.50');
    expect(screen.getByText(/Difference 7,499\.50 Dr/)).toBeInTheDocument();
    expect(api.calls.find((c) => c.path.includes('/openings'))!.path).toBe('/api/companies/c1/openings?yearId=y1');
  });

  it('says the openings balance when Dr equals Cr', async () => {
    setup({ openings: [{ ...OPENINGS[0]!, amount: '100.00' }, { ...OPENINGS[1]!, amount: '100.00' }] });
    expect(await screen.findByText('The opening balances balance.')).toBeInTheDocument();
  });

  it('saves an opening balance with the keyboard and reloads the list', async () => {
    const user = userEvent.setup();
    const { posts, api } = setup();
    await screen.findByRole('grid', { name: 'Opening balances' });
    await user.click(screen.getByRole('combobox', { name: 'Account' }));
    await user.keyboard('suresh{Enter}1500{Enter}cr{Enter}');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('status')).toHaveTextContent('Opening balance saved for Suresh Textiles');
    expect(posts).toEqual([{ path: '/api/ledgers/l-suresh/opening', body: { yearId: 'y1', amount: '1500.00', side: 'Cr' } }]);
    expect(api.calls.filter((c) => c.path.includes('/openings')).length).toBe(2);
  });

  it('needs an account, an amount and a side', async () => {
    const user = userEvent.setup();
    const { posts } = setup();
    await screen.findByRole('grid', { name: 'Opening balances' });
    await user.keyboard('{Control>}s{/Control}');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Choose the account');
    expect(alert).toHaveTextContent('Enter the amount');
    expect(alert).toHaveTextContent('Choose Dr or Cr');
    expect(posts).toHaveLength(0);
  });

  it('is read-only when the year is not open', async () => {
    setup({ session: { year: YEAR_2025 } });
    expect(await screen.findByText(/year 2025-26 is closed/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Account' })).toBeNull();
  });
});
```

`packages/app/src/renderer/masters/BookScreen.test.tsx`:
```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { renderScreen } from '../testing/render';
import { BookScreen } from './BookScreen';

describe('BookScreen', () => {
  it('lists the books', async () => {
    renderScreen(<BookScreen />);
    const grid = await screen.findByRole('grid', { name: 'Books' });
    expect(grid).toHaveTextContent('Cash Book');
    expect(grid).toHaveTextContent('Journal');
  });

  it('creates a bank book with its ledger and refreshes the cache', async () => {
    const user = userEvent.setup();
    const bodies: any[] = [];
    let bookGets = 0;
    renderScreen(<BookScreen />, {
      routes: [
        { method: 'POST', path: '/api/companies/c1/books', reply: ({ body }) => (bodies.push(body), { id: 'b-new' }) },
        { method: 'GET', path: '/api/companies/c1/books', reply: () => (bookGets++, []) },
      ],
    });
    await screen.findByRole('grid', { name: 'Books' });
    const before = bookGets;
    await user.type(screen.getByLabelText('Code'), 'HDFC{Enter}HDFC Current{Enter}bank{Enter}cash{Enter}');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('status')).toHaveTextContent('Book "HDFC Current" created');
    expect(bodies[0]).toEqual({ code: 'HDFC', name: 'HDFC Current', type: 'bank', defaultLedgerId: 'l-cash' });
    await waitFor(() => expect(bookGets).toBeGreaterThan(before));
  });

  it('a journal book needs no ledger and the ledger box is then hidden', async () => {
    const user = userEvent.setup();
    const bodies: any[] = [];
    renderScreen(<BookScreen />, {
      routes: [{ method: 'POST', path: '/api/companies/c1/books', reply: ({ body }) => (bodies.push(body), { id: 'b2' }) }],
    });
    await screen.findByRole('grid', { name: 'Books' });
    await user.type(screen.getByLabelText('Code'), 'JV2{Enter}Journal 2{Enter}journal{Enter}');
    expect(screen.queryByRole('combobox', { name: 'Cash or bank ledger' })).toBeNull();
    await user.keyboard('{Control>}s{/Control}');
    await screen.findByRole('status');
    expect(bodies[0]).toEqual({ code: 'JV2', name: 'Journal 2', type: 'journal' });
  });

  it('a cash or bank book needs its ledger', async () => {
    const user = userEvent.setup();
    const { api } = renderScreen(<BookScreen />);
    await screen.findByRole('grid', { name: 'Books' });
    await user.type(screen.getByLabelText('Code'), 'X{Enter}X book{Enter}cash{Enter}');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose the cash or bank ledger of this book');
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('shows the server\'s message', async () => {
    const user = userEvent.setup();
    renderScreen(<BookScreen />, {
      routes: [{ method: 'POST', path: '/api/companies/c1/books', reply: () => { throw new ApiError(409, 'DUPLICATE', 'That name or number already exists'); } }],
    });
    await screen.findByRole('grid', { name: 'Books' });
    await user.type(screen.getByLabelText('Code'), 'CB{Enter}Again{Enter}journal{Enter}');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent('That name or number already exists');
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run packages/app/src/renderer/masters`
Expected: FAIL — cannot find the four screen modules.

- [ ] **Step 5: Write the screens**

All four screens save through `useCommittedAction` (Task 10), so a field still being typed in is committed before the form is checked and sent. (`VoucherEntry` has its own copy of the same idea because it also puts the cursor back after a failed check.)

`packages/app/src/renderer/masters/CompanyScreen.tsx`:
```tsx
import { useMemo, useState } from 'react';
import { createCompany } from '../api/endpoints';
import { useScreenShortcuts } from '../keys/useScreenShortcuts';
import { useApi } from '../session/deps';
import { useSession } from '../session/Session';
import { todayIso, type DateCtx } from '../ui/dates';
import { DataTable } from '../ui/DataTable';
import { DateInput } from '../ui/DateInput';
import { Field } from '../ui/Field';
import { NavRoot } from '../ui/NavRoot';
import { useCommittedAction } from '../ui/useCommittedAction';

/** The April-to-March year that contains `now`. */
export function defaultFinancialYear(now: Date = new Date()): { label: string; start: string; end: string } {
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    label: `${startYear}-${String(startYear + 1).slice(2)}`,
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
  };
}

export function CompanyScreen() {
  const api = useApi();
  const session = useSession();
  const dflt = useMemo(() => defaultFinancialYear(), []);
  const ctx: DateCtx = { yearStart: dflt.start, yearEnd: dflt.end, base: todayIso() };

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [label, setLabel] = useState(dflt.label);
  const [start, setStart] = useState<string | null>(dflt.start);
  const [end, setEnd] = useState<string | null>(dflt.end);
  const [problems, setProblems] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  async function save() {
    const found: string[] = [];
    if (!code.trim()) found.push('Enter a company code');
    if (!name.trim()) found.push('Enter the company name');
    if (!label.trim()) found.push('Enter the name of the first financial year');
    if (!start || !end) found.push('Enter the first and last day of the financial year');
    else if (end <= start) found.push('The last day of the year must be after the first day');
    setProblems(found);
    setStatus(null);
    if (found.length > 0) return;
    try {
      const created = await createCompany(api, {
        code: code.trim(),
        name: name.trim(),
        ...(gstin.trim() ? { gstin: gstin.trim() } : {}),
        ...(pan.trim() ? { pan: pan.trim() } : {}),
        ...(stateCode.trim() ? { stateCode: stateCode.trim() } : {}),
        fyLabel: label.trim(),
        fyStart: start!,
        fyEnd: end!,
      });
      await session.refreshCompanies();
      await session.selectCompany(created.companyId);
      setStatus(`Company "${name.trim()}" created`);
      setCode('');
      setName('');
      setGstin('');
      setPan('');
      setStateCode('');
    } catch (e) {
      setProblems([e instanceof Error ? e.message : String(e)]);
    }
  }

  const requestSave = useCommittedAction(save);
  const allowed = session.can('company', 'add');
  useScreenShortcuts('company', { save: requestSave }, allowed);

  return (
    <div>
      <h2>Company & Years</h2>
      <div className="panel">
        <DataTable
          caption="Companies"
          columns={[
            { key: 'code', header: 'Code', value: (c) => c.code },
            { key: 'name', header: 'Company', value: (c) => c.name },
          ]}
          rows={session.companies}
          rowKey={(c) => c.id}
          emptyText="No companies yet"
        />
        {session.company && (
          <>
            <h3 style={{ marginTop: 12 }}>Years of {session.company.name}</h3>
            <DataTable
              caption="Years"
              columns={[
                { key: 'label', header: 'Year', value: (y) => y.label },
                { key: 'status', header: 'Status', value: (y) => y.status },
              ]}
              rows={session.years}
              rowKey={(y) => y.id}
            />
          </>
        )}
      </div>

      {!allowed ? (
        <p className="muted">You do not have the right to create companies.</p>
      ) : (
        <NavRoot className="panel" onLast={requestSave}>
          <h3>New company</h3>
          <div className="form-row">
            <Field label="Code">
              <input aria-label="Code" data-nav="" autoFocus value={code} onChange={(e) => setCode(e.target.value)} style={{ width: 90 }} />
            </Field>
            <Field label="Company name">
              <input aria-label="Company name" data-nav="" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 300 }} />
            </Field>
            <Field label="GSTIN">
              <input aria-label="GSTIN" data-nav="" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} />
            </Field>
            <Field label="PAN">
              <input aria-label="PAN" data-nav="" value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} style={{ width: 120 }} />
            </Field>
            <Field label="State code">
              <input aria-label="State code" data-nav="" value={stateCode} onChange={(e) => setStateCode(e.target.value)} style={{ width: 70 }} />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Year name">
              <input aria-label="Year name" data-nav="" value={label} onChange={(e) => setLabel(e.target.value)} style={{ width: 100 }} />
            </Field>
            <Field label="First day">
              <DateInput label="First day" value={start} ctx={ctx} onChange={setStart} />
            </Field>
            <Field label="Last day">
              <DateInput label="Last day" value={end} ctx={ctx} onChange={setEnd} />
            </Field>
          </div>
          {problems.length > 0 && (
            <ul role="alert" className="err">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {status && (
            <p role="status" className="ok">
              {status}
            </p>
          )}
          <button className="primary" onClick={requestSave}>
            Create company <kbd>Ctrl+S</kbd>
          </button>
        </NavRoot>
      )}
    </div>
  );
}
```
(The test labels the name field "Company name"; the earlier test text types into `Code` then Enter-navigates, so the field order is Code → Company name → GSTIN → PAN → State code → Year name → First day → Last day. Fix the `CompanyScreen` test's `getByLabelText('Year name')` check accordingly: the year name box is reached after `State code` + Enter, which is what the typing sequence in that test does.)

`packages/app/src/renderer/masters/LedgerScreen.tsx`:
```tsx
import { useMemo, useState } from 'react';
import { createLedger } from '../api/endpoints';
import type { LedgerLite } from '../api/types';
import { useScreenShortcuts } from '../keys/useScreenShortcuts';
import { useApi } from '../session/deps';
import { useLookups } from '../session/Lookups';
import { useSession } from '../session/Session';
import { DataTable, type Column } from '../ui/DataTable';
import { Field } from '../ui/Field';
import { Lookup } from '../ui/Lookup';
import { NavRoot } from '../ui/NavRoot';
import { useCommittedAction } from '../ui/useCommittedAction';

const COLUMNS: Column<LedgerLite>[] = [
  { key: 'name', header: 'Account', value: (l) => l.name },
  { key: 'group', header: 'Group', value: (l) => l.groupName },
  { key: 'city', header: 'City', value: (l) => l.city ?? '' },
  { key: 'gstin', header: 'GSTIN', value: (l) => l.gstin ?? '' },
  { key: 'status', header: 'Status', value: (l) => l.status },
];

export function LedgerScreen() {
  const api = useApi();
  const session = useSession();
  const lookups = useLookups();
  const company = session.company;

  const [groupId, setGroupId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [creditDays, setCreditDays] = useState('');
  const [address, setAddress] = useState('');
  const [filter, setFilter] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const groupItems = useMemo(() => lookups.groups.map((g) => ({ id: g.id, label: g.name, sub: String(g.code) })), [lookups.groups]);
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? lookups.ledgers.filter((l) => `${l.name} ${l.city ?? ''} ${l.groupName}`.toLowerCase().includes(q)) : lookups.ledgers;
  }, [lookups.ledgers, filter]);

  function clear() {
    setGroupId(null);
    setName('');
    setCity('');
    setGstin('');
    setPan('');
    setCreditDays('');
    setAddress('');
    setProblems([]);
    setFormKey((k) => k + 1); // remounts the form so the cursor returns to the group
  }

  async function save() {
    const group = lookups.groups.find((g) => g.id === groupId);
    const found: string[] = [];
    if (!group) found.push('Choose the group');
    if (!name.trim()) found.push('Enter the account name');
    setProblems(found);
    setStatus(null);
    if (found.length > 0 || !company) return;
    try {
      await createLedger(api, company.id, {
        groupCode: group!.code,
        name: name.trim(),
        ...(city.trim() ? { city: city.trim() } : {}),
        ...(gstin.trim() ? { gstin: gstin.trim() } : {}),
        ...(pan.trim() ? { pan: pan.trim() } : {}),
        ...(creditDays ? { creditDays: Number(creditDays) } : {}),
        ...(address.trim() ? { address: address.trim() } : {}),
      });
      const saved = name.trim();
      clear();
      setStatus(`Account "${saved}" created`);
      await lookups.reload();
    } catch (e) {
      setProblems([e instanceof Error ? e.message : String(e)]);
    }
  }

  const requestSave = useCommittedAction(save);
  useScreenShortcuts('ledgers', { save: requestSave, new: clear });

  if (!company) return <p className="panel">Choose a company first (F9).</p>;

  return (
    <div>
      <h2>Account Master</h2>
      <NavRoot key={formKey} className="panel" onLast={requestSave}>
        <h3>New account</h3>
        <div className="form-row">
          <Field label="Group">
            <Lookup label="Group" items={groupItems} value={groupId} onChange={setGroupId} autoFocus />
          </Field>
          <Field label="Name">
            <input aria-label="Name" data-nav="" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 280 }} />
          </Field>
          <Field label="City">
            <input aria-label="City" data-nav="" value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label="GSTIN">
            <input aria-label="GSTIN" data-nav="" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} />
          </Field>
          <Field label="PAN">
            <input aria-label="PAN" data-nav="" value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} style={{ width: 120 }} />
          </Field>
          <Field label="Credit days">
            <input aria-label="Credit days" data-nav="" inputMode="numeric" value={creditDays} onChange={(e) => setCreditDays(e.target.value.replace(/\D/g, ''))} style={{ width: 80 }} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Address">
            <input aria-label="Address" data-nav="" value={address} onChange={(e) => setAddress(e.target.value)} style={{ width: 520 }} />
          </Field>
        </div>
        {problems.length > 0 && (
          <ul role="alert" className="err">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {status && (
          <p role="status" className="ok">
            {status}
          </p>
        )}
        <button className="primary" onClick={requestSave}>
          Create account <kbd>Ctrl+S</kbd>
        </button>{' '}
        <span className="muted">Existing accounts cannot be edited yet.</span>
      </NavRoot>

      <div className="panel">
        <Field label="Find account">
          <input aria-label="Find account" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 280 }} />
        </Field>
        <DataTable caption="Accounts" columns={COLUMNS} rows={shown} rowKey={(l) => l.id} emptyText="No accounts match" />
      </div>
    </div>
  );
}
```

`packages/app/src/renderer/masters/OpeningScreen.tsx`:
```tsx
import { useEffect, useMemo, useState } from 'react';
import { fromPaise, toPaise } from '@sas/shared';
import { listOpenings, setOpening, type OpeningRow } from '../api/endpoints';
import { useScreenShortcuts } from '../keys/useScreenShortcuts';
import { useApi } from '../session/deps';
import { useLookups } from '../session/Lookups';
import { useSession } from '../session/Session';
import { DataTable, type Column } from '../ui/DataTable';
import { Field } from '../ui/Field';
import { formatInr, normalizeAmount } from '../ui/format';
import { Lookup } from '../ui/Lookup';
import { MoneyInput } from '../ui/MoneyInput';
import { NavRoot } from '../ui/NavRoot';
import { useCommittedAction } from '../ui/useCommittedAction';

const SIDES = [
  { id: 'Dr', label: 'Dr', sub: 'debit' },
  { id: 'Cr', label: 'Cr', sub: 'credit' },
];

const COLUMNS: Column<OpeningRow>[] = [
  { key: 'name', header: 'Account', value: (r) => r.ledgerName },
  { key: 'group', header: 'Group', value: (r) => r.groupName },
  { key: 'dr', header: 'Debit', numeric: true, value: (r) => (r.side === 'Dr' ? formatInr(r.amount) : '') },
  { key: 'cr', header: 'Credit', numeric: true, value: (r) => (r.side === 'Cr' ? formatInr(r.amount) : '') },
];

export function OpeningScreen() {
  const api = useApi();
  const { company, year } = useSession();
  const lookups = useLookups();

  const [rows, setRows] = useState<OpeningRow[]>([]);
  const [ledgerId, setLedgerId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [side, setSide] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  async function reload() {
    if (!company || !year) return;
    try {
      setRows(await listOpenings(api, company.id, year.id));
    } catch (e) {
      setProblems([e instanceof Error ? e.message : String(e)]);
    }
  }
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, year?.id]);

  const sums = useMemo(() => {
    let dr = 0n;
    let cr = 0n;
    for (const r of rows) (r.side === 'Dr' ? (dr += toPaise(r.amount)) : (cr += toPaise(r.amount)));
    return { dr, cr, diff: dr - cr };
  }, [rows]);

  async function save() {
    const found: string[] = [];
    if (!ledgerId) found.push('Choose the account');
    if (!normalizeAmount(amount) || toPaise(normalizeAmount(amount)) <= 0n) found.push('Enter the amount');
    if (side !== 'Dr' && side !== 'Cr') found.push('Choose Dr or Cr');
    setProblems(found);
    setStatus(null);
    if (found.length > 0 || !year) return;
    try {
      await setOpening(api, ledgerId!, { yearId: year.id, amount: normalizeAmount(amount), side: side as 'Dr' | 'Cr' });
      const name = lookups.ledgers.find((l) => l.id === ledgerId)?.name ?? '';
      setLedgerId(null);
      setAmount('');
      setSide(null);
      setFormKey((k) => k + 1);
      setStatus(`Opening balance saved for ${name}`);
      await reload();
    } catch (e) {
      setProblems([e instanceof Error ? e.message : String(e)]);
    }
  }
  const requestSave = useCommittedAction(save);
  useScreenShortcuts('openings', { save: requestSave });

  if (!company || !year) return <p className="panel">Choose a company and year first (F9).</p>;
  const open = year.status === 'open';

  return (
    <div>
      <h2>Opening Balances — {year.label}</h2>
      {!open ? (
        <p className="muted">Year {year.label} is {year.status}, so its opening balances cannot be changed.</p>
      ) : (
        <NavRoot key={formKey} className="panel" onLast={requestSave}>
          <div className="form-row">
            <Field label="Account">
              <Lookup label="Account" items={lookups.ledgerItems} value={ledgerId} onChange={setLedgerId} autoFocus />
            </Field>
            <Field label="Amount">
              <MoneyInput label="Amount" value={amount} onChange={setAmount} />
            </Field>
            <Field label="Dr / Cr">
              <Lookup label="Dr or Cr" items={SIDES} value={side} onChange={setSide} style={{ width: 90 }} />
            </Field>
          </div>
          {problems.length > 0 && (
            <ul role="alert" className="err">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {status && (
            <p role="status" className="ok">
              {status}
            </p>
          )}
          <button className="primary" onClick={requestSave}>
            Save <kbd>Ctrl+S</kbd>
          </button>
        </NavRoot>
      )}
      <div className="panel">
        <DataTable
          caption="Opening balances"
          columns={COLUMNS}
          rows={rows}
          rowKey={(r) => r.ledgerId}
          emptyText="No opening balances yet"
          footer={{ name: 'Total', dr: formatInr(fromPaise(sums.dr)), cr: formatInr(fromPaise(sums.cr)) }}
        />
        <p className={sums.diff === 0n ? 'ok' : 'err'}>
          {sums.diff === 0n ? 'The opening balances balance.' : `Difference ${formatInr(fromPaise(sums.diff < 0n ? -sums.diff : sums.diff))} ${sums.diff > 0n ? 'Dr' : 'Cr'}`}
        </p>
      </div>
    </div>
  );
}
```
Test-fixture note for this task: the OpeningScreen test passes the side as `cr{Enter}`; the `Lookup` for Dr/Cr ranks `Cr` first when the text is `cr` (names that start with the text come before names that only contain it in their details).

`packages/app/src/renderer/masters/BookScreen.tsx`:
```tsx
import { useState } from 'react';
import { createBook } from '../api/endpoints';
import type { BookLite } from '../api/types';
import { useScreenShortcuts } from '../keys/useScreenShortcuts';
import { useApi } from '../session/deps';
import { useLookups } from '../session/Lookups';
import { useSession } from '../session/Session';
import { DataTable, type Column } from '../ui/DataTable';
import { Field } from '../ui/Field';
import { Lookup } from '../ui/Lookup';
import { NavRoot } from '../ui/NavRoot';
import { useCommittedAction } from '../ui/useCommittedAction';

const TYPES = [
  { id: 'cash', label: 'Cash book' },
  { id: 'bank', label: 'Bank book' },
  { id: 'journal', label: 'Journal book' },
];

export function BookScreen() {
  const api = useApi();
  const company = useSession().company;
  const lookups = useLookups();

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<string | null>(null);
  const [ledgerId, setLedgerId] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const needsLedger = type === 'cash' || type === 'bank';
  const columns: Column<BookLite>[] = [
    { key: 'code', header: 'Code', value: (b) => b.code },
    { key: 'name', header: 'Book', value: (b) => b.name },
    { key: 'type', header: 'Type', value: (b) => b.type },
    { key: 'ledger', header: 'Ledger', value: (b) => lookups.ledgers.find((l) => l.id === b.defaultLedgerId)?.name ?? '' },
  ];

  async function save() {
    const found: string[] = [];
    if (!code.trim()) found.push('Enter a book code');
    if (!name.trim()) found.push('Enter the book name');
    if (!type) found.push('Choose the type of book');
    if (needsLedger && !ledgerId) found.push('Choose the cash or bank ledger of this book');
    setProblems(found);
    setStatus(null);
    if (found.length > 0 || !company) return;
    try {
      await createBook(api, company.id, { code: code.trim(), name: name.trim(), type: type!, ...(needsLedger ? { defaultLedgerId: ledgerId! } : {}) });
      const saved = name.trim();
      setCode('');
      setName('');
      setType(null);
      setLedgerId(null);
      setFormKey((k) => k + 1);
      setStatus(`Book "${saved}" created`);
      await lookups.reload();
    } catch (e) {
      setProblems([e instanceof Error ? e.message : String(e)]);
    }
  }
  const requestSave = useCommittedAction(save);
  useScreenShortcuts('books', { save: requestSave });

  if (!company) return <p className="panel">Choose a company first (F9).</p>;

  return (
    <div>
      <h2>Book Master</h2>
      <NavRoot key={formKey} className="panel" onLast={requestSave}>
        <div className="form-row">
          <Field label="Code">
            <input aria-label="Code" data-nav="" autoFocus value={code} onChange={(e) => setCode(e.target.value)} style={{ width: 90 }} />
          </Field>
          <Field label="Name">
            <input aria-label="Name" data-nav="" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 240 }} />
          </Field>
          <Field label="Type">
            <Lookup label="Type" items={TYPES} value={type} onChange={setType} />
          </Field>
          {needsLedger && (
            <Field label="Cash or bank ledger">
              <Lookup label="Cash or bank ledger" items={lookups.ledgerItems} value={ledgerId} onChange={setLedgerId} />
            </Field>
          )}
        </div>
        {problems.length > 0 && (
          <ul role="alert" className="err">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {status && (
          <p role="status" className="ok">
            {status}
          </p>
        )}
        <button className="primary" onClick={requestSave}>
          Create book <kbd>Ctrl+S</kbd>
        </button>
      </NavRoot>
      <div className="panel">
        <DataTable caption="Books" columns={columns} rows={lookups.books} rowKey={(b) => b.id} emptyText="No books yet" />
      </div>
    </div>
  );
}
```
In the `BookScreen` test the type is chosen with `cash{Enter}` and the ledger with `cash{Enter}`: the first "cash" matches "Cash book" in the Type lookup; the second "cash" matches the ledger "Cash" in the ledger lookup. In the bank-book test the typed sequence is `bank{Enter}cash{Enter}`.

Update `screenComponents.tsx` with the four entries (`company: CompanyScreen, ledgers: LedgerScreen, openings: OpeningScreen, books: BookScreen`) and their imports.

- [ ] **Step 6: Run the tests and the type-check**

Run: `npx vitest run packages/app packages/service/src/api/masters.api.test.ts && npm run typecheck`
Expected: PASS — Company (6), Ledger (6), Opening (5), Book (5), service openings (2) and everything earlier; no type errors. Traps: the Lookup `autoFocus` on `Group` needs the form mounted after the lookups loaded (the tests wait for the grid first); `formKey` remounts the `NavRoot` after saving so `autoFocus` returns the cursor to the first field; the Book screen's ledger box only exists once a cash or bank type is chosen, which is why `Lookup` advances the cursor from a microtask (after React re-rendered); and if `getByRole('grid', …)` finds the `DataTable` but cell queries fail, query cells with `getByText` rather than by ARIA cell role.

- [ ] **Step 7: Commit**

```bash
git add packages/app packages/service
git commit -m "feat(app,service): company, account, opening-balance and book screens; opening balances list endpoint" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 12: Report shell with print, PDF and CSV; Ledger and Cash Book reports

**Files:**
- Modify: `packages/app/src/renderer/ui/DataTable.tsx` (optional `csv` on a column), `styles.css` (print-only block), `api/endpoints.ts` (report endpoints), `shell/screenComponents.tsx`
- Create: `packages/app/src/renderer/reports/csv.ts`, `useReport.ts`, `ReportShell.tsx`, `LedgerReport.tsx`, `CashBookReport.tsx`
- Test: `reports/csv.test.ts`, `reports/ReportShell.test.tsx`, `reports/LedgerReport.test.tsx`, `reports/CashBookReport.test.tsx`

**Interfaces:**
- Consumes: `Column`, `DataTable` (Task 10); `useCommittedAction` (Task 10); `useBridge` (Task 5); `useScreenShortcuts` (Task 3); `queryString` (Task 4).
- Produces:
  - `Column<T>` gains `csv?: (row: T) => string` — the raw value for CSV (for example `1500.00` with no digit grouping); when absent the CSV uses `value`.
  - `toCsv(columns, rows, extra?: { title?: string[]; footer?: string[] }): string` — comma-separated, `\r\n` line ends, cells containing a comma, quote or line break are quoted with doubled quotes, title lines first followed by a blank line. No byte-order mark (the main process adds it when saving).
  - `slug(text: string): string` for file names (keeps letters and digits in any script, so Gujarati names survive).
  - `useReport<T>()` → `{ data: T | null; loading: boolean; error: string | null; run(fetcher: () => Promise<T>): Promise<void>; fail(message: string): void }` (a newer run wins over an older one that finishes late).
  - `<ReportShell screenId title subtitle? filters onRun loading error csv shortcuts?>{result}</ReportShell>` (`shortcuts` limits it to some of `run`/`print`/`pdf`/`csv`; default all four): heading, a print-only header (company, year, title, subtitle), the filters in an Enter-navigation form (Enter on the last filter runs the report), Run / Print / PDF / CSV buttons and their shortcuts (`Ctrl+Enter`, `Ctrl+P`, `Ctrl+Shift+P`, `Ctrl+E`), the error and loading states. `csv` is `() => { fileName: string; text: string } | null`.
  - Endpoints: `ledgerReport(api, { companyId, yearId, ledgerId, from, to })`, `cashBookReport(api, { companyId, yearId, bookId, from, to })` with types `DrCr`, `LedgerReportDto`, `CashBookDayDto`.
  - `<LedgerReport />` (`rLedger`) and `<CashBookReport />` (`rCashBook`).

- [ ] **Step 1: Write the failing tests**

`packages/app/src/renderer/reports/csv.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Column } from '../ui/DataTable';
import { slug, toCsv } from './csv';

interface Row {
  name: string;
  amount: string;
  raw: string;
}
const COLUMNS: Column<Row>[] = [
  { key: 'name', header: 'Name', value: (r) => r.name },
  { key: 'amount', header: 'Amount', numeric: true, value: (r) => r.amount, csv: (r) => r.raw },
];

describe('toCsv', () => {
  it('writes a header, the rows and CRLF line ends', () => {
    expect(toCsv(COLUMNS, [{ name: 'A', amount: '1,000.00', raw: '1000.00' }])).toBe('Name,Amount\r\nA,1000.00\r\n');
  });

  it('uses the raw csv value when a column has one, and the display value otherwise', () => {
    const plain: Column<Row>[] = [{ key: 'amount', header: 'Amount', value: (r) => r.amount }];
    expect(toCsv(plain, [{ name: 'A', amount: '1,000.00', raw: '1000.00' }])).toBe('Amount\r\n"1,000.00"\r\n');
  });

  it('quotes cells with commas, quotes and line breaks', () => {
    const rows: Row[] = [{ name: 'Ramesh, Traders "Surat"\nline2', amount: '1', raw: '1.00' }];
    expect(toCsv(COLUMNS, rows)).toBe('Name,Amount\r\n"Ramesh, Traders ""Surat""\nline2",1.00\r\n');
  });

  it('keeps Gujarati text as it is', () => {
    expect(toCsv(COLUMNS, [{ name: 'રમેશ ટ્રેડર્સ', amount: '1', raw: '1.00' }])).toContain('રમેશ ટ્રેડર્સ,1.00');
  });

  it('puts title lines first, then a blank line, and appends a footer', () => {
    const text = toCsv(COLUMNS, [{ name: 'A', amount: '1', raw: '1.00' }], { title: ['Test Co', 'Ledger: Cash'], footer: ['Total', '1.00'] });
    expect(text).toBe('Test Co\r\nLedger: Cash\r\n\r\nName,Amount\r\nA,1.00\r\nTotal,1.00\r\n');
  });
});

describe('slug', () => {
  it('makes a file-name-safe word, keeping letters of any script', () => {
    expect(slug('Trial Balance')).toBe('trial-balance');
    expect(slug('  Cash / Bank Book!! ')).toBe('cash-bank-book');
    expect(slug('રમેશ ટ્રેડર્સ')).toContain('રમેશ');
    expect(slug('///')).toBe('report');
  });
});
```

`packages/app/src/renderer/reports/ReportShell.test.tsx`:
```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../testing/render';
import { ReportShell } from './ReportShell';

function Harness(props: { onRun: () => void; csv?: () => { fileName: string; text: string } | null; error?: string | null; loading?: boolean }) {
  const [x, setX] = useState('');
  return (
    <ReportShell
      screenId="rTrial"
      title="Test Report"
      subtitle="As on 31-03-2027"
      filters={<input aria-label="Filter" data-nav="" value={x} onChange={(e) => setX(e.target.value)} />}
      onRun={props.onRun}
      loading={props.loading ?? false}
      error={props.error ?? null}
      csv={props.csv ?? (() => null)}
    >
      <p>RESULT</p>
    </ReportShell>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ReportShell', () => {
  it('shows the title, the result, and a print header with company and year', () => {
    renderScreen(<Harness onRun={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Test Report' })).toBeInTheDocument();
    expect(screen.getByText('RESULT')).toBeInTheDocument();
    const header = document.querySelector('.print-only')!;
    expect(header).toHaveTextContent('Test Textiles');
    expect(header).toHaveTextContent('2026-27');
    expect(header).toHaveTextContent('As on 31-03-2027');
  });

  it('runs from the button, Ctrl+Enter, and Enter on the last filter', async () => {
    const user = userEvent.setup();
    const onRun = vi.fn();
    renderScreen(<Harness onRun={onRun} />);
    await user.click(screen.getByRole('button', { name: /Run/ }));
    expect(onRun).toHaveBeenCalledTimes(1);
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(onRun).toHaveBeenCalledTimes(2);
    await user.click(screen.getByLabelText('Filter'));
    await user.keyboard('{Enter}');
    expect(onRun).toHaveBeenCalledTimes(3);
  });

  it('Ctrl+P prints', async () => {
    const user = userEvent.setup();
    const print = vi.fn();
    vi.stubGlobal('print', print);
    renderScreen(<Harness onRun={() => {}} />);
    await user.keyboard('{Control>}p{/Control}');
    expect(print).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('Ctrl+Shift+P saves a PDF through the main process', async () => {
    const user = userEvent.setup();
    const { bridge } = renderScreen(<Harness onRun={() => {}} />);
    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    expect(await screen.findByText('PDF saved')).toBeInTheDocument();
    expect(bridge.pdfs).toEqual(['test-report.pdf']);
  });

  it('Ctrl+E saves the CSV, or says to run the report first', async () => {
    const user = userEvent.setup();
    const { bridge } = renderScreen(<Harness onRun={() => {}} csv={() => ({ fileName: 'x.csv', text: 'a,b\r\n' })} />);
    await user.keyboard('{Control>}e{/Control}');
    expect(await screen.findByText('CSV saved')).toBeInTheDocument();
    expect(bridge.saved).toEqual([{ suggestedName: 'x.csv', data: 'a,b\r\n', mime: 'text/csv' }]);
  });

  it('asks to run the report first when there is nothing to export', async () => {
    const user = userEvent.setup();
    const { bridge } = renderScreen(<Harness onRun={() => {}} />);
    await user.keyboard('{Control>}e{/Control}');
    expect(await screen.findByText(/run the report first/i)).toBeInTheDocument();
    expect(bridge.saved).toEqual([]);
  });

  it('shows the error and the loading state', () => {
    const { unmount } = renderScreen(<Harness onRun={() => {}} error="Cannot reach the server." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach the server.');
    unmount();
    renderScreen(<Harness onRun={() => {}} loading />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
```

`packages/app/src/renderer/reports/LedgerReport.test.tsx`:
```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import type { LedgerReportDto } from '../api/endpoints';
import { renderScreen } from '../testing/render';
import { LedgerReport } from './LedgerReport';

const DTO: LedgerReportDto = {
  ledgerName: 'Cash',
  opening: { amount: '1000.00', side: 'Dr' },
  rows: [
    { date: '2026-05-10', voucherNo: 1, bookCode: 'CB', narration: 'Ramesh Traders', debit: '1234567.50', credit: '0.00', balance: { amount: '1235567.50', side: 'Dr' } },
    { date: '2026-05-12', voucherNo: 2, bookCode: 'CB', narration: null, debit: '0.00', credit: '200.00', balance: { amount: '1235367.50', side: 'Dr' } },
  ],
  totalDebit: '1234567.50',
  totalCredit: '200.00',
  closing: { amount: '1235367.50', side: 'Dr' },
};

function setup(reply: () => unknown = () => DTO) {
  return renderScreen(<LedgerReport />, { routes: [{ method: 'GET', path: '/api/reports/ledger', reply }] });
}

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('combobox', { name: 'Account' }));
  await user.keyboard('cash{Enter}');
  const from = screen.getByLabelText('From');
  await user.clear(from);
  await user.type(from, '01042026{Enter}');
  await user.type(screen.getByLabelText('To'), '{Control>}a{/Control}31052026');
}

describe('LedgerReport', () => {
  it('asks for the account before calling the server', async () => {
    const user = userEvent.setup();
    const { api } = setup();
    await screen.findByRole('combobox', { name: 'Account' });
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose the account');
    expect(api.calls.some((c) => c.path.startsWith('/api/reports'))).toBe(false);
  });

  it('shows the opening balance, the rows in Indian format with Dr/Cr, the totals and the closing balance', async () => {
    const user = userEvent.setup();
    const { api } = setup();
    await fill(user);
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(await screen.findByText(/Opening balance/)).toHaveTextContent('1,000.00 Dr');
    const grid = screen.getByRole('grid', { name: 'Ledger' });
    expect(within(grid).getByRole('row', { name: /^10-05-2026 1 CB Ramesh Traders/ })).toHaveTextContent('12,34,567.50');
    expect(within(grid).getByRole('row', { name: /^10-05-2026/ })).toHaveTextContent('12,35,567.50 Dr');
    expect(within(grid).getByText('Total').closest('tr')).toHaveTextContent('12,35,367.50 Dr');
    expect(api.calls.find((c) => c.path.startsWith('/api/reports/ledger'))!.path).toBe(
      '/api/reports/ledger?companyId=c1&yearId=y1&ledgerId=l-cash&from=2026-04-01&to=2026-05-31',
    );
  });

  it('exports a CSV with raw amounts and a title block', async () => {
    const user = userEvent.setup();
    const { bridge } = setup();
    await fill(user);
    await user.keyboard('{Control>}{Enter}{/Control}');
    await screen.findByText(/Opening balance/);
    await user.keyboard('{Control>}e{/Control}');
    await screen.findByText('CSV saved');
    expect(bridge.saved[0]!.mime).toBe('text/csv');
    expect(bridge.saved[0]!.suggestedName).toBe('ledger-cash.csv');
    expect(bridge.saved[0]!.data).toContain('Test Textiles\r\n2026-27\r\nLedger: Cash');
    expect(bridge.saved[0]!.data).toContain('10-05-2026,1,CB,Ramesh Traders,1234567.50,0.00,1235567.50 Dr');
  });

  it('refuses an end date before the start date', async () => {
    const user = userEvent.setup();
    setup();
    await fill(user);
    const to = screen.getByLabelText('To');
    await user.clear(to);
    await user.type(to, '01032026');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent(/end date is before the start date/i);
  });

  it('shows the server\'s message', async () => {
    const user = userEvent.setup();
    setup(() => {
      throw new ApiError(403, 'FORBIDDEN', 'You do not have access to one of these accounts');
    });
    await fill(user);
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have access to one of these accounts');
  });
});
```

`packages/app/src/renderer/reports/CashBookReport.test.tsx`:
```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { CashBookDayDto } from '../api/endpoints';
import { renderScreen } from '../testing/render';
import { CashBookReport } from './CashBookReport';

const DAYS: CashBookDayDto[] = [
  { date: '2026-05-10', opening: { amount: '1000.00', side: 'Dr' }, receipts: '800.00', payments: '0.00', closing: { amount: '1800.00', side: 'Dr' } },
  { date: '2026-05-12', opening: { amount: '1800.00', side: 'Dr' }, receipts: '0.00', payments: '200.00', closing: { amount: '1600.00', side: 'Dr' } },
];

describe('CashBookReport', () => {
  it('shows one line per day with opening, receipts, payments and closing', async () => {
    const user = userEvent.setup();
    const { api } = renderScreen(<CashBookReport />, { routes: [{ method: 'GET', path: '/api/reports/cash-book', reply: () => DAYS }] });
    await screen.findByRole('combobox', { name: 'Book' });
    await user.click(screen.getByRole('combobox', { name: 'Book' }));
    await user.keyboard('cash{Enter}');
    await user.keyboard('{Control>}{Enter}{/Control}');
    const row = await screen.findByRole('row', { name: /^10-05-2026/ });
    expect(row).toHaveTextContent('1,000.00 Dr');
    expect(row).toHaveTextContent('800.00');
    expect(row).toHaveTextContent('1,800.00 Dr');
    expect(api.calls.find((c) => c.path.startsWith('/api/reports/cash-book'))!.path).toMatch(/bookId=b-cash/);
  });

  it('only offers cash and bank books', async () => {
    const user = userEvent.setup();
    renderScreen(<CashBookReport />);
    await user.click(await screen.findByRole('combobox', { name: 'Book' }));
    await user.keyboard('{ArrowDown}');
    const options = screen.getAllByRole('option').map((o) => o.textContent ?? '');
    expect(options.some((o) => o.includes('Cash Book'))).toBe(true);
    expect(options.some((o) => o.includes('Journal'))).toBe(false);
  });

  it('asks for the book first', async () => {
    const user = userEvent.setup();
    renderScreen(<CashBookReport />);
    await screen.findByRole('combobox', { name: 'Book' });
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose the book');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/app/src/renderer/reports`
Expected: FAIL — cannot find the report modules.

- [ ] **Step 3: Small edits to existing files**

In `ui/DataTable.tsx` add to `Column<T>`:
```ts
  /** Raw text for CSV export (for example 1500.00 without digit grouping). Defaults to `value`. */
  csv?: (row: T) => string;
```
Append to `styles.css`:
```css
.print-only { display: none; }
@media print {
  .print-only { display: block; margin-bottom: 8px; }
}
```
Append to `api/endpoints.ts`:
```ts
export interface DrCr {
  amount: string;
  side: 'Dr' | 'Cr';
}

export interface LedgerReportDto {
  ledgerName: string;
  opening: DrCr;
  rows: { date: string; voucherNo: number; bookCode: string; narration: string | null; debit: string; credit: string; balance: DrCr }[];
  totalDebit: string;
  totalCredit: string;
  closing: DrCr;
}

export interface CashBookDayDto {
  date: string;
  opening: DrCr;
  receipts: string;
  payments: string;
  closing: DrCr;
}

export const ledgerReport = (api: ApiClient, p: { companyId: string; yearId: string; ledgerId: string; from: string; to: string }) =>
  api.request<LedgerReportDto>('GET', `/api/reports/ledger${queryString(p)}`);

export const cashBookReport = (api: ApiClient, p: { companyId: string; yearId: string; bookId: string; from: string; to: string }) =>
  api.request<CashBookDayDto[]>('GET', `/api/reports/cash-book${queryString(p)}`);
```

- [ ] **Step 4: Write the implementation**

`packages/app/src/renderer/reports/csv.ts`:
```ts
import type { Column } from '../ui/DataTable';

const NEEDS_QUOTES = /[",\r\n]/;
const cell = (text: string) => (NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

export function toCsv<T>(columns: Column<T>[], rows: T[], extra: { title?: string[]; footer?: string[] } = {}): string {
  const lines: string[][] = [];
  for (const t of extra.title ?? []) lines.push([t]);
  if (extra.title?.length) lines.push([]);
  lines.push(columns.map((c) => c.header));
  for (const r of rows) lines.push(columns.map((c) => (c.csv ?? c.value)(r)));
  if (extra.footer) lines.push(extra.footer);
  return lines.map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** A file-name-safe word. Letters and digits of any script are kept (Gujarati names stay readable). */
export function slug(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'report';
}
```

`packages/app/src/renderer/reports/useReport.ts`:
```ts
import { useRef, useState } from 'react';

export function useReport<T>() {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  async function run(fetcher: () => Promise<T>): Promise<void> {
    const mine = ++latest.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      if (mine === latest.current) setData(result);
    } catch (e) {
      if (mine === latest.current) {
        setData(null);
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (mine === latest.current) setLoading(false);
    }
  }

  /** Report a problem found before calling the server (a missing filter). Cancels any run in flight. */
  function fail(message: string): void {
    latest.current++;
    setData(null);
    setLoading(false);
    setError(message);
  }

  return { data, loading, error, run, fail };
}
```

`packages/app/src/renderer/reports/ReportShell.tsx`:
```tsx
import { useState, type ReactNode } from 'react';
import { useScreenShortcuts } from '../keys/useScreenShortcuts';
import { useBridge } from '../session/deps';
import { useSession } from '../session/Session';
import type { ScreenId } from '../shell/screens';
import { NavRoot } from '../ui/NavRoot';
import { slug } from './csv';

interface Props {
  screenId: ScreenId;
  title: string;
  /** Printed under the title: the filters in words. */
  subtitle?: string;
  filters: ReactNode;
  /** Already wrapped with useCommittedAction by the report, so it sees the latest filter values. */
  onRun: () => void;
  loading: boolean;
  error: string | null;
  csv: () => { fileName: string; text: string } | null;
  /** Which of the standard shortcuts (and their buttons) this report offers. Must be declared for the screen. Default: all four. */
  shortcuts?: ReportAction[];
  children: ReactNode;
}

export type ReportAction = 'run' | 'print' | 'pdf' | 'csv';

export function ReportShell({ screenId, title, subtitle, filters, onRun, loading, error, csv, shortcuts = ['run', 'print', 'pdf', 'csv'], children }: Props) {
  const bridge = useBridge();
  const { company, year } = useSession();
  const [note, setNote] = useState<string | null>(null);

  async function saveCsv() {
    const out = csv();
    if (!out) {
      setNote('Run the report first, then export it');
      return;
    }
    setNote((await bridge.saveFile({ suggestedName: out.fileName, data: out.text, mime: 'text/csv' })) ? 'CSV saved' : null);
  }
  async function savePdf() {
    setNote((await bridge.printToPdf({ suggestedName: `${slug(title)}.pdf` })) ? 'PDF saved' : null);
  }

  const handlers: Record<ReportAction, () => void> = { run: onRun, print: () => window.print(), pdf: () => void savePdf(), csv: () => void saveCsv() };
  useScreenShortcuts(screenId, Object.fromEntries(shortcuts.map((id) => [id, handlers[id]])));

  return (
    <div>
      <h2>{title}</h2>
      <div className="print-only">
        <strong>{company?.name}</strong> — {year?.label}
        <br />
        {title}
        {subtitle ? ` — ${subtitle}` : ''}
      </div>
      <NavRoot className="panel no-print" onLast={onRun}>
        <div className="form-row">{filters}</div>
        <button className="primary" onClick={onRun}>
          Run <kbd>Ctrl+Enter</kbd>
        </button>{' '}
        {shortcuts.includes('print') && (
          <>
            <button onClick={() => window.print()}>
              Print <kbd>Ctrl+P</kbd>
            </button>{' '}
          </>
        )}
        {shortcuts.includes('pdf') && (
          <>
            <button onClick={() => void savePdf()}>
              PDF <kbd>Ctrl+Shift+P</kbd>
            </button>{' '}
          </>
        )}
        {shortcuts.includes('csv') && (
          <button onClick={() => void saveCsv()}>
            CSV <kbd>Ctrl+E</kbd>
          </button>
        )}
      </NavRoot>
      {note && (
        <p role="status" className="ok no-print">
          {note}
        </p>
      )}
      {error && (
        <p role="alert" className="err">
          {error}
        </p>
      )}
      {loading && <p className="muted">Loading…</p>}
      {children}
    </div>
  );
}
```

`packages/app/src/renderer/reports/LedgerReport.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { ledgerReport, type LedgerReportDto } from '../api/endpoints';
import { useApi } from '../session/deps';
import { useLookups } from '../session/Lookups';
import { useSession } from '../session/Session';
import { clampToYear, formatDisplay, todayIso, type DateCtx } from '../ui/dates';
import { DataTable, type Column } from '../ui/DataTable';
import { DateInput } from '../ui/DateInput';
import { Field } from '../ui/Field';
import { formatDrCr, formatInr } from '../ui/format';
import { Lookup } from '../ui/Lookup';
import { useCommittedAction } from '../ui/useCommittedAction';
import { slug, toCsv } from './csv';
import { ReportShell } from './ReportShell';
import { useReport } from './useReport';

type Row = LedgerReportDto['rows'][number];

const COLUMNS: Column<Row>[] = [
  { key: 'date', header: 'Date', value: (r) => formatDisplay(r.date) },
  { key: 'no', header: 'Vch', value: (r) => String(r.voucherNo) },
  { key: 'book', header: 'Book', value: (r) => r.bookCode },
  { key: 'narration', header: 'Narration', value: (r) => r.narration ?? '' },
  { key: 'debit', header: 'Debit', numeric: true, value: (r) => formatInr(r.debit), csv: (r) => r.debit },
  { key: 'credit', header: 'Credit', numeric: true, value: (r) => formatInr(r.credit), csv: (r) => r.credit },
  { key: 'balance', header: 'Balance', numeric: true, value: (r) => formatDrCr(r.balance), csv: (r) => `${r.balance.amount} ${r.balance.side}` },
];

export function LedgerReport() {
  const api = useApi();
  const { company, year } = useSession();
  const lookups = useLookups();
  const [ledgerId, setLedgerId] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(year?.startDate ?? null);
  const [to, setTo] = useState<string | null>(year ? clampToYear(todayIso(), year.startDate, year.endDate) : null);
  const report = useReport<LedgerReportDto>();

  const requestRun = useCommittedAction(() => {
    if (!company || !year) return;
    if (!ledgerId) return report.fail('Choose the account');
    if (!from || !to) return report.fail('Enter both dates');
    if (to < from) return report.fail('The end date is before the start date');
    return report.run(() => ledgerReport(api, { companyId: company.id, yearId: year.id, ledgerId, from, to }));
  });

  // a new company or year makes any shown report out of date
  useEffect(() => report.fail(''), [company?.id, year?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!company || !year) return <p className="panel">Choose a company and year first (F9).</p>;
  const ctx: DateCtx = { yearStart: year.startDate, yearEnd: year.endDate, base: clampToYear(todayIso(), year.startDate, year.endDate) };
  const data = report.data;

  return (
    <ReportShell
      screenId="rLedger"
      title="Ledger"
      subtitle={data ? `${data.ledgerName}, ${from ? formatDisplay(from) : ''} to ${to ? formatDisplay(to) : ''}` : undefined}
      onRun={requestRun}
      loading={report.loading}
      error={report.error || null}
      filters={
        <>
          <Field label="Account">
            <Lookup label="Account" items={lookups.ledgerItems} value={ledgerId} onChange={setLedgerId} autoFocus />
          </Field>
          <Field label="From">
            <DateInput label="From" value={from} ctx={ctx} onChange={setFrom} />
          </Field>
          <Field label="To">
            <DateInput label="To" value={to} ctx={ctx} onChange={setTo} />
          </Field>
        </>
      }
      csv={() =>
        data && {
          fileName: `ledger-${slug(data.ledgerName)}.csv`,
          text: toCsv(COLUMNS, data.rows, {
            title: [company.name, year.label, `Ledger: ${data.ledgerName}`, `Opening balance: ${data.opening.amount} ${data.opening.side}`],
            footer: ['', '', '', 'Total', data.totalDebit, data.totalCredit, `${data.closing.amount} ${data.closing.side}`],
          }),
        }
      }
    >
      {data && (
        <>
          <p>
            Opening balance <strong>{formatDrCr(data.opening)}</strong>
          </p>
          <DataTable
            caption="Ledger"
            columns={COLUMNS}
            rows={data.rows}
            rowKey={(r) => `${r.date}-${r.voucherNo}-${r.bookCode}-${r.debit}-${r.credit}`}
            emptyText="No entries in this period"
            footer={{ narration: 'Total', debit: formatInr(data.totalDebit), credit: formatInr(data.totalCredit), balance: formatDrCr(data.closing) }}
          />
        </>
      )}
    </ReportShell>
  );
}
```
(The `useEffect` that clears the report on company/year change calls `report.fail('')`, which sets an empty error string; the shell treats an empty string as no error because `report.error || null` is passed.)

`packages/app/src/renderer/reports/CashBookReport.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { cashBookReport, type CashBookDayDto } from '../api/endpoints';
import { useApi } from '../session/deps';
import { useLookups } from '../session/Lookups';
import { useSession } from '../session/Session';
import { clampToYear, formatDisplay, todayIso, type DateCtx } from '../ui/dates';
import { DataTable, type Column } from '../ui/DataTable';
import { DateInput } from '../ui/DateInput';
import { Field } from '../ui/Field';
import { formatDrCr, formatInr } from '../ui/format';
import { Lookup } from '../ui/Lookup';
import { useCommittedAction } from '../ui/useCommittedAction';
import { slug, toCsv } from './csv';
import { ReportShell } from './ReportShell';
import { useReport } from './useReport';

const COLUMNS: Column<CashBookDayDto>[] = [
  { key: 'date', header: 'Date', value: (d) => formatDisplay(d.date) },
  { key: 'opening', header: 'Opening', numeric: true, value: (d) => formatDrCr(d.opening), csv: (d) => `${d.opening.amount} ${d.opening.side}` },
  { key: 'receipts', header: 'Receipts', numeric: true, value: (d) => formatInr(d.receipts), csv: (d) => d.receipts },
  { key: 'payments', header: 'Payments', numeric: true, value: (d) => formatInr(d.payments), csv: (d) => d.payments },
  { key: 'closing', header: 'Closing', numeric: true, value: (d) => formatDrCr(d.closing), csv: (d) => `${d.closing.amount} ${d.closing.side}` },
];

export function CashBookReport() {
  const api = useApi();
  const { company, year } = useSession();
  const lookups = useLookups();
  const [bookId, setBookId] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(year?.startDate ?? null);
  const [to, setTo] = useState<string | null>(year ? clampToYear(todayIso(), year.startDate, year.endDate) : null);
  const report = useReport<CashBookDayDto[]>();

  const requestRun = useCommittedAction(() => {
    if (!company || !year) return;
    if (!bookId) return report.fail('Choose the book');
    if (!from || !to) return report.fail('Enter both dates');
    if (to < from) return report.fail('The end date is before the start date');
    return report.run(() => cashBookReport(api, { companyId: company.id, yearId: year.id, bookId, from, to }));
  });

  useEffect(() => report.fail(''), [company?.id, year?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!company || !year) return <p className="panel">Choose a company and year first (F9).</p>;
  const ctx: DateCtx = { yearStart: year.startDate, yearEnd: year.endDate, base: clampToYear(todayIso(), year.startDate, year.endDate) };
  const bookName = lookups.books.find((b) => b.id === bookId)?.name ?? '';
  const days = report.data;

  return (
    <ReportShell
      screenId="rCashBook"
      title="Cash / Bank Book"
      subtitle={days ? `${bookName}, ${from ? formatDisplay(from) : ''} to ${to ? formatDisplay(to) : ''}` : undefined}
      onRun={requestRun}
      loading={report.loading}
      error={report.error || null}
      filters={
        <>
          <Field label="Book">
            <Lookup label="Book" items={lookups.bookItems('receipt')} value={bookId} onChange={setBookId} autoFocus />
          </Field>
          <Field label="From">
            <DateInput label="From" value={from} ctx={ctx} onChange={setFrom} />
          </Field>
          <Field label="To">
            <DateInput label="To" value={to} ctx={ctx} onChange={setTo} />
          </Field>
        </>
      }
      csv={() =>
        days && {
          fileName: `cash-book-${slug(bookName)}.csv`,
          text: toCsv(COLUMNS, days, { title: [company.name, year.label, `Book: ${bookName}`] }),
        }
      }
    >
      {days && <DataTable caption="Cash book" columns={COLUMNS} rows={days} rowKey={(d) => d.date} emptyText="No entries in this period" />}
    </ReportShell>
  );
}
```
Register `rLedger: LedgerReport, rCashBook: CashBookReport` in `screenComponents.tsx`.

- [ ] **Step 5: Run the tests and the type-check**

Run: `npx vitest run packages/app && npm run typecheck`
Expected: PASS — csv (6), ReportShell (7), LedgerReport (5), CashBookReport (3) and everything earlier; no type errors. Traps: `Ctrl+Shift+P` needs the Shift key held while `p` is pressed — userEvent reports `key: 'P'`, which `matchesKey` upper-cases; the date typed into `To` with `{Control>}a{/Control}` first selects the existing text so the typing replaces it.

- [ ] **Step 6: Commit**

```bash
git add packages/app
git commit -m "feat(app): report shell with print, PDF and CSV, plus the Ledger and Cash Book reports" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Trial Balance, Profit & Loss, Balance Sheet and Outstanding Ageing screens

**Files:**
- Modify: `packages/app/src/renderer/api/endpoints.ts`, `shell/screenComponents.tsx`
- Create: `packages/app/src/renderer/reports/layout.ts`, `FinancialReports.tsx`, `AgeingReport.tsx`
- Test: `reports/layout.test.ts`, `reports/FinancialReports.test.tsx`, `reports/AgeingReport.test.tsx`

**Interfaces:**
- Consumes: `ReportShell`, `useReport`, `toCsv`, `slug` (Task 12); `DataTable`, `Column` (Task 10).
- Produces:
  - Endpoint DTOs and calls: `trialBalanceReport(api, { companyId, yearId, asOn })`, `profitLossReport(...)`, `balanceSheetReport(...)`, `ageingReport(api, { companyId, asOn, side?, ledgerId? })` with types `TrialBalanceDto`, `SectionDto`, `ProfitLossDto`, `BalanceSheetDto`, `AgeingDto` (they mirror the Plan B responses).
  - `layout.ts`: `Line = { label: string; amount: string; level: 0 | 1 }`; `flattenSection(section: SectionDto): Line[]` (a group line, then its ledgers indented one level); `SideRow = { left: Line | null; right: Line | null }`; `sideBySide(left: Line[], right: Line[]): SideRow[]`; `profitLossSides(dto): { left: Line[]; right: Line[]; leftTotal: string; rightTotal: string }` (expenses on the left, income on the right; a profit is added to the left as "Net Profit", a loss to the right as "Net Loss"); `balanceSheetSides(dto): { left: Line[]; right: Line[]; leftTotal: string; rightTotal: string }` (liabilities on the left plus a profit; assets on the right plus a loss).
  - `<TrialBalanceReport />` (`rTrial`: ledger-wise or group-wise, totals, and a visible warning when the debit and credit totals differ), `<ProfitLossReport />` (`rPL`), `<BalanceSheetReport />` (`rBS`), `<AgeingReport />` (`rAgeing`: filter by As-on date, debtors/creditors/all, and account).
  - Each report opens already run for today (limited to the financial year) and re-runs with `Ctrl+Enter`.

- [ ] **Step 1: Write the failing tests**

`packages/app/src/renderer/reports/layout.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { BalanceSheetDto, ProfitLossDto, SectionDto } from '../api/endpoints';
import { balanceSheetSides, flattenSection, profitLossSides, sideBySide } from './layout';

const section = (groups: { code: number; name: string; amount: string; ledgers: [string, string][] }[], total: string): SectionDto => ({
  groups: groups.map((g) => ({ code: g.code, name: g.name, amount: g.amount, ledgers: g.ledgers.map(([name, amount], i) => ({ ledgerId: `${g.code}-${i}`, name, amount })) })),
  total,
});

describe('flattenSection', () => {
  it('lists each group and then its ledgers, indented', () => {
    const lines = flattenSection(section([{ code: 29, name: 'Trading Income', amount: '3000.00', ledgers: [['Sales', '3000.00']] }], '3000.00'));
    expect(lines).toEqual([
      { label: 'Trading Income', amount: '3000.00', level: 0 },
      { label: 'Sales', amount: '3000.00', level: 1 },
    ]);
  });
  it('is empty for an empty section', () => {
    expect(flattenSection({ groups: [], total: '0.00' })).toEqual([]);
  });
});

describe('sideBySide', () => {
  it('pairs lines up and pads the shorter side', () => {
    const a = [{ label: 'a1', amount: '1', level: 0 as const }, { label: 'a2', amount: '2', level: 0 as const }];
    const b = [{ label: 'b1', amount: '3', level: 0 as const }];
    expect(sideBySide(a, b)).toEqual([
      { left: a[0], right: b[0] },
      { left: a[1], right: null },
    ]);
    expect(sideBySide([], [])).toEqual([]);
  });
});

const PL: ProfitLossDto = {
  income: section([{ code: 29, name: 'Trading Income', amount: '3000.00', ledgers: [['Sales', '3000.00']] }], '3000.00'),
  expense: section([{ code: 32, name: 'Profit & Loss Expense', amount: '400.00', ledgers: [['Rent', '400.00']] }], '400.00'),
  netProfit: '2600.00',
};

describe('profitLossSides', () => {
  it('puts expenses on the left and income on the right, and adds a profit to the left so both sides total the same', () => {
    const s = profitLossSides(PL);
    expect(s.left.map((l) => l.label)).toEqual(['Profit & Loss Expense', 'Rent', 'Net Profit']);
    expect(s.left.at(-1)).toEqual({ label: 'Net Profit', amount: '2600.00', level: 0 });
    expect(s.right.map((l) => l.label)).toEqual(['Trading Income', 'Sales']);
    expect(s.leftTotal).toBe('3000.00');
    expect(s.rightTotal).toBe('3000.00');
  });
  it('adds a loss to the right', () => {
    const s = profitLossSides({ ...PL, income: section([], '0.00'), netProfit: '-400.00' });
    expect(s.right.at(-1)).toEqual({ label: 'Net Loss', amount: '400.00', level: 0 });
    expect(s.leftTotal).toBe('400.00');
    expect(s.rightTotal).toBe('400.00');
  });
});

const BS: BalanceSheetDto = {
  assets: section(
    [
      { code: 16, name: 'Cash-in-Hand', amount: '10600.00', ledgers: [['Cash', '10600.00']] },
      { code: 42, name: 'Sundry Debtors', amount: '2000.00', ledgers: [['Ramesh Traders', '2000.00']] },
    ],
    '12600.00',
  ),
  liabilities: section([{ code: 5, name: 'Capital Account', amount: '10000.00', ledgers: [['Capital', '10000.00']] }], '10000.00'),
  netProfit: '2600.00',
  totalAssets: '12600.00',
  totalLiabilities: '12600.00',
  difference: '0.00',
};

describe('balanceSheetSides', () => {
  it('puts liabilities and a profit on the left and assets on the right', () => {
    const s = balanceSheetSides(BS);
    expect(s.left.map((l) => l.label)).toEqual(['Capital Account', 'Capital', 'Net Profit']);
    expect(s.right.map((l) => l.label)).toEqual(['Cash-in-Hand', 'Cash', 'Sundry Debtors', 'Ramesh Traders']);
    expect(s.leftTotal).toBe('12600.00');
    expect(s.rightTotal).toBe('12600.00');
  });
  it('puts a loss on the right', () => {
    const s = balanceSheetSides({ ...BS, netProfit: '-500.00', totalAssets: '13100.00', totalLiabilities: '13100.00' });
    expect(s.right.at(-1)).toEqual({ label: 'Net Loss', amount: '500.00', level: 0 });
    expect(s.left.some((l) => l.label === 'Net Profit')).toBe(false);
    expect(s.leftTotal).toBe('13100.00');
    expect(s.rightTotal).toBe('13100.00');
  });
});
```

`packages/app/src/renderer/reports/FinancialReports.test.tsx`:
```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { BalanceSheetDto, ProfitLossDto, SectionDto, TrialBalanceDto } from '../api/endpoints';
import { renderScreen } from '../testing/render';
import { BalanceSheetReport, ProfitLossReport, TrialBalanceReport } from './FinancialReports';

const TB: TrialBalanceDto = {
  rows: [
    { ledgerId: 'l1', ledgerName: 'Cash', groupCode: 16, groupName: 'Cash-in-Hand', debit: '1060000.00', credit: '0.00' },
    { ledgerId: 'l2', ledgerName: 'Capital', groupCode: 5, groupName: 'Capital Account', debit: '0.00', credit: '1000000.00' },
  ],
  groups: [
    { code: 5, name: 'Capital Account', nature: 'liability', debit: '0.00', credit: '1000000.00' },
    { code: 16, name: 'Cash-in-Hand', nature: 'asset', debit: '1060000.00', credit: '0.00' },
  ],
  totalDebit: '1060000.00',
  totalCredit: '1000000.00',
  difference: '60000.00',
};

describe('TrialBalanceReport', () => {
  it('runs on open for the as-on date and shows ledgers with Indian formatting and the totals', async () => {
    const { api } = renderScreen(<TrialBalanceReport />, { routes: [{ method: 'GET', path: '/api/reports/trial-balance', reply: () => TB }] });
    const grid = await screen.findByRole('grid', { name: 'Trial balance' });
    expect(within(grid).getByRole('row', { name: /Cash/ })).toHaveTextContent('10,60,000.00');
    expect(within(grid).getByText('Total').closest('tr')).toHaveTextContent('10,00,000.00');
    expect(api.calls.find((c) => c.path.startsWith('/api/reports/trial-balance'))!.path).toMatch(/^\/api\/reports\/trial-balance\?companyId=c1&yearId=y1&asOn=\d{4}-\d{2}-\d{2}$/);
  });

  it('warns loudly when debit and credit totals differ', async () => {
    renderScreen(<TrialBalanceReport />, { routes: [{ method: 'GET', path: '/api/reports/trial-balance', reply: () => TB }] });
    expect(await screen.findByText(/does not tally.*60,000\.00/i)).toBeInTheDocument();
  });

  it('shows no warning when it tallies', async () => {
    renderScreen(<TrialBalanceReport />, {
      routes: [{ method: 'GET', path: '/api/reports/trial-balance', reply: () => ({ ...TB, totalCredit: '1060000.00', difference: '0.00' }) }],
    });
    await screen.findByRole('grid', { name: 'Trial balance' });
    expect(screen.queryByText(/does not tally/i)).toBeNull();
  });

  it('can be viewed group-wise', async () => {
    const user = userEvent.setup();
    renderScreen(<TrialBalanceReport />, { routes: [{ method: 'GET', path: '/api/reports/trial-balance', reply: () => TB }] });
    await screen.findByRole('grid', { name: 'Trial balance' });
    await user.click(screen.getByRole('combobox', { name: 'View' }));
    await user.keyboard('group{Enter}');
    const grid = await screen.findByRole('grid', { name: 'Trial balance by group' });
    expect(within(grid).getByText('Capital Account')).toBeInTheDocument();
    expect(within(grid).queryByText('Cash')).toBeNull();
  });

  it('exports a CSV of what is on screen', async () => {
    const user = userEvent.setup();
    const { bridge } = renderScreen(<TrialBalanceReport />, { routes: [{ method: 'GET', path: '/api/reports/trial-balance', reply: () => TB }] });
    await screen.findByRole('grid', { name: 'Trial balance' });
    await user.keyboard('{Control>}e{/Control}');
    await screen.findByText('CSV saved');
    expect(bridge.saved[0]!.suggestedName).toBe('trial-balance.csv');
    expect(bridge.saved[0]!.data).toContain('Cash,Cash-in-Hand,1060000.00,0.00');
  });
});

const section = (name: string, ledger: string, amount: string): SectionDto => ({
  groups: [{ code: 1, name, amount, ledgers: [{ ledgerId: 'x', name: ledger, amount }] }],
  total: amount,
});

describe('ProfitLossReport', () => {
  const PL: ProfitLossDto = { income: section('Trading Income', 'Sales', '300000.00'), expense: section('Profit & Loss Expense', 'Rent', '40000.00'), netProfit: '260000.00' };
  it('shows expenses on the left, income on the right, and the net profit that balances the sides', async () => {
    renderScreen(<ProfitLossReport />, { routes: [{ method: 'GET', path: '/api/reports/profit-loss', reply: () => PL }] });
    const grid = await screen.findByRole('grid', { name: 'Profit and loss' });
    expect(within(grid).getByText('Net Profit').closest('tr')).toHaveTextContent('2,60,000.00');
    expect(within(grid).getByText('Rent')).toBeInTheDocument();
    expect(within(grid).getByText('Sales')).toBeInTheDocument();
    expect(within(grid).getAllByText('3,00,000.00').length).toBeGreaterThan(0); // both side totals
  });
});

describe('BalanceSheetReport', () => {
  const BS: BalanceSheetDto = {
    assets: section('Cash-in-Hand', 'Cash', '1260000.00'),
    liabilities: section('Capital Account', 'Capital', '1000000.00'),
    netProfit: '260000.00',
    totalAssets: '1260000.00',
    totalLiabilities: '1260000.00',
    difference: '0.00',
  };
  it('shows liabilities (with the profit) on the left and assets on the right', async () => {
    renderScreen(<BalanceSheetReport />, { routes: [{ method: 'GET', path: '/api/reports/balance-sheet', reply: () => BS }] });
    const grid = await screen.findByRole('grid', { name: 'Balance sheet' });
    expect(within(grid).getByText('Capital')).toBeInTheDocument();
    expect(within(grid).getByText('Net Profit')).toBeInTheDocument();
    expect(within(grid).getByText('Cash')).toBeInTheDocument();
    expect(screen.queryByText(/does not tally/i)).toBeNull();
  });
  it('warns when the sheet does not balance', async () => {
    renderScreen(<BalanceSheetReport />, {
      routes: [{ method: 'GET', path: '/api/reports/balance-sheet', reply: () => ({ ...BS, totalAssets: '1270000.00', difference: '10000.00' }) }],
    });
    expect(await screen.findByText(/does not balance.*10,000\.00/i)).toBeInTheDocument();
  });
});
```

`packages/app/src/renderer/reports/AgeingReport.test.tsx`:
```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AgeingDto } from '../api/endpoints';
import { renderScreen } from '../testing/render';
import { AgeingReport } from './AgeingReport';

const DTO: AgeingDto = {
  bucketLabels: ['0-30', '31-60', '61-90', '90+'],
  rows: [{ ledgerId: 'l-ramesh', ledgerName: 'Ramesh Traders', side: 'Dr', buckets: ['100000.00', '200.00', '0.00', '400.00'], total: '100600.00', onAccount: '500.00', net: '100100.00' }],
  totals: { buckets: ['100000.00', '200.00', '0.00', '400.00'], total: '100600.00', onAccount: '500.00', net: '100100.00' },
};

describe('AgeingReport', () => {
  it('runs on open and shows one column per age bucket', async () => {
    const { api } = renderScreen(<AgeingReport />, { routes: [{ method: 'GET', path: '/api/reports/ageing', reply: () => DTO }] });
    const grid = await screen.findByRole('grid', { name: 'Outstanding ageing' });
    for (const label of ['0-30', '31-60', '61-90', '90+']) expect(within(grid).getByRole('columnheader', { name: label })).toBeInTheDocument();
    const row = within(grid).getByRole('row', { name: /Ramesh Traders/ });
    expect(row).toHaveTextContent('1,00,000.00');
    expect(row).toHaveTextContent('1,00,600.00');
    expect(row).toHaveTextContent('500.00');
    expect(within(grid).getByText('Total').closest('tr')).toHaveTextContent('1,00,100.00');
    expect(api.calls.find((c) => c.path.startsWith('/api/reports/ageing'))!.path).toMatch(/^\/api\/reports\/ageing\?companyId=c1&asOn=\d{4}-\d{2}-\d{2}$/);
  });

  it('filters by debtors or creditors', async () => {
    const user = userEvent.setup();
    const { api } = renderScreen(<AgeingReport />, { routes: [{ method: 'GET', path: '/api/reports/ageing', reply: () => DTO }] });
    await screen.findByRole('grid', { name: 'Outstanding ageing' });
    await user.click(screen.getByRole('combobox', { name: 'Show' }));
    await user.keyboard('debtors{Enter}');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await screen.findByRole('grid', { name: 'Outstanding ageing' });
    const last = api.calls.filter((c) => c.path.startsWith('/api/reports/ageing')).at(-1)!;
    expect(last.path).toContain('side=Dr');
  });

  it('exports a CSV with one column per bucket', async () => {
    const user = userEvent.setup();
    const { bridge } = renderScreen(<AgeingReport />, { routes: [{ method: 'GET', path: '/api/reports/ageing', reply: () => DTO }] });
    await screen.findByRole('grid', { name: 'Outstanding ageing' });
    await user.keyboard('{Control>}e{/Control}');
    await screen.findByText('CSV saved');
    expect(bridge.saved[0]!.data).toContain('Account,Side,0-30,31-60,61-90,90+,Total,On account,Net');
    expect(bridge.saved[0]!.data).toContain('Ramesh Traders,Dr,100000.00,200.00,0.00,400.00,100600.00,500.00,100100.00');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/app/src/renderer/reports`
Expected: FAIL — cannot find `./layout`, `./FinancialReports`, `./AgeingReport`.

- [ ] **Step 3: Write the implementation**

Append to `packages/app/src/renderer/api/endpoints.ts`:
```ts
export interface TrialBalanceDto {
  rows: { ledgerId: string; ledgerName: string; groupCode: number; groupName: string; debit: string; credit: string }[];
  groups: { code: number; name: string; nature: string; debit: string; credit: string }[];
  totalDebit: string;
  totalCredit: string;
  difference: string;
}
export interface SectionDto {
  groups: { code: number; name: string; amount: string; ledgers: { ledgerId: string; name: string; amount: string }[] }[];
  total: string;
}
export interface ProfitLossDto {
  income: SectionDto;
  expense: SectionDto;
  netProfit: string;
}
export interface BalanceSheetDto {
  assets: SectionDto;
  liabilities: SectionDto;
  netProfit: string;
  totalAssets: string;
  totalLiabilities: string;
  difference: string;
}
export interface AgeingDto {
  bucketLabels: string[];
  rows: { ledgerId: string; ledgerName: string; side: 'Dr' | 'Cr'; buckets: string[]; total: string; onAccount: string; net: string }[];
  totals: { buckets: string[]; total: string; onAccount: string; net: string };
}

interface AsOn {
  companyId: string;
  yearId: string;
  asOn: string;
}
export const trialBalanceReport = (api: ApiClient, p: AsOn) => api.request<TrialBalanceDto>('GET', `/api/reports/trial-balance${queryString({ ...p })}`);
export const profitLossReport = (api: ApiClient, p: AsOn) => api.request<ProfitLossDto>('GET', `/api/reports/profit-loss${queryString({ ...p })}`);
export const balanceSheetReport = (api: ApiClient, p: AsOn) => api.request<BalanceSheetDto>('GET', `/api/reports/balance-sheet${queryString({ ...p })}`);
export const ageingReport = (api: ApiClient, p: { companyId: string; asOn: string; side?: 'Dr' | 'Cr'; ledgerId?: string }) =>
  api.request<AgeingDto>('GET', `/api/reports/ageing${queryString({ ...p })}`);
```

`packages/app/src/renderer/reports/layout.ts`:
```ts
import { fromPaise, toPaise } from '@sas/shared';
import type { BalanceSheetDto, ProfitLossDto, SectionDto } from '../api/endpoints';

export interface Line {
  label: string;
  amount: string;
  level: 0 | 1;
}
export interface SideRow {
  left: Line | null;
  right: Line | null;
}

export function flattenSection(section: SectionDto): Line[] {
  return section.groups.flatMap((g) => [
    { label: g.name, amount: g.amount, level: 0 as const },
    ...g.ledgers.map((l) => ({ label: l.name, amount: l.amount, level: 1 as const })),
  ]);
}

export function sideBySide(left: Line[], right: Line[]): SideRow[] {
  const rows: SideRow[] = [];
  for (let i = 0; i < Math.max(left.length, right.length); i++) rows.push({ left: left[i] ?? null, right: right[i] ?? null });
  return rows;
}

const total = (...amounts: string[]) => fromPaise(amounts.reduce((sum, a) => sum + toPaise(a), 0n));
const abs = (amount: string) => fromPaise(toPaise(amount) < 0n ? -toPaise(amount) : toPaise(amount));

interface Sides {
  left: Line[];
  right: Line[];
  leftTotal: string;
  rightTotal: string;
}

/** Indian T-format: expenses (debit side) on the left, income on the right; the result goes on the lighter side. */
export function profitLossSides(dto: ProfitLossDto): Sides {
  const left = flattenSection(dto.expense);
  const right = flattenSection(dto.income);
  const profit = toPaise(dto.netProfit);
  if (profit > 0n) left.push({ label: 'Net Profit', amount: dto.netProfit, level: 0 });
  else if (profit < 0n) right.push({ label: 'Net Loss', amount: abs(dto.netProfit), level: 0 });
  return {
    left,
    right,
    leftTotal: total(dto.expense.total, profit > 0n ? dto.netProfit : '0'),
    rightTotal: total(dto.income.total, profit < 0n ? abs(dto.netProfit) : '0'),
  };
}

/** Liabilities (with a profit) on the left, assets (with a loss) on the right. */
export function balanceSheetSides(dto: BalanceSheetDto): Sides {
  const left = flattenSection(dto.liabilities);
  const right = flattenSection(dto.assets);
  const profit = toPaise(dto.netProfit);
  if (profit > 0n) left.push({ label: 'Net Profit', amount: dto.netProfit, level: 0 });
  else if (profit < 0n) right.push({ label: 'Net Loss', amount: abs(dto.netProfit), level: 0 });
  return { left, right, leftTotal: dto.totalLiabilities, rightTotal: dto.totalAssets };
}
```

`packages/app/src/renderer/reports/FinancialReports.tsx`:
```tsx
import { useEffect, useState } from 'react';
import {
  balanceSheetReport,
  profitLossReport,
  trialBalanceReport,
  type BalanceSheetDto,
  type ProfitLossDto,
  type TrialBalanceDto,
} from '../api/endpoints';
import { useApi } from '../session/deps';
import { useSession } from '../session/Session';
import type { ScreenId } from '../shell/screens';
import { clampToYear, formatDisplay, todayIso, type DateCtx } from '../ui/dates';
import { DataTable, type Column } from '../ui/DataTable';
import { DateInput } from '../ui/DateInput';
import { Field } from '../ui/Field';
import { formatInr } from '../ui/format';
import { Lookup } from '../ui/Lookup';
import { useCommittedAction } from '../ui/useCommittedAction';
import { toCsv } from './csv';
import { balanceSheetSides, profitLossSides, sideBySide, type Line, type SideRow } from './layout';
import { ReportShell } from './ReportShell';
import { useReport } from './useReport';

/** Shared by the three "as on a date" reports: the date filter, running on open, and the year/company guard. */
function useAsOnReport<T>(fetcher: (p: { companyId: string; yearId: string; asOn: string }) => Promise<T>) {
  const { company, year } = useSession();
  const [asOn, setAsOn] = useState<string | null>(year ? clampToYear(todayIso(), year.startDate, year.endDate) : null);
  const report = useReport<T>();

  const runNow = () => {
    if (!company || !year) return;
    if (!asOn) return report.fail('Enter the date');
    return report.run(() => fetcher({ companyId: company.id, yearId: year.id, asOn }));
  };
  const requestRun = useCommittedAction(runNow);
  useEffect(() => {
    void runNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, year?.id]);

  const ctx: DateCtx | null = year ? { yearStart: year.startDate, yearEnd: year.endDate, base: clampToYear(todayIso(), year.startDate, year.endDate) } : null;
  return { company, year, asOn, setAsOn, report, requestRun, ctx };
}

function AsOnFilter({ asOn, setAsOn, ctx }: { asOn: string | null; setAsOn: (v: string | null) => void; ctx: DateCtx }) {
  return (
    <Field label="As on">
      <DateInput label="As on" value={asOn} ctx={ctx} onChange={setAsOn} autoFocus />
    </Field>
  );
}

const needsCompany = <p className="panel">Choose a company and year first (F9).</p>;

// ---------------------------------------------------------------- trial balance

type TbRow = TrialBalanceDto['rows'][number];
type TbGroup = TrialBalanceDto['groups'][number];

const LEDGER_COLUMNS: Column<TbRow>[] = [
  { key: 'name', header: 'Account', value: (r) => r.ledgerName },
  { key: 'group', header: 'Group', value: (r) => r.groupName },
  { key: 'debit', header: 'Debit', numeric: true, value: (r) => formatInr(r.debit), csv: (r) => r.debit },
  { key: 'credit', header: 'Credit', numeric: true, value: (r) => formatInr(r.credit), csv: (r) => r.credit },
];
const GROUP_COLUMNS: Column<TbGroup>[] = [
  { key: 'name', header: 'Group', value: (g) => g.name },
  { key: 'nature', header: 'Nature', value: (g) => g.nature },
  { key: 'debit', header: 'Debit', numeric: true, value: (g) => formatInr(g.debit), csv: (g) => g.debit },
  { key: 'credit', header: 'Credit', numeric: true, value: (g) => formatInr(g.credit), csv: (g) => g.credit },
];
const VIEWS = [
  { id: 'ledger', label: 'Ledger-wise' },
  { id: 'group', label: 'Group-wise' },
];

export function TrialBalanceReport() {
  const api = useApi();
  const { company, year, asOn, setAsOn, report, requestRun, ctx } = useAsOnReport((p) => trialBalanceReport(api, p));
  const [view, setView] = useState<string | null>('ledger');
  if (!company || !year || !ctx) return needsCompany;
  const tb = report.data;
  const byGroup = view === 'group';

  return (
    <ReportShell
      screenId="rTrial"
      title="Trial Balance"
      subtitle={asOn ? `as on ${formatDisplay(asOn)}` : undefined}
      onRun={requestRun}
      loading={report.loading}
      error={report.error || null}
      filters={
        <>
          <AsOnFilter asOn={asOn} setAsOn={setAsOn} ctx={ctx} />
          <Field label="View">
            <Lookup label="View" items={VIEWS} value={view} onChange={setView} />
          </Field>
        </>
      }
      csv={() =>
        tb && {
          fileName: 'trial-balance.csv',
          text: byGroup
            ? toCsv(GROUP_COLUMNS, tb.groups, { title: [company.name, year.label, `Trial balance by group as on ${asOn}`], footer: ['Total', '', tb.totalDebit, tb.totalCredit] })
            : toCsv(LEDGER_COLUMNS, tb.rows, { title: [company.name, year.label, `Trial balance as on ${asOn}`], footer: ['Total', '', tb.totalDebit, tb.totalCredit] }),
        }
      }
    >
      {tb && tb.difference !== '0.00' && (
        <p role="alert" className="err">
          The trial balance does not tally: debits and credits differ by {formatInr(tb.difference.replace('-', ''))}
          {tb.difference.startsWith('-') ? ' (credits are more)' : ' (debits are more)'}.
        </p>
      )}
      {tb && byGroup && (
        <DataTable caption="Trial balance by group" columns={GROUP_COLUMNS} rows={tb.groups} rowKey={(g) => String(g.code)} footer={{ name: 'Total', debit: formatInr(tb.totalDebit), credit: formatInr(tb.totalCredit) }} />
      )}
      {tb && !byGroup && (
        <DataTable caption="Trial balance" columns={LEDGER_COLUMNS} rows={tb.rows} rowKey={(r) => r.ledgerId} emptyText="No balances" footer={{ name: 'Total', debit: formatInr(tb.totalDebit), credit: formatInr(tb.totalCredit) }} />
      )}
    </ReportShell>
  );
}

// ------------------------------------------------- profit and loss / balance sheet

type SideRowIx = SideRow & { i: number };
const indexed = (rows: SideRow[]): SideRowIx[] => rows.map((r, i) => ({ ...r, i }));

function sideColumns(leftHeader: string, rightHeader: string): Column<SideRowIx>[] {
  const text = (l: Line | null) => (l ? `${l.level === 1 ? '   ' : ''}${l.label}` : '');
  const money = (l: Line | null) => (l ? formatInr(l.amount) : '');
  const node = (l: Line | null) => (l ? <span style={{ paddingLeft: l.level * 16, fontWeight: l.level === 0 ? 600 : 400 }}>{l.label}</span> : null);
  return [
    { key: 'left', header: leftHeader, value: (r) => text(r.left), render: (r) => node(r.left) },
    { key: 'leftAmount', header: 'Amount', numeric: true, value: (r) => money(r.left), csv: (r) => r.left?.amount ?? '' },
    { key: 'right', header: rightHeader, value: (r) => text(r.right), render: (r) => node(r.right) },
    { key: 'rightAmount', header: 'Amount', numeric: true, value: (r) => money(r.right), csv: (r) => r.right?.amount ?? '' },
  ];
}

export function ProfitLossReport() {
  const api = useApi();
  const { company, year, asOn, setAsOn, report, requestRun, ctx } = useAsOnReport((p) => profitLossReport(api, p));
  if (!company || !year || !ctx) return needsCompany;
  const pl = report.data;
  const sides = pl && profitLossSides(pl);
  const rows = sides ? indexed(sideBySide(sides.left, sides.right)) : [];
  const columns = sideColumns('Expenses', 'Income');

  return (
    <ReportShell
      screenId="rPL"
      title="Profit & Loss"
      subtitle={asOn ? `for the year up to ${formatDisplay(asOn)}` : undefined}
      onRun={requestRun}
      loading={report.loading}
      error={report.error || null}
      filters={<AsOnFilter asOn={asOn} setAsOn={setAsOn} ctx={ctx} />}
      csv={() =>
        sides && {
          fileName: 'profit-and-loss.csv',
          text: toCsv(columns, rows, { title: [company.name, year.label, `Profit & Loss up to ${asOn}`], footer: ['Total', sides.leftTotal, 'Total', sides.rightTotal] }),
        }
      }
    >
      {sides && (
        <DataTable
          caption="Profit and loss"
          columns={columns}
          rows={rows}
          rowKey={(r) => String(r.i)}
          emptyText="No income or expenses"
          footer={{ left: 'Total', leftAmount: formatInr(sides.leftTotal), right: 'Total', rightAmount: formatInr(sides.rightTotal) }}
        />
      )}
    </ReportShell>
  );
}

export function BalanceSheetReport() {
  const api = useApi();
  const { company, year, asOn, setAsOn, report, requestRun, ctx } = useAsOnReport((p) => balanceSheetReport(api, p));
  if (!company || !year || !ctx) return needsCompany;
  const bs = report.data;
  const sides = bs && balanceSheetSides(bs);
  const rows = sides ? indexed(sideBySide(sides.left, sides.right)) : [];
  const columns = sideColumns('Liabilities', 'Assets');

  return (
    <ReportShell
      screenId="rBS"
      title="Balance Sheet"
      subtitle={asOn ? `as on ${formatDisplay(asOn)}` : undefined}
      onRun={requestRun}
      loading={report.loading}
      error={report.error || null}
      filters={<AsOnFilter asOn={asOn} setAsOn={setAsOn} ctx={ctx} />}
      csv={() =>
        sides && {
          fileName: 'balance-sheet.csv',
          text: toCsv(columns, rows, { title: [company.name, year.label, `Balance sheet as on ${asOn}`], footer: ['Total', sides.leftTotal, 'Total', sides.rightTotal] }),
        }
      }
    >
      {bs && bs.difference !== '0.00' && (
        <p role="alert" className="err">
          The balance sheet does not balance: assets and liabilities differ by {formatInr(bs.difference.replace('-', ''))}.
        </p>
      )}
      {sides && (
        <DataTable
          caption="Balance sheet"
          columns={columns}
          rows={rows}
          rowKey={(r) => String(r.i)}
          emptyText="Nothing to show"
          footer={{ left: 'Total', leftAmount: formatInr(sides.leftTotal), right: 'Total', rightAmount: formatInr(sides.rightTotal) }}
        />
      )}
    </ReportShell>
  );
}
```
`packages/app/src/renderer/reports/AgeingReport.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { ageingReport, type AgeingDto } from '../api/endpoints';
import { useApi } from '../session/deps';
import { useLookups } from '../session/Lookups';
import { useSession } from '../session/Session';
import { clampToYear, formatDisplay, todayIso, type DateCtx } from '../ui/dates';
import { DataTable, type Column } from '../ui/DataTable';
import { DateInput } from '../ui/DateInput';
import { Field } from '../ui/Field';
import { formatInr } from '../ui/format';
import { Lookup } from '../ui/Lookup';
import { useCommittedAction } from '../ui/useCommittedAction';
import { toCsv } from './csv';
import { ReportShell } from './ReportShell';
import { useReport } from './useReport';

type Row = AgeingDto['rows'][number];
const SHOW = [
  { id: 'all', label: 'All' },
  { id: 'Dr', label: 'Debtors (they owe us)' },
  { id: 'Cr', label: 'Creditors (we owe them)' },
];

function columnsFor(labels: string[]): Column<Row>[] {
  return [
    { key: 'name', header: 'Account', value: (r) => r.ledgerName },
    { key: 'side', header: 'Side', value: (r) => r.side },
    ...labels.map((label, i) => ({
      key: `b${i}`,
      header: label,
      numeric: true,
      value: (r: Row) => formatInr(r.buckets[i] ?? '0.00'),
      csv: (r: Row) => r.buckets[i] ?? '0.00',
    })),
    { key: 'total', header: 'Total', numeric: true, value: (r) => formatInr(r.total), csv: (r) => r.total },
    { key: 'onAccount', header: 'On account', numeric: true, value: (r) => formatInr(r.onAccount), csv: (r) => r.onAccount },
    { key: 'net', header: 'Net', numeric: true, value: (r) => formatInr(r.net), csv: (r) => r.net },
  ];
}

export function AgeingReport() {
  const api = useApi();
  const { company, year } = useSession();
  const lookups = useLookups();
  const [asOn, setAsOn] = useState<string | null>(year ? clampToYear(todayIso(), year.startDate, year.endDate) : null);
  const [show, setShow] = useState<string | null>('all');
  const [ledgerId, setLedgerId] = useState<string | null>(null);
  const report = useReport<AgeingDto>();

  const runNow = () => {
    if (!company) return;
    if (!asOn) return report.fail('Enter the date');
    return report.run(() =>
      ageingReport(api, { companyId: company.id, asOn, ...(show === 'Dr' || show === 'Cr' ? { side: show } : {}), ...(ledgerId ? { ledgerId } : {}) }),
    );
  };
  const requestRun = useCommittedAction(runNow);
  useEffect(() => {
    void runNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, year?.id]);

  if (!company || !year) return <p className="panel">Choose a company and year first (F9).</p>;
  const ctx: DateCtx = { yearStart: year.startDate, yearEnd: year.endDate, base: clampToYear(todayIso(), year.startDate, year.endDate) };
  const data = report.data;
  const columns = columnsFor(data?.bucketLabels ?? ['0-30', '31-60', '61-90', '90+']);

  return (
    <ReportShell
      screenId="rAgeing"
      title="Outstanding Ageing"
      subtitle={asOn ? `as on ${formatDisplay(asOn)}` : undefined}
      onRun={requestRun}
      loading={report.loading}
      error={report.error || null}
      filters={
        <>
          <Field label="As on">
            <DateInput label="As on" value={asOn} ctx={ctx} onChange={setAsOn} autoFocus />
          </Field>
          <Field label="Show">
            <Lookup label="Show" items={SHOW} value={show} onChange={setShow} />
          </Field>
          <Field label="Account (optional)">
            <Lookup label="Account" items={lookups.ledgerItems} value={ledgerId} onChange={setLedgerId} />
          </Field>
        </>
      }
      csv={() =>
        data && {
          fileName: 'outstanding-ageing.csv',
          text: toCsv(columns, data.rows, {
            title: [company.name, year.label, `Outstanding ageing as on ${asOn}`],
            footer: ['Total', '', ...data.totals.buckets, data.totals.total, data.totals.onAccount, data.totals.net],
          }),
        }
      }
    >
      {data && (
        <DataTable
          caption="Outstanding ageing"
          columns={columns}
          rows={data.rows}
          rowKey={(r) => `${r.ledgerId}-${r.side}`}
          emptyText="No pending bills"
          footer={{
            name: 'Total',
            ...Object.fromEntries(data.totals.buckets.map((b, i) => [`b${i}`, formatInr(b)])),
            total: formatInr(data.totals.total),
            onAccount: formatInr(data.totals.onAccount),
            net: formatInr(data.totals.net),
          }}
        />
      )}
    </ReportShell>
  );
}
```
Register `rTrial: TrialBalanceReport, rPL: ProfitLossReport, rBS: BalanceSheetReport, rAgeing: AgeingReport` in `screenComponents.tsx`.

- [ ] **Step 4: Run the tests and the type-check**

Run: `npx vitest run packages/app && npm run typecheck`
Expected: PASS — layout (7), FinancialReports (9), AgeingReport (3) and everything earlier; no type errors. If a financial test cannot find a footer cell by text, remember `Total` appears once per footer; use `within(grid).getAllByText('Total')[0]` for the two-sided sheets (they print `Total` on both sides).

- [ ] **Step 5: Commit**

```bash
git add packages/app
git commit -m "feat(app): trial balance, profit and loss, balance sheet and ageing screens" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Users and rights screen

**Files (service):**
- Modify: `packages/service/src/security/rights.ts` (add `getUserAccess`), `packages/service/src/api/routes/admin.ts` (add the route), `packages/service/src/security/rights.test.ts`, `packages/service/src/api/admin.api.test.ts`

**Files (app):**
- Modify: `packages/app/src/renderer/api/endpoints.ts`, `shell/screenComponents.tsx`
- Create: `packages/app/src/renderer/admin/UsersScreen.tsx`
- Test: `admin/UsersScreen.test.tsx`

**Interfaces:**
- Produces (service): `getUserAccess(q, userId): Promise<{ blockedGroupIds: string[]; hiddenCompanyIds: string[] }>`; route `GET /api/users/:id/access` (needs `users` + `find`).
- Produces (app endpoints): `listUsers`, `createUser`, `setUserStatus`, `getUserRights`, `setUserRights`, `getUserAccess`, `setBlockedGroups`, `setHiddenCompanies` with types `UserRow = { id; username; isAdmin; status; email: string | null }`, `RightsMap = Record<ModuleName, Rights>`, `UserAccess = { blockedGroupIds: string[]; hiddenCompanyIds: string[] }`.
- Produces (screen): `<UsersScreen />` (`users`) and `mergeBlocked(existingIds, companyGroupIds, selectedIds): string[]`.

**Why `mergeBlocked`:** the server stores a user's blocked groups across all companies and replaces the whole list on save, but the screen only shows the groups of the current company. Saving must keep the blocks for other companies and replace only the current company's.

**Behaviour:** left, the users (Enter selects one); right, for the selected user: a Block/Unblock button (not for yourself), the rights grid (one row per module, columns Show in menu / View / Add / Edit / Delete / Print), the account groups of the current company to hide, and the companies to hide. `Ctrl+S` saves rights, hidden groups and hidden companies. `Ctrl+N` opens the new-user form (username, password, email, administrator, may export the audit log). Administrators have every right, so their grid is read-only with a note.

- [ ] **Step 1: Service — failing tests, then the code**

Append to `packages/service/src/security/rights.test.ts` (inside the file, importing `getUserAccess` with the other imports from `./rights`):
```ts
describe('getUserAccess', () => {
  it('returns what was set for blocked groups and hidden companies', async () => {
    const other = await createCompany(db, { code: 'C2', name: 'Other Co', fyLabel: '2026-27', fyStart: '2026-04-01', fyEnd: '2027-03-31' });
    await setBlockedGroups(db, clerk.userId, [await groupId(42)]);
    await setHiddenCompanies(db, clerk.userId, [other.companyId]);
    const access = await getUserAccess(db, clerk.userId);
    expect(access.blockedGroupIds).toEqual([await groupId(42)]);
    expect(access.hiddenCompanyIds).toEqual([other.companyId]);
  });
  it('is empty for a user with no restrictions', async () => {
    expect(await getUserAccess(db, clerk.userId)).toEqual({ blockedGroupIds: [], hiddenCompanyIds: [] });
  });
});
```
Append to `packages/service/src/api/admin.api.test.ts` inside `describe('users', …)`:
```ts
  it('reads back blocked groups and hidden companies, for users with the find right only', async () => {
    const clerk = await f.addUser('clerk');
    const g42 = (await f.db.query<{ id: string }>('SELECT id FROM account_groups WHERE company_id = $1 AND code = 42', [f.s.companyId]))[0]!.id;
    await send('PUT', `/api/users/${clerk.id}/blocked-groups`, { groupIds: [g42] });
    await send('PUT', `/api/users/${clerk.id}/hidden-companies`, { companyIds: [f.s.companyId] });
    const r = await send('GET', `/api/users/${clerk.id}/access`);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ blockedGroupIds: [g42], hiddenCompanyIds: [f.s.companyId] });
    const plain = await f.addUser('plain');
    expect((await send('GET', `/api/users/${clerk.id}/access`, undefined, plain.token)).statusCode).toBe(403);
  });
```
Run `npx vitest run packages/service/src/security/rights.test.ts packages/service/src/api/admin.api.test.ts` — Expected: the new tests FAIL.

Add to `packages/service/src/security/rights.ts`:
```ts
export async function getUserAccess(q: Queryable, userId: string): Promise<{ blockedGroupIds: string[]; hiddenCompanyIds: string[] }> {
  const groups = await q.query<{ group_id: string }>('SELECT group_id FROM user_blocked_groups WHERE user_id = $1', [userId]);
  const companies = await q.query<{ company_id: string }>('SELECT company_id FROM user_hidden_companies WHERE user_id = $1', [userId]);
  return { blockedGroupIds: groups.map((g) => g.group_id), hiddenCompanyIds: companies.map((c) => c.company_id) };
}
```
and in `api/routes/admin.ts` (add `getUserAccess` to the `rights` import) next to the other user routes:
```ts
  app.get('/api/users/:id/access', async (req) => {
    const { id } = idParam.parse(req.params);
    await assertRight(db, req.actor!, 'users', 'find');
    return getUserAccess(db, id);
  });
```
Run the two service test files again — Expected: PASS.

- [ ] **Step 2: App — append the endpoints**

Append to `packages/app/src/renderer/api/endpoints.ts` (add `ModuleName`, `Rights` to the `@sas/shared` import at the top):
```ts
export interface UserRow {
  id: string;
  username: string;
  isAdmin: boolean;
  status: string;
  email: string | null;
}
export type RightsMap = Record<ModuleName, Rights>;
export interface UserAccess {
  blockedGroupIds: string[];
  hiddenCompanyIds: string[];
}

export const listUsers = (api: ApiClient) => api.request<UserRow[]>('GET', '/api/users');
export const createUser = (api: ApiClient, body: { username: string; password: string; isAdmin?: boolean; email?: string; canExportAudit?: boolean }) =>
  api.request<{ id: string }>('POST', '/api/users', body);
export const setUserStatus = (api: ApiClient, id: string, status: 'active' | 'blocked') => api.request<void>('PUT', `/api/users/${id}/status`, { status });
export const getUserRights = (api: ApiClient, id: string) => api.request<RightsMap>('GET', `/api/users/${id}/rights`);
export const setUserRights = (api: ApiClient, id: string, rights: RightsMap) => api.request<void>('PUT', `/api/users/${id}/rights`, { rights });
export const getUserAccess = (api: ApiClient, id: string) => api.request<UserAccess>('GET', `/api/users/${id}/access`);
export const setBlockedGroups = (api: ApiClient, id: string, groupIds: string[]) => api.request<void>('PUT', `/api/users/${id}/blocked-groups`, { groupIds });
export const setHiddenCompanies = (api: ApiClient, id: string, companyIds: string[]) => api.request<void>('PUT', `/api/users/${id}/hidden-companies`, { companyIds });
```

- [ ] **Step 3: App — write the failing test**

`packages/app/src/renderer/admin/UsersScreen.test.tsx`:
```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MODULES, NO_RIGHTS } from '@sas/shared';
import { ApiError } from '../api/client';
import type { RightsMap, UserRow } from '../api/endpoints';
import type { FakeRoute } from '../testing/fakeClient';
import { renderScreen } from '../testing/render';
import { rightsFor } from '../testing/sampleData';
import { mergeBlocked, UsersScreen } from './UsersScreen';

const USERS: UserRow[] = [
  { id: 'u-boss', username: 'boss', isAdmin: true, status: 'active', email: null },
  { id: 'u-asha', username: 'asha', isAdmin: false, status: 'active', email: 'a@x.in' },
];

function setup(opts: { access?: { blockedGroupIds: string[]; hiddenCompanyIds: string[] }; rights?: RightsMap; extra?: FakeRoute[] } = {}) {
  const puts: { path: string; body: any }[] = [];
  const posts: { path: string; body: any }[] = [];
  const routes: FakeRoute[] = [
    ...(opts.extra ?? []),
    { method: 'GET', path: '/api/users', reply: () => USERS },
    { method: 'GET', path: '/api/users/u-asha/rights', reply: () => opts.rights ?? rightsFor({ cash_book: { show: true, find: true } }) },
    { method: 'GET', path: '/api/users/u-boss/rights', reply: () => rightsFor() },
    { method: 'GET', path: /^\/api\/users\/[^/]+\/access$/, reply: () => opts.access ?? { blockedGroupIds: [], hiddenCompanyIds: [] } },
    { method: 'PUT', path: /^\/api\/users\/[^/]+\/(rights|blocked-groups|hidden-companies|status)$/, reply: ({ path, body }) => void puts.push({ path, body }) },
    { method: 'POST', path: '/api/users', reply: ({ body }) => (posts.push({ path: '/api/users', body }), { id: 'u-new' }) },
  ];
  return { puts, posts, ...renderScreen(<UsersScreen />, { routes, session: { actor: { userId: 'u-boss', username: 'boss', isAdmin: true } } }) };
}

async function selectUser(user: ReturnType<typeof userEvent.setup>, name: string) {
  const grid = await screen.findByRole('grid', { name: 'Users' });
  await user.click(within(grid).getByRole('row', { name: new RegExp(name) }));
  grid.focus();
  await user.keyboard('{Enter}');
}

describe('mergeBlocked', () => {
  it('keeps blocks for other companies and replaces the current company\'s', () => {
    expect(mergeBlocked(['other-1', 'mine-1', 'mine-2'], ['mine-1', 'mine-2', 'mine-3'], ['mine-3'])).toEqual(['other-1', 'mine-3']);
    expect(mergeBlocked([], ['a'], [])).toEqual([]);
    expect(mergeBlocked(['x'], [], ['y'])).toEqual(['x', 'y']);
  });
});

describe('UsersScreen', () => {
  it('lists the users with their role and status', async () => {
    setup();
    const grid = await screen.findByRole('grid', { name: 'Users' });
    expect(within(grid).getByRole('row', { name: /boss/ })).toHaveTextContent('Administrator');
    expect(within(grid).getByRole('row', { name: /asha/ })).toHaveTextContent('active');
  });

  it('Enter on a user loads their rights, hidden groups and hidden companies', async () => {
    const user = userEvent.setup();
    setup({ access: { blockedGroupIds: ['g42'], hiddenCompanyIds: [] } });
    await selectUser(user, 'asha');
    expect(await screen.findByRole('checkbox', { name: 'Cash / bank vouchers: View' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Cash / bank vouchers: Add' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Hide group Sundry Debtors' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Hide group Cash-in-Hand' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Hide company Test Textiles' })).not.toBeChecked();
  });

  it('Ctrl+S saves the whole rights map, the merged hidden groups and the hidden companies', async () => {
    const user = userEvent.setup();
    const { puts } = setup({ access: { blockedGroupIds: ['g-other-company', 'g42'], hiddenCompanyIds: [] } });
    await selectUser(user, 'asha');
    await user.click(await screen.findByRole('checkbox', { name: 'Cash / bank vouchers: Add' }));
    await user.click(screen.getByRole('checkbox', { name: 'Hide group Sundry Debtors' })); // un-hide
    await user.click(screen.getByRole('checkbox', { name: 'Hide group Cash-in-Hand' })); // hide
    await user.click(screen.getByRole('checkbox', { name: 'Hide company Test Textiles' }));
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('status')).toHaveTextContent('Saved asha');
    const rights = puts.find((p) => p.path.endsWith('/rights'))!.body.rights as RightsMap;
    expect(Object.keys(rights).sort()).toEqual([...MODULES].sort());
    expect(rights.cash_book).toEqual({ ...NO_RIGHTS, show: true, find: true, add: true });
    expect(rights.journal).toEqual(NO_RIGHTS);
    expect(puts.find((p) => p.path.endsWith('/blocked-groups'))!.body).toEqual({ groupIds: ['g-other-company', 'g16'] });
    expect(puts.find((p) => p.path.endsWith('/hidden-companies'))!.body).toEqual({ companyIds: ['c1'] });
  });

  it('shows an administrator\'s rights as read-only with an explanation', async () => {
    const user = userEvent.setup();
    setup();
    await selectUser(user, 'boss');
    expect(await screen.findByText(/administrators can do everything/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Cash / bank vouchers: Add' })).toBeDisabled();
  });

  it('blocks and unblocks a user, but not yourself', async () => {
    const user = userEvent.setup();
    const { puts } = setup();
    await selectUser(user, 'asha');
    await user.click(await screen.findByRole('button', { name: 'Block this user' }));
    await waitFor(() => expect(puts).toContainEqual({ path: '/api/users/u-asha/status', body: { status: 'blocked' } }));
    await selectUser(user, 'boss');
    expect(await screen.findByRole('button', { name: 'Block this user' })).toBeDisabled();
  });

  it('Ctrl+N opens the new-user form; Ctrl+S creates the user and selects them', async () => {
    const user = userEvent.setup();
    const { posts } = setup();
    await screen.findByRole('grid', { name: 'Users' });
    await user.keyboard('{Control>}n{/Control}');
    await user.type(await screen.findByLabelText('Username'), 'ravi{Enter}secret12{Enter}ravi@x.in{Enter}');
    await user.click(screen.getByRole('checkbox', { name: 'Administrator' }));
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('status')).toHaveTextContent('User ravi created');
    expect(posts[0]!.body).toEqual({ username: 'ravi', password: 'secret12', email: 'ravi@x.in', isAdmin: true });
  });

  it('shows the server\'s message, for example a short password', async () => {
    const user = userEvent.setup();
    setup({ extra: [{ method: 'POST', path: '/api/users', reply: () => { throw new ApiError(422, 'INVALID_INPUT', 'Password must be at least 6 characters'); } }] });
    await screen.findByRole('grid', { name: 'Users' });
    await user.keyboard('{Control>}n{/Control}');
    await user.type(await screen.findByLabelText('Username'), 'ravi{Enter}123{Enter}');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Password must be at least 6 characters');
  });
});
```
(`sampleData.GROUPS` has ids `g16`, `g32`, `g42`; `Hide group Sundry Debtors` is group `g42`.)

- [ ] **Step 4: Run to verify it fails, then write the screen**

Run: `npx vitest run packages/app/src/renderer/admin/UsersScreen.test.tsx` — Expected: FAIL (cannot find `./UsersScreen`).

`packages/app/src/renderer/admin/UsersScreen.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { MODULES, NO_RIGHTS, type ModuleName, type RightAction } from '@sas/shared';
import {
  createUser,
  getUserAccess,
  getUserRights,
  listUsers,
  setBlockedGroups,
  setHiddenCompanies,
  setUserRights,
  setUserStatus,
  type RightsMap,
  type UserRow,
} from '../api/endpoints';
import { useScreenShortcuts } from '../keys/useScreenShortcuts';
import { useApi } from '../session/deps';
import { useLookups } from '../session/Lookups';
import { useSession } from '../session/Session';
import { DataTable, type Column } from '../ui/DataTable';
import { Field } from '../ui/Field';
import { NavRoot } from '../ui/NavRoot';
import { useCommittedAction } from '../ui/useCommittedAction';

const MODULE_LABELS: Record<ModuleName, string> = {
  company: 'Company & years',
  account_master: 'Account master',
  group_master: 'Group master',
  book_master: 'Book master',
  cash_book: 'Cash / bank vouchers',
  journal: 'Journal vouchers',
  reports: 'Reports',
  users: 'Users & rights',
  utilities: 'Year-end, freeze & backup',
};
const ACTION_LABELS: Record<RightAction, string> = { show: 'Show in menu', find: 'View', add: 'Add', edit: 'Edit', delete: 'Delete', print: 'Print' };
const ACTION_ORDER: RightAction[] = ['show', 'find', 'add', 'edit', 'delete', 'print'];

/** Keep blocks that belong to other companies; replace the current company's with `selected`. */
export function mergeBlocked(existing: string[], companyGroupIds: string[], selected: string[]): string[] {
  const mine = new Set(companyGroupIds);
  return [...existing.filter((id) => !mine.has(id)), ...selected];
}

const COLUMNS: Column<UserRow>[] = [
  { key: 'username', header: 'User', value: (u) => u.username },
  { key: 'role', header: 'Role', value: (u) => (u.isAdmin ? 'Administrator' : 'User') },
  { key: 'status', header: 'Status', value: (u) => u.status },
];

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function UsersScreen() {
  const api = useApi();
  const session = useSession();
  const lookups = useLookups();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [rights, setRights] = useState<RightsMap | null>(null);
  const [blocked, setBlocked] = useState<string[]>([]); // hidden groups of the current company (what the checkboxes show)
  const [otherBlocked, setOtherBlocked] = useState<string[]>([]); // hidden groups of other companies, kept as they are
  const [hiddenCompanies, setHiddenCompaniesState] = useState<string[]>([]);
  const companyGroupIds = lookups.groups.map((g) => g.id);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', email: '', isAdmin: false, canExportAudit: false });
  const [problems, setProblems] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  async function loadUsers() {
    try {
      setUsers(await listUsers(api));
    } catch (e) {
      setProblems([messageOf(e)]);
    }
  }
  useEffect(() => {
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function select(u: UserRow) {
    setCreating(false);
    setSelected(u);
    setRights(null);
    setProblems([]);
    setStatus(null);
    try {
      const [r, a] = await Promise.all([getUserRights(api, u.id), getUserAccess(api, u.id)]);
      setRights(r);
      setBlocked(a.blockedGroupIds.filter((id) => companyGroupIds.includes(id)));
      setOtherBlocked(a.blockedGroupIds.filter((id) => !companyGroupIds.includes(id)));
      setHiddenCompaniesState(a.hiddenCompanyIds);
    } catch (e) {
      setProblems([messageOf(e)]);
    }
  }

  async function save() {
    setProblems([]);
    setStatus(null);
    try {
      if (creating) {
        const found: string[] = [];
        if (!form.username.trim()) found.push('Enter a username');
        if (!form.password) found.push('Enter a password');
        if (found.length > 0) return setProblems(found);
        const { id } = await createUser(api, {
          username: form.username.trim(),
          password: form.password,
          ...(form.email.trim() ? { email: form.email.trim() } : {}),
          ...(form.isAdmin ? { isAdmin: true } : {}),
          ...(form.canExportAudit ? { canExportAudit: true } : {}),
        });
        await loadUsers();
        setStatus(`User ${form.username.trim()} created`);
        setForm({ username: '', password: '', email: '', isAdmin: false, canExportAudit: false });
        setCreating(false);
        const fresh = (await listUsers(api)).find((u) => u.id === id);
        if (fresh) await select(fresh);
        return;
      }
      if (!selected || !rights || selected.isAdmin) return;
      await setUserRights(api, selected.id, rights);
      await setBlockedGroups(api, selected.id, mergeBlocked(otherBlocked, companyGroupIds, blocked));
      await setHiddenCompanies(api, selected.id, hiddenCompanies);
      setStatus(`Saved ${selected.username}`);
    } catch (e) {
      setProblems([messageOf(e)]);
    }
  }
  const requestSave = useCommittedAction(save);
  useScreenShortcuts('users', {
    save: requestSave,
    new: () => {
      setCreating(true);
      setSelected(null);
      setProblems([]);
      setStatus(null);
    },
  });

  async function toggleStatus() {
    if (!selected) return;
    const next = selected.status === 'active' ? 'blocked' : 'active';
    try {
      await setUserStatus(api, selected.id, next);
      await loadUsers();
      setSelected({ ...selected, status: next });
    } catch (e) {
      setProblems([messageOf(e)]);
    }
  }

  const isSelf = selected?.id === session.actor.userId;

  return (
    <div>
      <h2>Users & Rights</h2>
      <div className="panel">
        <DataTable caption="Users" columns={COLUMNS} rows={users} rowKey={(u) => u.id} onOpen={(u) => void select(u)} emptyText="No users" />
        <p className="muted">Press Enter on a user to edit them, or Ctrl+N for a new user.</p>
      </div>

      {creating && (
        <NavRoot className="panel" onLast={requestSave}>
          <h3>New user</h3>
          <div className="form-row">
            <Field label="Username">
              <input aria-label="Username" data-nav="" autoFocus value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </Field>
            <Field label="Password">
              <input aria-label="Password" data-nav="" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <Field label="Email (optional)">
              <input aria-label="Email" data-nav="" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
          </div>
          <label>
            <input type="checkbox" checked={form.isAdmin} onChange={(e) => setForm({ ...form, isAdmin: e.target.checked })} /> Administrator
          </label>{' '}
          <label>
            <input type="checkbox" checked={form.canExportAudit} onChange={(e) => setForm({ ...form, canExportAudit: e.target.checked })} /> May export the audit log
          </label>
          <p>
            <button className="primary" onClick={requestSave}>
              Create user <kbd>Ctrl+S</kbd>
            </button>
          </p>
        </NavRoot>
      )}

      {selected && rights && (
        <div className="panel">
          <h3>{selected.username}</h3>
          <p>
            <button disabled={isSelf} onClick={() => void toggleStatus()}>
              {selected.status === 'active' ? 'Block this user' : 'Unblock this user'}
            </button>{' '}
            {isSelf && <span className="muted">You cannot block yourself.</span>}
          </p>
          {selected.isAdmin && <p className="muted">Administrators can do everything, so their rights are not editable.</p>}
          <table className="data">
            <thead>
              <tr>
                <th>Module</th>
                {ACTION_ORDER.map((a) => (
                  <th key={a}>{ACTION_LABELS[a]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((m) => (
                <tr key={m}>
                  <td>{MODULE_LABELS[m]}</td>
                  {ACTION_ORDER.map((a) => (
                    <td key={a}>
                      <input
                        type="checkbox"
                        aria-label={`${MODULE_LABELS[m]}: ${ACTION_LABELS[a]}`}
                        disabled={selected.isAdmin}
                        checked={rights[m]?.[a] ?? NO_RIGHTS[a]}
                        onChange={(e) => setRights({ ...rights, [m]: { ...(rights[m] ?? NO_RIGHTS), [a]: e.target.checked } })}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ marginTop: 12 }}>Hide account groups ({session.company?.name})</h3>
          <div className="form-row">
            {lookups.groups.map((g) => (
              <label key={g.id}>
                <input
                  type="checkbox"
                  aria-label={`Hide group ${g.name}`}
                  disabled={selected.isAdmin}
                  checked={blocked.includes(g.id)}
                  onChange={(e) => setBlocked(e.target.checked ? [...blocked, g.id] : blocked.filter((id) => id !== g.id))}
                />{' '}
                {g.name}
              </label>
            ))}
          </div>

          <h3>Hide companies</h3>
          <div className="form-row">
            {session.companies.map((c) => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  aria-label={`Hide company ${c.name}`}
                  disabled={selected.isAdmin}
                  checked={hiddenCompanies.includes(c.id)}
                  onChange={(e) => setHiddenCompaniesState(e.target.checked ? [...hiddenCompanies, c.id] : hiddenCompanies.filter((id) => id !== c.id))}
                />{' '}
                {c.name}
              </label>
            ))}
          </div>

          {!selected.isAdmin && (
            <button className="primary" onClick={requestSave}>
              Save <kbd>Ctrl+S</kbd>
            </button>
          )}
        </div>
      )}

      {problems.length > 0 && (
        <ul role="alert" className="err">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {status && (
        <p role="status" className="ok">
          {status}
        </p>
      )}
    </div>
  );
}
```
The test "Ctrl+S saves … merged hidden groups" pins the behaviour: group ids that belong to other companies survive a save, and the current company's ids follow the checkboxes.

Register `users: UsersScreen` in `screenComponents.tsx`.

- [ ] **Step 5: Run the tests and the type-check**

Run: `npx vitest run packages/app packages/service/src/security packages/service/src/api/admin.api.test.ts && npm run typecheck`
Expected: PASS — Users (8), `mergeBlocked`, service access tests and everything earlier; no type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/app packages/service
git commit -m "feat(app,service): users and rights screen; endpoint to read a user's hidden groups and companies" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Utilities (freeze, year-end, backup, restore) and the Audit Log screen

**Files (service):**
- Modify: `packages/service/src/security/rights.ts` (`visibleCompanies` also returns `freezeDate`), `packages/service/src/ops/backup.ts` (add `listBackups`), `packages/service/src/api/routes/admin.ts` (add `GET /api/backups`)
- Modify tests: `security/rights.test.ts`, `ops/backup.test.ts`, `api/admin.api.test.ts`

**Files (app):**
- Modify: `api/types.ts` (`CompanyLite.freezeDate?`), `api/endpoints.ts`, `shell/screenComponents.tsx`
- Create: `packages/app/src/renderer/admin/UtilitiesScreen.tsx`, `AuditScreen.tsx`, `yearSuggestion.ts`
- Test: `admin/yearSuggestion.test.ts`, `admin/UtilitiesScreen.test.tsx`, `admin/AuditScreen.test.tsx`

**Interfaces:**
- Produces (service): `visibleCompanies` rows are now `{ id, code, name, freezeDate: string | null }`; `listBackups(dir): Promise<{ name: string; path: string; size: number; modified: string }[]>` (newest first; only files named like backups; a missing folder gives `[]`); route `GET /api/backups` (needs `utilities` + `find`; `501 NOT_CONFIGURED` without `BACKUP_DIR`).
- Produces (app): endpoints `setFreeze`, `closeYear`, `reopenYear`, `lockYear`, `listBackups`, `runBackup`, `restoreBackup`, `auditLog`; types `CloseYearResult`, `BackupFile`, `AuditRow`; `nextYearSuggestion(year: YearLite): { label: string; start: string; end: string }`; screens `<UtilitiesScreen />` (`utilities`) and `<AuditScreen />` (`audit`).

**Behaviour:** *Freeze:* choose a date and press Set (or Remove); the current freeze date is shown. *Year-end:* for an open year the next year's name and dates are pre-filled (the day after this year ends, one year long); "Close year" asks for confirmation, then shows the net profit and how many balances and bills were carried forward. A closed year offers "Reopen" and "Lock permanently" (asks first). *Backup:* "Back up now" creates a file and lists the recent ones. *Restore:* pick a file, type your password, confirm; afterwards the user is signed out, because a restore also rolls back the sign-in records. If backups are not set up the panel says so. *Audit:* admins who may export the log pick dates and an entity and see who did what; `Ctrl+E` exports a CSV.

- [ ] **Step 1: Service — failing tests, then the code**

Append to `packages/service/src/security/rights.test.ts`:
```ts
describe('visibleCompanies', () => {
  it('includes the freeze date', async () => {
    await db.query(`UPDATE companies SET freeze_date = '2026-06-30' WHERE id = $1`, [s.companyId]);
    const rows = await visibleCompanies(db, admin);
    expect(rows[0]).toMatchObject({ code: 'C1', freezeDate: '2026-06-30' });
    await db.query('UPDATE companies SET freeze_date = NULL WHERE id = $1', [s.companyId]);
    expect((await visibleCompanies(db, admin))[0]!.freezeDate).toBeNull();
  });
});
```
Append to `packages/service/src/ops/backup.test.ts` (import `listBackups` from `./backup`):
```ts
describe('listBackups', () => {
  it('lists backup files newest first with their full path, and ignores other files', async () => {
    await writeFile(join(dir, 'sas-20261001-010000.dump'), 'a');
    await writeFile(join(dir, 'sas-20261003-010000.dump'), 'bbb');
    await writeFile(join(dir, 'notes.txt'), 'x');
    const files = await listBackups(dir);
    expect(files.map((f) => f.name)).toEqual(['sas-20261003-010000.dump', 'sas-20261001-010000.dump']);
    expect(files[0]).toMatchObject({ path: join(dir, 'sas-20261003-010000.dump'), size: 3 });
    expect(new Date(files[0]!.modified).getTime()).not.toBeNaN();
  });
  it('is empty for a folder that does not exist', async () => {
    expect(await listBackups(join(dir, 'nope'))).toEqual([]);
  });
});
```
Append to `packages/service/src/api/admin.api.test.ts` inside `describe('backup and restore', …)`:
```ts
  it('lists the backup files, for users with the utilities find right only', async () => {
    await send('POST', '/api/backup', {});
    const r = await send('GET', '/api/backups');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toHaveLength(1);
    expect(r.json()[0].name).toMatch(/^sas-\d{8}-\d{6}\.dump$/);
    const clerk = await f.addUser('clerk');
    expect((await send('GET', '/api/backups', undefined, clerk.token)).statusCode).toBe(403);
  });
```
and inside `describe('backup not configured', …)` a second test that `GET /api/backups` answers `501`. Also append to the `freeze and year-end` describe:
```ts
  it('shows the freeze date in the company list', async () => {
    await send('POST', `/api/companies/${f.s.companyId}/freeze`, { date: '2026-06-30' });
    const r = await send('GET', '/api/companies');
    expect(r.json()[0]).toMatchObject({ code: 'C1', freezeDate: '2026-06-30' });
  });
```
Run the three service test files — Expected: the new tests FAIL.

In `rights.ts` change `visibleCompanies` to:
```ts
export async function visibleCompanies(
  q: Queryable,
  actor: Actor,
): Promise<{ id: string; code: string; name: string; freezeDate: string | null }[]> {
  return q.query(
    `SELECT id, code, name, freeze_date AS "freezeDate" FROM companies
     WHERE $1::boolean OR id NOT IN (SELECT company_id FROM user_hidden_companies WHERE user_id = $2)
     ORDER BY name`,
    [actor.isAdmin, actor.userId],
  );
}
```
Add to `ops/backup.ts` (import `stat` from `node:fs/promises` alongside the existing imports):
```ts
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
```
Add to `api/routes/admin.ts` (import `listBackups`):
```ts
  app.get('/api/backups', async (req) => {
    const cfg = backupConfig();
    await assertRight(db, req.actor!, 'utilities', 'find');
    return listBackups(cfg.dir);
  });
```
Run the three service test files — Expected: PASS.

- [ ] **Step 2: App — types and endpoints**

In `api/types.ts` add `freezeDate?: string | null;` to `CompanyLite`. Append to `api/endpoints.ts`:
```ts
export const setFreeze = (api: ApiClient, companyId: string, date: string | null) =>
  api.request<void>('POST', `/api/companies/${companyId}/freeze`, { date });

export interface CloseYearResult {
  nextYearId: string;
  netProfit: string;
  carriedLedgers: number;
  carriedBills: number;
}
export const closeYear = (api: ApiClient, yearId: string, body: { companyId: string; next: { label: string; start: string; end: string } }) =>
  api.request<CloseYearResult>('POST', `/api/years/${yearId}/close`, body);
export const reopenYear = (api: ApiClient, yearId: string, companyId: string) => api.request<void>('POST', `/api/years/${yearId}/reopen`, { companyId });
export const lockYear = (api: ApiClient, yearId: string, companyId: string) => api.request<void>('POST', `/api/years/${yearId}/lock`, { companyId });

export interface BackupFile {
  name: string;
  path: string;
  size: number;
  modified: string;
}
export const listBackups = (api: ApiClient) => api.request<BackupFile[]>('GET', '/api/backups');
export const runBackup = (api: ApiClient) => api.request<{ file: string; removed: string[] }>('POST', '/api/backup', {});
export const restoreBackup = (api: ApiClient, file: string, adminPassword: string) => api.request<void>('POST', '/api/restore', { file, adminPassword });

export interface AuditRow {
  at: string;
  userId: string | null;
  username: string | null;
  entity: string;
  entityId: string | null;
  action: string;
  oldValues: unknown;
  newValues: unknown;
}
export const auditLog = (api: ApiClient, p: { companyId: string; from?: string; to?: string; entity?: string }) =>
  api.request<AuditRow[]>('GET', `/api/audit${queryString({ ...p })}`);
```

- [ ] **Step 3: App — write the failing tests**

`packages/app/src/renderer/admin/yearSuggestion.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { nextYearSuggestion } from './yearSuggestion';

const year = (startDate: string, endDate: string) => ({ id: 'y', label: 'x', startDate, endDate, status: 'open' });

describe('nextYearSuggestion', () => {
  it('the April-to-March year after this one', () => {
    expect(nextYearSuggestion(year('2026-04-01', '2027-03-31'))).toEqual({ label: '2027-28', start: '2027-04-01', end: '2028-03-31' });
  });
  it('a calendar year is followed by the next calendar year, named by that year', () => {
    expect(nextYearSuggestion(year('2026-01-01', '2026-12-31'))).toEqual({ label: '2027', start: '2027-01-01', end: '2027-12-31' });
  });
  it('copes with a leap year', () => {
    expect(nextYearSuggestion(year('2027-04-01', '2028-03-31'))).toEqual({ label: '2028-29', start: '2028-04-01', end: '2029-03-31' });
    expect(nextYearSuggestion(year('2027-03-01', '2028-02-29'))).toEqual({ label: '2028-29', start: '2028-03-01', end: '2029-02-28' });
  });
  it('century labels wrap correctly', () => {
    expect(nextYearSuggestion(year('2099-04-01', '2100-03-31')).label).toBe('2100-01');
  });
});
```

`packages/app/src/renderer/admin/UtilitiesScreen.test.tsx`:
```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import type { BackupFile } from '../api/endpoints';
import type { FakeRoute } from '../testing/fakeClient';
import { renderScreen } from '../testing/render';
import { COMPANY, YEAR_2025, YEAR_2026 } from '../testing/sampleData';
import { UtilitiesScreen } from './UtilitiesScreen';

const BACKUPS: BackupFile[] = [
  { name: 'sas-20261003-010000.dump', path: 'D:/b/sas-20261003-010000.dump', size: 58973, modified: '2026-10-03T01:00:00.000Z' },
  { name: 'sas-20261001-010000.dump', path: 'D:/b/sas-20261001-010000.dump', size: 58000, modified: '2026-10-01T01:00:00.000Z' },
];

function setup(opts: { session?: object; backups?: BackupFile[] | 'unset'; extra?: FakeRoute[] } = {}) {
  const calls: { path: string; body: any }[] = [];
  const record = (path: string, body: any) => void calls.push({ path, body });
  const routes: FakeRoute[] = [
    ...(opts.extra ?? []),
    {
      method: 'GET',
      path: '/api/backups',
      reply: () => {
        if (opts.backups === 'unset') throw new ApiError(501, 'NOT_CONFIGURED', 'Backup is not configured on this server');
        return opts.backups ?? BACKUPS;
      },
    },
    { method: 'POST', path: '/api/backup', reply: () => (record('/api/backup', {}), { file: 'D:/b/sas-20261020-120000.dump', removed: [] }) },
    { method: 'POST', path: '/api/restore', reply: ({ body }) => record('/api/restore', body) },
    { method: 'POST', path: /^\/api\/companies\/c1\/freeze$/, reply: ({ body }) => record('freeze', body) },
    { method: 'POST', path: /^\/api\/years\/[^/]+\/close$/, reply: ({ path, body }) => (record(path, body), { nextYearId: 'y2', netProfit: '260000.00', carriedLedgers: 4, carriedBills: 7 }) },
    { method: 'POST', path: /^\/api\/years\/[^/]+\/(reopen|lock)$/, reply: ({ path, body }) => record(path, body) },
  ];
  let reloaded = 0;
  let refreshed = 0;
  let loggedOut = 0;
  const utils = renderScreen(<UtilitiesScreen />, {
    routes,
    session: { reloadYears: async () => void reloaded++, refreshCompanies: async () => void refreshed++, logout: () => void loggedOut++, ...(opts.session ?? {}) },
  });
  return { calls, counts: { reloaded: () => reloaded, refreshed: () => refreshed, loggedOut: () => loggedOut }, ...utils };
}

describe('freeze date', () => {
  it('shows the current freeze date and sets a new one', async () => {
    const user = userEvent.setup();
    const { calls, counts } = setup({ session: { company: { ...COMPANY, freezeDate: '2026-06-30' } } });
    expect(await screen.findByText(/entries up to 30-06-2026 are frozen/i)).toBeInTheDocument();
    const date = screen.getByLabelText('Freeze entries up to');
    await user.clear(date);
    await user.type(date, '31072026');
    await user.click(screen.getByRole('button', { name: 'Set freeze date' }));
    await waitFor(() => expect(calls).toContainEqual({ path: 'freeze', body: { date: '2026-07-31' } }));
    expect(counts.refreshed()).toBe(1);
  });

  it('removes the freeze', async () => {
    const user = userEvent.setup();
    const { calls } = setup({ session: { company: { ...COMPANY, freezeDate: '2026-06-30' } } });
    await user.click(await screen.findByRole('button', { name: 'Remove freeze' }));
    await waitFor(() => expect(calls).toContainEqual({ path: 'freeze', body: { date: null } }));
  });
});

describe('year-end', () => {
  it('closes an open year after confirmation, with the next year prefilled', async () => {
    const user = userEvent.setup();
    const { calls, counts } = setup();
    expect(await screen.findByLabelText('Next year name')).toHaveValue('2027-28');
    expect(screen.getByLabelText('Next year first day')).toHaveValue('01-04-2027');
    expect(screen.getByLabelText('Next year last day')).toHaveValue('31-03-2028');
    await user.click(screen.getByRole('button', { name: 'Close year 2026-27' }));
    const confirm = await screen.findByRole('dialog', { name: 'Close year 2026-27' });
    expect(calls.some((c) => c.path.endsWith('/close'))).toBe(false);
    await user.click(within(confirm).getByRole('button', { name: 'Close year' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Net profit 2,60,000.00');
    expect(screen.getByRole('status')).toHaveTextContent('4 balances and 7 pending bills');
    expect(calls).toContainEqual({ path: '/api/years/y1/close', body: { companyId: 'c1', next: { label: '2027-28', start: '2027-04-01', end: '2028-03-31' } } });
    expect(counts.reloaded()).toBe(1);
  });

  it('Esc in the confirmation leaves the year open', async () => {
    const user = userEvent.setup();
    const { calls } = setup();
    await user.click(await screen.findByRole('button', { name: 'Close year 2026-27' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Close year 2026-27' })).toBeNull();
    expect(calls.some((c) => c.path.endsWith('/close'))).toBe(false);
  });

  it('a closed year can be reopened or locked for good (after asking)', async () => {
    const user = userEvent.setup();
    const closed = { ...YEAR_2026, status: 'closed' };
    const { calls } = setup({ session: { year: closed, years: [YEAR_2025, closed] } });
    await user.click(await screen.findByRole('button', { name: 'Reopen year 2026-27' }));
    await waitFor(() => expect(calls).toContainEqual({ path: '/api/years/y1/reopen', body: { companyId: 'c1' } }));
    await user.click(screen.getByRole('button', { name: 'Lock year 2026-27 permanently' }));
    const confirm = await screen.findByRole('dialog', { name: 'Lock year 2026-27' });
    expect(confirm).toHaveTextContent(/cannot be undone/i);
    await user.click(within(confirm).getByRole('button', { name: 'Lock year' }));
    await waitFor(() => expect(calls).toContainEqual({ path: '/api/years/y1/lock', body: { companyId: 'c1' } }));
  });

  it('a locked year has no actions', async () => {
    const locked = { ...YEAR_2026, status: 'locked' };
    setup({ session: { year: locked, years: [locked] } });
    expect(await screen.findByText(/year 2026-27 is locked/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reopen year/ })).toBeNull();
  });

  it('shows the server\'s message when closing fails', async () => {
    const user = userEvent.setup();
    setup({ extra: [{ method: 'POST', path: /\/close$/, reply: () => { throw new ApiError(422, 'YEAR_BAD_STATE', 'The next year is already closed'); } }] });
    await user.click(await screen.findByRole('button', { name: 'Close year 2026-27' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Close year 2026-27' })).getByRole('button', { name: 'Close year' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The next year is already closed');
  });
});

describe('backup and restore', () => {
  it('lists the backups and backs up now', async () => {
    const user = userEvent.setup();
    const { calls } = setup();
    const grid = await screen.findByRole('grid', { name: 'Backups' });
    expect(within(grid).getByText('sas-20261003-010000.dump')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back up now' }));
    expect(await screen.findByText(/backup saved: .*sas-20261020-120000\.dump/i)).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/api/backup')).toBe(true);
  });

  it('restores only after the password is typed and the warning confirmed, then signs out', async () => {
    const user = userEvent.setup();
    const { calls, counts } = setup();
    await screen.findByRole('grid', { name: 'Backups' });
    await user.click(screen.getByRole('combobox', { name: 'Backup file' }));
    await user.keyboard('0003{Enter}'); // sas-20261003-010000.dump
    await user.click(screen.getByRole('button', { name: 'Restore…' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/enter your password/i);
    await user.type(screen.getByLabelText('Your password'), 'adminpass1');
    await user.click(screen.getByRole('button', { name: 'Restore…' }));
    const confirm = await screen.findByRole('dialog', { name: 'Restore backup' });
    expect(confirm).toHaveTextContent(/replaces all current data/i);
    expect(calls.some((c) => c.path === '/api/restore')).toBe(false);
    await user.click(within(confirm).getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(calls).toContainEqual({ path: '/api/restore', body: { file: 'D:/b/sas-20261003-010000.dump', adminPassword: 'adminpass1' } }));
    await waitFor(() => expect(counts.loggedOut()).toBe(1));
  });

  it('shows the server\'s message for a wrong password and does not sign out', async () => {
    const user = userEvent.setup();
    const { counts } = setup({ extra: [{ method: 'POST', path: '/api/restore', reply: () => { throw new ApiError(403, 'FORBIDDEN', 'Wrong administrator password'); } }] });
    await screen.findByRole('grid', { name: 'Backups' });
    await user.click(screen.getByRole('combobox', { name: 'Backup file' }));
    await user.keyboard('0003{Enter}');
    await user.type(screen.getByLabelText('Your password'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Restore…' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Restore backup' })).getByRole('button', { name: 'Restore' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong administrator password');
    expect(counts.loggedOut()).toBe(0);
  });

  it('says so when backups are not set up on the server', async () => {
    setup({ backups: 'unset' });
    expect(await screen.findByText(/backup is not set up on this server/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back up now' })).toBeNull();
  });
});
```

`packages/app/src/renderer/admin/AuditScreen.test.tsx`:
```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import type { AuditRow } from '../api/endpoints';
import { renderScreen } from '../testing/render';
import { AuditScreen } from './AuditScreen';

const ROWS: AuditRow[] = [
  {
    at: '2026-10-20T09:30:00.000Z',
    userId: 'u1',
    username: 'asha',
    entity: 'voucher',
    entityId: 'v1',
    action: 'add',
    oldValues: null,
    newValues: { voucherNo: 12, date: '2026-05-10', kind: 'receipt', narration: null, lines: [{ ledgerId: 'l1', debit: '0.00', credit: '1000.00' }] },
  },
  { at: '2026-10-20T09:35:00.000Z', userId: 'u1', username: 'asha', entity: 'company', entityId: 'c1', action: 'freeze', oldValues: { freezeDate: null }, newValues: { freezeDate: '2026-06-30' } },
];

describe('AuditScreen', () => {
  it('loads the log for the company and shows who did what, with a readable summary', async () => {
    const { api } = renderScreen(<AuditScreen />, { routes: [{ method: 'GET', path: '/api/audit', reply: () => ROWS }] });
    const grid = await screen.findByRole('grid', { name: 'Audit log' });
    const voucher = within(grid).getByRole('row', { name: /voucher/ });
    expect(voucher).toHaveTextContent('asha');
    expect(voucher).toHaveTextContent('add');
    expect(voucher).toHaveTextContent('Voucher no. 12');
    expect(within(grid).getByRole('row', { name: /freeze/ })).toHaveTextContent('freezeDate');
    expect(api.calls.find((c) => c.path.startsWith('/api/audit'))!.path).toMatch(/^\/api\/audit\?companyId=c1&from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/);
  });

  it('shows the time in dd-mm-yyyy hh:mm form', async () => {
    renderScreen(<AuditScreen />, { routes: [{ method: 'GET', path: '/api/audit', reply: () => ROWS }] });
    const grid = await screen.findByRole('grid', { name: 'Audit log' });
    expect(within(grid).getAllByRole('row')[1]!.textContent).toMatch(/\d{2}-\d{2}-\d{4} \d{2}:\d{2}/);
  });

  it('filters by entity', async () => {
    const user = userEvent.setup();
    const { api } = renderScreen(<AuditScreen />, { routes: [{ method: 'GET', path: '/api/audit', reply: () => ROWS }] });
    await screen.findByRole('grid', { name: 'Audit log' });
    await user.click(screen.getByRole('combobox', { name: 'What' }));
    await user.keyboard('vouch{Enter}');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await screen.findByRole('grid', { name: 'Audit log' });
    expect(api.calls.filter((c) => c.path.startsWith('/api/audit')).at(-1)!.path).toContain('entity=voucher');
  });

  it('Ctrl+E exports the full log as CSV', async () => {
    const user = userEvent.setup();
    const { bridge } = renderScreen(<AuditScreen />, { routes: [{ method: 'GET', path: '/api/audit', reply: () => ROWS }] });
    await screen.findByRole('grid', { name: 'Audit log' });
    await user.keyboard('{Control>}e{/Control}');
    await screen.findByText('CSV saved');
    expect(bridge.saved[0]!.suggestedName).toBe('audit-log.csv');
    expect(bridge.saved[0]!.data).toContain('"{""voucherNo"":12');
  });

  it('explains when the user may not read the log', async () => {
    renderScreen(<AuditScreen />, {
      routes: [{ method: 'GET', path: '/api/audit', reply: () => { throw new ApiError(403, 'FORBIDDEN', 'You may not export the audit log'); } }],
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('You may not export the audit log');
  });
});
```

- [ ] **Step 4: Run to verify they fail, then write the code**

Run: `npx vitest run packages/app/src/renderer/admin` — Expected: FAIL (modules missing).

`packages/app/src/renderer/admin/yearSuggestion.ts`:
```ts
import type { YearLite } from '../api/types';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** The year after `year`: it starts the day after this one ends and lasts a year. */
export function nextYearSuggestion(year: YearLite): { label: string; start: string; end: string } {
  const start = new Date(`${year.endDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + 1);
  const end = new Date(start);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  end.setUTCDate(end.getUTCDate() - 1);
  // A 1 March start with a leap day wrapping to 28 Feb: setUTCFullYear on 29 Feb would roll over, so re-derive.
  const startYear = start.getUTCFullYear();
  const label = start.getUTCMonth() === 0 ? String(startYear) : `${startYear}-${pad((startYear + 1) % 100)}`;
  return { label, start: iso(start), end: iso(end) };
}
```
(Implementation note: for the leap-year case `2027-03-01 … 2028-02-29` the next year is `2028-03-01 … 2029-02-28`: `end = start + 1 year − 1 day` gives `2029-03-01 − 1 day = 2029-02-28`, which `setUTCDate(getUTCDate() − 1)` produces correctly because the date is built from `start`, not from the old end. Keep the tests as the specification.)

`packages/app/src/renderer/admin/UtilitiesScreen.tsx`:
```tsx
import { useEffect, useMemo, useState } from 'react';
import {
  closeYear,
  listBackups,
  lockYear,
  reopenYear,
  restoreBackup,
  runBackup,
  setFreeze,
  type BackupFile,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { useApi } from '../session/deps';
import { useSession } from '../session/Session';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { clampToYear, formatDisplay, todayIso, type DateCtx } from '../ui/dates';
import { DataTable, type Column } from '../ui/DataTable';
import { DateInput } from '../ui/DateInput';
import { Field } from '../ui/Field';
import { formatInr } from '../ui/format';
import { Lookup } from '../ui/Lookup';
import { useCommittedAction } from '../ui/useCommittedAction';
import { nextYearSuggestion } from './yearSuggestion';

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fileTime = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const BACKUP_COLUMNS: Column<BackupFile>[] = [
  { key: 'name', header: 'Backup', value: (b) => b.name },
  { key: 'when', header: 'Made', value: (b) => fileTime(b.modified) },
  { key: 'size', header: 'Size', numeric: true, value: (b) => `${Math.max(1, Math.round(b.size / 1024))} KB` },
];

export function UtilitiesScreen() {
  const api = useApi();
  const session = useSession();
  const { company, year } = session;

  const [problems, setProblems] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const fail = (e: unknown) => setProblems([messageOf(e)]);
  const clear = () => {
    setProblems([]);
    setStatus(null);
  };

  // ---- freeze
  const [freeze, setFreezeDate] = useState<string | null>(company?.freezeDate ?? null);
  useEffect(() => setFreezeDate(company?.freezeDate ?? null), [company?.id, company?.freezeDate]);
  const ctx: DateCtx | null = year ? { yearStart: year.startDate, yearEnd: year.endDate, base: clampToYear(todayIso(), year.startDate, year.endDate) } : null;

  const applyFreeze = useCommittedAction(async () => {
    if (!company) return;
    clear();
    if (!freeze) return setProblems(['Enter the date up to which entries are frozen']);
    try {
      await setFreeze(api, company.id, freeze);
      await session.refreshCompanies();
      setStatus(`Entries up to ${formatDisplay(freeze)} are now frozen`);
    } catch (e) {
      fail(e);
    }
  });
  async function removeFreeze() {
    if (!company) return;
    clear();
    try {
      await setFreeze(api, company.id, null);
      await session.refreshCompanies();
      setStatus('The freeze was removed');
    } catch (e) {
      fail(e);
    }
  }

  // ---- year-end
  const suggestion = useMemo(() => (year ? nextYearSuggestion(year) : null), [year]);
  const [nextLabel, setNextLabel] = useState('');
  const [nextStart, setNextStart] = useState<string | null>(null);
  const [nextEnd, setNextEnd] = useState<string | null>(null);
  useEffect(() => {
    setNextLabel(suggestion?.label ?? '');
    setNextStart(suggestion?.start ?? null);
    setNextEnd(suggestion?.end ?? null);
  }, [suggestion]);
  const [confirm, setConfirm] = useState<null | 'close' | 'lock' | 'restore'>(null);

  async function doClose() {
    setConfirm(null);
    if (!company || !year || !nextStart || !nextEnd) return;
    clear();
    try {
      const r = await closeYear(api, year.id, { companyId: company.id, next: { label: nextLabel.trim(), start: nextStart, end: nextEnd } });
      await session.reloadYears();
      setStatus(`Year ${year.label} closed. Net profit ${formatInr(r.netProfit)}. ${r.carriedLedgers} balances and ${r.carriedBills} pending bills carried to ${nextLabel.trim()}.`);
    } catch (e) {
      fail(e);
    }
  }
  async function doReopen() {
    if (!company || !year) return;
    clear();
    try {
      await reopenYear(api, year.id, company.id);
      await session.reloadYears();
      setStatus(`Year ${year.label} is open again`);
    } catch (e) {
      fail(e);
    }
  }
  async function doLock() {
    setConfirm(null);
    if (!company || !year) return;
    clear();
    try {
      await lockYear(api, year.id, company.id);
      await session.reloadYears();
      setStatus(`Year ${year.label} is locked`);
    } catch (e) {
      fail(e);
    }
  }

  // ---- backup and restore
  const [backups, setBackups] = useState<BackupFile[] | null>(null);
  const [backupsOff, setBackupsOff] = useState(false);
  const [backupPath, setBackupPath] = useState<string | null>(null);
  const [password, setPassword] = useState('');

  async function loadBackups() {
    try {
      setBackups(await listBackups(api));
      setBackupsOff(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NOT_CONFIGURED') setBackupsOff(true);
      else fail(e);
    }
  }
  useEffect(() => {
    void loadBackups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function backupNow() {
    clear();
    try {
      const r = await runBackup(api);
      setStatus(`Backup saved: ${r.file}`);
      await loadBackups();
    } catch (e) {
      fail(e);
    }
  }
  function askRestore() {
    clear();
    if (!backupPath) return setProblems(['Choose the backup file to restore']);
    if (!password) return setProblems(['Enter your password to confirm']);
    setConfirm('restore');
  }
  async function doRestore() {
    setConfirm(null);
    if (!backupPath) return;
    try {
      await restoreBackup(api, backupPath, password);
      session.logout(); // a restore also rolls back the sign-in records, so everyone must sign in again
    } catch (e) {
      fail(e);
    }
  }

  if (!company || !year || !ctx) return <p className="panel">Choose a company and year first (F9).</p>;
  const backupItems = (backups ?? []).map((b) => ({ id: b.path, label: b.name, sub: fileTime(b.modified) }));

  return (
    <div>
      <h2>Year-end, Freeze & Backup</h2>

      <section className="panel" aria-label="Freeze entries">
        <h3>Freeze entries</h3>
        <p className="muted">
          {company.freezeDate ? `Entries up to ${formatDisplay(company.freezeDate)} are frozen: nobody can add, change or delete them.` : 'Nothing is frozen.'}
        </p>
        <div className="form-row">
          <Field label="Freeze entries up to">
            <DateInput label="Freeze entries up to" value={freeze} ctx={ctx} onChange={setFreezeDate} />
          </Field>
          <button className="primary" onClick={applyFreeze}>
            Set freeze date
          </button>
          {company.freezeDate && <button onClick={() => void removeFreeze()}>Remove freeze</button>}
        </div>
      </section>

      <section className="panel" aria-label="Year-end">
        <h3>Year {year.label}</h3>
        {year.status === 'open' && (
          <>
            <p className="muted">Closing the year stops new entries in it and carries the balances and pending bills into the next year. You can reopen it until it is locked.</p>
            <div className="form-row">
              <Field label="Next year name">
                <input aria-label="Next year name" value={nextLabel} onChange={(e) => setNextLabel(e.target.value)} style={{ width: 110 }} />
              </Field>
              <Field label="First day">
                <DateInput label="Next year first day" value={nextStart} ctx={{ ...ctx, yearStart: nextStart ?? ctx.yearStart, yearEnd: nextEnd ?? ctx.yearEnd }} onChange={setNextStart} />
              </Field>
              <Field label="Last day">
                <DateInput label="Next year last day" value={nextEnd} ctx={{ ...ctx, yearStart: nextStart ?? ctx.yearStart, yearEnd: nextEnd ?? ctx.yearEnd }} onChange={setNextEnd} />
              </Field>
              <button className="primary" onClick={() => setConfirm('close')}>
                Close year {year.label}
              </button>
            </div>
          </>
        )}
        {year.status === 'closed' && (
          <>
            <p className="muted">Year {year.label} is closed.</p>
            <button onClick={() => void doReopen()}>Reopen year {year.label}</button>{' '}
            <button onClick={() => setConfirm('lock')}>Lock year {year.label} permanently</button>
          </>
        )}
        {year.status === 'locked' && <p className="muted">Year {year.label} is locked. It cannot be changed or reopened.</p>}
      </section>

      <section className="panel" aria-label="Backup">
        <h3>Backup and restore</h3>
        {backupsOff ? (
          <p className="muted">Backup is not set up on this server. Ask whoever installed it to set the backup folder.</p>
        ) : (
          <>
            <p>
              <button className="primary" onClick={() => void backupNow()}>
                Back up now
              </button>
            </p>
            <DataTable caption="Backups" columns={BACKUP_COLUMNS} rows={backups ?? []} rowKey={(b) => b.path} emptyText="No backups yet" />
            <h3 style={{ marginTop: 12 }}>Restore</h3>
            <p className="muted">Restoring replaces all current data with the chosen backup, and everyone must sign in again afterwards.</p>
            <div className="form-row">
              <Field label="Backup file">
                <Lookup label="Backup file" items={backupItems} value={backupPath} onChange={setBackupPath} />
              </Field>
              <Field label="Your password">
                <input aria-label="Your password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              <button onClick={askRestore}>Restore…</button>
            </div>
          </>
        )}
      </section>

      {problems.length > 0 && (
        <ul role="alert" className="err">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {status && (
        <p role="status" className="ok">
          {status}
        </p>
      )}

      {confirm === 'close' && (
        <ConfirmDialog
          title={`Close year ${year.label}`}
          message={`No more vouchers can be entered in ${year.label}. Balances and pending bills move to ${nextLabel}. You can reopen the year later, until it is locked.`}
          confirmLabel="Close year"
          onConfirm={() => void doClose()}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === 'lock' && (
        <ConfirmDialog
          title={`Lock year ${year.label}`}
          message={`A locked year can never be changed or reopened. This cannot be undone.`}
          confirmLabel="Lock year"
          onConfirm={() => void doLock()}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === 'restore' && (
        <ConfirmDialog
          title="Restore backup"
          message="This replaces all current data with the chosen backup and signs everyone out. Entries made after the backup are lost."
          confirmLabel="Restore"
          onConfirm={() => void doRestore()}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
```

`packages/app/src/renderer/admin/AuditScreen.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { auditLog, type AuditRow } from '../api/endpoints';
import { useScreenShortcuts } from '../keys/useScreenShortcuts';
import { ReportShell } from '../reports/ReportShell';
import { toCsv } from '../reports/csv';
import { useReport } from '../reports/useReport';
import { useApi } from '../session/deps';
import { useSession } from '../session/Session';
import { todayIso, type DateCtx } from '../ui/dates';
import { DataTable, type Column } from '../ui/DataTable';
import { DateInput } from '../ui/DateInput';
import { Field } from '../ui/Field';
import { Lookup } from '../ui/Lookup';
import { useCommittedAction } from '../ui/useCommittedAction';

const ENTITIES = ['voucher', 'ledger', 'ledger_opening', 'book', 'company', 'financial_year', 'user'].map((e) => ({ id: e, label: e }));

const pad = (n: number) => String(n).padStart(2, '0');
function when(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A short human summary of what changed. */
export function summarize(row: AuditRow): string {
  const v = (row.newValues ?? row.oldValues) as Record<string, unknown> | null;
  if (row.entity === 'voucher' && v && typeof v.voucherNo === 'number') return `Voucher no. ${v.voucherNo} on ${v.date}`;
  const text = JSON.stringify(v ?? {});
  return text.length > 90 ? `${text.slice(0, 87)}…` : text;
}

const COLUMNS: Column<AuditRow>[] = [
  { key: 'at', header: 'When', value: (r) => when(r.at) },
  { key: 'user', header: 'User', value: (r) => r.username ?? '' },
  { key: 'entity', header: 'What', value: (r) => r.entity },
  { key: 'action', header: 'Action', value: (r) => r.action },
  { key: 'summary', header: 'Details', value: summarize },
];

const CSV_COLUMNS: Column<AuditRow>[] = [
  ...COLUMNS.slice(0, 4),
  { key: 'old', header: 'Before', value: (r) => (r.oldValues == null ? '' : JSON.stringify(r.oldValues)) },
  { key: 'new', header: 'After', value: (r) => (r.newValues == null ? '' : JSON.stringify(r.newValues)) },
];

export function AuditScreen() {
  const api = useApi();
  const { company } = useSession();
  const today = todayIso();
  const weekAgo = (() => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7);
    return d.toISOString().slice(0, 10);
  })();
  const [from, setFrom] = useState<string | null>(weekAgo);
  const [to, setTo] = useState<string | null>(today);
  const [entity, setEntity] = useState<string | null>(null);
  const report = useReport<AuditRow[]>();

  const runNow = () => {
    if (!company) return;
    if (!from || !to) return report.fail('Enter both dates');
    return report.run(() => auditLog(api, { companyId: company.id, from, to, ...(entity ? { entity } : {}) }));
  };
  const requestRun = useCommittedAction(runNow);
  useEffect(() => {
    void runNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  if (!company) return <p className="panel">Choose a company first (F9).</p>;
  const ctx: DateCtx = { yearStart: '2000-01-01', yearEnd: '2099-12-31', base: today };
  const rows = report.data;

  return (
    <ReportShell
      screenId="audit"
      shortcuts={['run', 'csv']}
      title="Audit Log"
      subtitle={from && to ? `${from} to ${to}` : undefined}
      onRun={requestRun}
      loading={report.loading}
      error={report.error || null}
      filters={
        <>
          <Field label="From">
            <DateInput label="From" value={from} ctx={ctx} onChange={setFrom} autoFocus />
          </Field>
          <Field label="To">
            <DateInput label="To" value={to} ctx={ctx} onChange={setTo} />
          </Field>
          <Field label="What">
            <Lookup label="What" items={ENTITIES} value={entity} onChange={setEntity} />
          </Field>
        </>
      }
      csv={() => rows && { fileName: 'audit-log.csv', text: toCsv(CSV_COLUMNS, rows, { title: [company.name, 'Audit log'] }) }}
    >
      {rows && <DataTable caption="Audit log" columns={COLUMNS} rows={rows} rowKey={(r) => `${r.at}-${r.entityId ?? ''}-${r.action}-${r.entity}`} emptyText="Nothing was recorded for these filters" />}
    </ReportShell>
  );
}
```
`AuditScreen` reuses `ReportShell` with `shortcuts={['run', 'csv']}` because the `audit` screen declares only those two; the shell then binds, and shows buttons for, just those.

Register `utilities: UtilitiesScreen, audit: AuditScreen` in `screenComponents.tsx`.

- [ ] **Step 5: Run the tests and the type-check**

Run: `npx vitest run packages/app packages/service && npm run typecheck`
Expected: PASS — yearSuggestion (4), Utilities (12), Audit (5), the service additions and everything earlier; no type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/app packages/service
git commit -m "feat(app,service): freeze, year-end, backup/restore and audit log screens; backup list and freeze date endpoints" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Integration against the real service, the manual checklist and the build

**Files:**
- Modify: `packages/app/src/renderer/testing/render.tsx` (let `renderApp` take a ready-made `api`)
- Create: `packages/app/src/integration/realServer.ts`, `packages/app/src/integration/journey.test.tsx`
- Create: `packages/app/README.md`
- Modify: `README.md` (root)

**Interfaces:**
- Produces:
  - `startServer(): Promise<{ url: string; adminPassword: string; stop(): Promise<void> }>` — spawns the real service (`packages/service/src/server/main.ts` under `tsx`) with an embedded PGlite database in a temporary folder, on a free port, and waits for `/api/health`.
  - `realClient(url): ApiClient` — the production client over the production request code: `createBridgeClient({ request: (args) => performRequest(fetch, url, args) })`. Only the Electron IPC hop is missing from the chain.
  - `renderApp({ api? })`.
  - Manual verification checklist (Step 4) and the developer README.

**Why integration tests:** every earlier test uses a fake API. These run the real screens against the real service over real HTTP, so they catch the mismatches fakes cannot: a field the server names differently, a status code the screen mishandles, rights enforced for real, Gujarati text surviving the database.

- [ ] **Step 1: Let `renderApp` take a ready-made client**

In `testing/render.tsx` change the first lines of `renderApp`:
```tsx
export function renderApp(opts: { me?: MeResponse; routes?: FakeRoute[]; bridge?: FakeBridge; api?: ApiClient } = {}) {
  const api = opts.api ?? createFakeClient(baseRoutes({ me: opts.me, extra: opts.routes }));
```
(import `ApiClient` from `../api/client`; the returned `api` is then typed `ApiClient`, so make the return type `ApiClient & Partial<FakeClient>` or cast where tests read `.calls`.)

- [ ] **Step 2: The server helper**

`packages/app/src/integration/realServer.ts`:
```ts
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
```

- [ ] **Step 3: The journey tests**

`packages/app/src/integration/journey.test.tsx`:
```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createBook, createCompany, createLedger, createUser, listYears, login, me, setOpening, setUserRights } from '../renderer/api/endpoints';
import type { ApiClient } from '../renderer/api/client';
import { createFakeBridge } from '../renderer/testing/fakeBridge';
import { renderApp, signIn } from '../renderer/testing/render';
import { rightsFor } from '../renderer/testing/sampleData';
import { realClient, startServer, type RunningServer } from './realServer';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

let server: RunningServer;
let admin: ApiClient;

beforeAll(async () => {
  server = await startServer();
  admin = realClient(server.url);
  admin.setToken((await login(admin, 'admin', server.adminPassword)).token);

  // A company with a cash book, a journal book, two accounts (one in Gujarati) and an opening balance.
  const { companyId, yearId } = await createCompany(admin, {
    code: 'T1', name: 'Test Textiles', fyLabel: '2026-27', fyStart: '2026-04-01', fyEnd: '2027-03-31',
  });
  const cash = (await createLedger(admin, companyId, { groupCode: 16, name: 'Cash' })).id;
  const party = (await createLedger(admin, companyId, { groupCode: 42, name: 'રમેશ ટ્રેડર્સ', city: 'સુરત' })).id;
  await createLedger(admin, companyId, { groupCode: 42, name: 'Suresh Textiles', city: 'Surat' });
  await createBook(admin, companyId, { code: 'CB', name: 'Cash Book', type: 'cash', defaultLedgerId: cash });
  await createBook(admin, companyId, { code: 'JV', name: 'Journal', type: 'journal' });
  await setOpening(admin, cash, { yearId, amount: '1000', side: 'Dr' });
  void party;
});

afterAll(async () => {
  await server?.stop();
});

const bridge = () => createFakeBridge();

describe('the desktop app against the real service', () => {
  it('signs in, enters a receipt with Gujarati account name, finds it, edits it and sees it in the ledger', async () => {
    const user = userEvent.setup();
    renderApp({ api: realClient(server.url), bridge: bridge() });
    await signIn(user, 'admin', server.adminPassword);
    await screen.findByText('Test Textiles');

    // Receipt: F4, date, account, amount
    await user.keyboard('{F4}');
    await screen.findByRole('combobox', { name: 'Book' });
    await user.keyboard('12052026{Enter}{Enter}');
    await user.keyboard('રમેશ{Enter}2500{Enter}');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('status')).toHaveTextContent('Saved as voucher no. 1');

    // Find it: F7
    await user.keyboard('{F7}');
    const found = await screen.findByRole('row', { name: /Receipt/ });
    expect(found).toHaveTextContent('2,500.00');
    screen.getByRole('grid', { name: 'Vouchers' }).focus();
    await user.keyboard('{Enter}');

    // Edit: change the amount
    expect(await screen.findByRole('heading', { name: /no\. 1/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Account line 1' })).toHaveValue('રમેશ ટ્રેડર્સ');
    const amount = screen.getByLabelText('Amount line 1');
    await user.clear(amount);
    await user.type(amount, '3000');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('status')).toHaveTextContent('Voucher no. 1 updated');

    // Ledger report of the cash account: opening 1,000 + receipt 3,000
    await user.keyboard('{F8}');
    await user.click(await screen.findByRole('combobox', { name: 'Account' }));
    await user.keyboard('cash{Enter}');
    const to = screen.getByLabelText('To');
    await user.clear(to);
    await user.type(to, '31052026');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(await screen.findByText(/Opening balance/)).toHaveTextContent('1,000.00 Dr');
    const grid = await screen.findByRole('grid', { name: 'Ledger' });
    expect(within(grid).getByText('Total').closest('tr')).toHaveTextContent('4,000.00 Dr');
  });

  it('refuses an unbalanced journal on the screen before anything is sent', async () => {
    const user = userEvent.setup();
    renderApp({ api: realClient(server.url), bridge: bridge() });
    await signIn(user, 'admin', server.adminPassword);
    await screen.findByText('Test Textiles');
    await user.keyboard('{F6}');
    await screen.findByRole('combobox', { name: 'Book' });
    await user.keyboard('12052026{Enter}{Enter}');
    await user.keyboard('suresh{Enter}100{Enter}{Enter}cash{Enter}90');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Debits 100.00 and credits 90.00 differ');
  });

  it('shows a restricted user only what their rights allow, and the server enforces it', async () => {
    const user = userEvent.setup();
    // an operator who may only enter cash vouchers
    const { id } = await createUser(admin, { username: 'operator', password: 'operator1' });
    await setUserRights(admin, id, rightsFor({ cash_book: { show: true, find: true, add: true }, reports: {} }));

    renderApp({ api: realClient(server.url), bridge: bridge() });
    await signIn(user, 'operator', 'operator1');
    const menu = await screen.findByRole('navigation', { name: 'Screens' });
    expect(within(menu).getByRole('button', { name: /Cash \/ Bank Receipt/ })).toBeInTheDocument();
    expect(within(menu).queryByRole('button', { name: /Trial Balance/ })).toBeNull();
    expect(within(menu).queryByRole('button', { name: /Users & Rights/ })).toBeNull();

    // the server, not just the menu, says no
    const operator = realClient(server.url);
    operator.setToken((await login(operator, 'operator', 'operator1')).token);
    const myCompany = (await me(operator)).companies[0]!;
    const myYear = (await listYears(operator, myCompany.id))[0]!;
    await expect(
      operator.request('GET', `/api/reports/trial-balance?companyId=${myCompany.id}&yearId=${myYear.id}&asOn=2027-03-31`),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('goes back to the sign-in screen when the server forgets the session', async () => {
    const user = userEvent.setup();
    const api = realClient(server.url);
    renderApp({ api, bridge: bridge() });
    await signIn(user, 'admin', server.adminPassword);
    await screen.findByText('Test Textiles');
    api.setToken('a-token-the-server-does-not-know');
    await user.keyboard('{F7}'); // any call now fails with 401
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText(/session has ended/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Screens' })).toBeNull());
  });
});
```
Note on the first test: the Gujarati text is typed straight into the account picker; `userEvent` types Unicode characters as is, and the lookup filters with `toLowerCase().includes()`, which works for Gujarati. If `createUser`/`setUserRights` do not exist in `endpoints.ts` at this point they were added in Task 14. `me` is imported from the same module (Task 4). The 401 test relies on `Find Voucher` loading its list as soon as it opens.

Run: `npx vitest run packages/app/src/integration`
Expected: PASS — 4 tests, roughly 30–60 seconds (the server starts once for the file). If the server fails to start, the thrown error contains its own output; the usual causes are a missing `tsx` (run `npm install`) and a port clash (the helper picks a free one).

- [ ] **Step 4: Documentation and the manual checklist**

`packages/app/README.md`:
```markdown
# SAS desktop app

Electron + React front end for the SAS accounting service.

## Run it in development

1. Start the service with an embedded database (no PostgreSQL needed):
   `SAS_DEV_PGLITE_DIR=./.devdata ADMIN_PASSWORD=choose-one npm run start:service`
2. In another terminal: `npm run dev:app`
3. Sign in as `admin` with the password you chose. The server address is `http://127.0.0.1:4100` by default;
   the app asks for another one if it cannot connect.

## Tests

- `npm test` — unit and component tests (fake API) and the integration tests against the real service.
- `npm run typecheck` — all three packages.
- `npm run smoke -w @sas/app` — builds and starts the real Electron window once and checks it renders.

## Where things are

- Every keyboard shortcut is declared in `src/renderer/shell/screens.ts` (and `keys/registry.ts` for the global ones).
  The Help screen (F1) is generated from those declarations; a test checks every one is listed.
- Screens bind handlers with `useScreenShortcuts(screenId, { shortcutId: handler })`.
- `window.sas` (see `src/preload`) is the only way the renderer reaches the network: requests go to the main
  process, which forwards `/api/...` paths to the configured server.

## Manual checklist before a release

Run with a real PostgreSQL service and a real printer or PDF printer.

- [ ] First run: wrong server address shows the connect screen; correcting it reaches the sign-in screen.
- [ ] Sign in, create a company, accounts, a cash book and a journal book, and an opening balance — mouse not needed.
- [ ] Enter 10 receipts in a row from the keyboard (F4, date, account, amount, Ctrl+S). Note how long it takes; it should feel faster than the old software.
- [ ] Ctrl+B on a receipt line lists the bills; Alt+A fills them; the saved voucher shows them settled in the ageing report.
- [ ] F1 lists every shortcut; typing "pdf" filters it; Esc returns.
- [ ] Reports: print preview looks right on A4; "Save as PDF" and "CSV" files open (the CSV in Excel with Gujarati names intact).
- [ ] A user with only cash-book rights sees only those menu entries and gets a clear message for anything else.
- [ ] Closing a year, reopening it, and locking it behave as the confirmation texts say.
- [ ] Back up, enter a voucher, restore: the voucher is gone and everyone is asked to sign in again.
- [ ] Stop the service while a voucher is half entered, press Ctrl+S: the message appears and nothing typed is lost; start the service and press Ctrl+S again: it saves.
```
Append to the root `README.md`:
```markdown

## The desktop app

`packages/app` is the Electron front end. See `packages/app/README.md` for how to run it and the release checklist.
```

- [ ] **Step 5: Run everything, build, smoke-launch**

Run: `npm test && npm run typecheck && npm run build -w @sas/app && npm run smoke -w @sas/app`
Expected: all tests PASS (service, shared, app unit and integration; the PostgreSQL-only test stays skipped), no type errors, the build writes `packages/app/out/`, and the smoke run prints `SMOKE OK`.

- [ ] **Step 6: Commit and push**

```bash
git add README.md packages/app
git commit -m "test(app): integration journeys against the real service; developer README and release checklist" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```

---

## Self-review against the spec

| Spec requirement (section 6 of the foundation design, and sections 3 and 7) | Covered by |
|---|---|
| Electron + React app with screens only; the service holds the rules | Tasks 1, 4; `@sas/shared` reused only for instant feedback (Task 8) |
| Enter moves to the next field; Esc goes back; F-keys open lookups | Tasks 2, 5, 6 (`NavRoot`, `Lookup`, global shortcuts, opener hotkeys) |
| Typing in a party or item field filters the list instantly from an in-memory cache | Tasks 6 (`Lookup`) and 7 (`LookupsProvider`) |
| In voucher grids, Enter on the last field adds a line; totals update on every keystroke | Task 9 (`addLine`, totals footer, journal balancing suggestion) |
| Every screen usable without a mouse; the same key map everywhere | Tasks 2–6, 9–15; shortcuts declared once in `screens.ts` |
| **Help tab (F1)** listing every shortcut, global and per screen, with search, generated from the registry, read-only, available to every user, with a test that every registered shortcut appears | Task 3 (`Help`, completeness test); `help` and `home` screens are visible to everyone (Task 5, `canSee`) |
| Print and PDF output; Excel export | Task 12 (`ReportShell`: print, `printToPDF`, CSV with a byte-order mark for Gujarati) |
| Bill-wise adjustment in receipts and payments, on-account money | Tasks 8, 9 (`BillAdjuster`, `allocateOldestFirst`) |
| Voucher edit/delete with version check ("changed by another user, reload") | Task 9 (`STALE_VERSION` handling, reload button) |
| Operator never loses typed work | A failed save keeps the form (Task 9); the half-typed field is committed first (`useCommittedAction`, Task 10) |
| Login, rights per module, hidden groups and companies, users admin | Tasks 5, 14 (menu visibility, users screen) — the server enforces, tested end to end in Task 16 |
| Audit log viewing and export | Task 15 (`AuditScreen`) |
| Freeze date, year-end closing/reopening/locking, backup and restore with the admin password | Task 15 (`UtilitiesScreen`) |
| Reports: ledger, cash book, trial balance, P&L, balance sheet, ageing | Tasks 12, 13 |
| Gujarati names stored, shown and exported | Fonts in `styles.css`; CSV BOM (Task 1 `file:save`); Task 12 CSV test; Task 16 integration test with a Gujarati account |
| Indian number grouping and `dd-mm-yyyy` dates | Task 6 (`formatInr`, `parseDateInput`, `formatDisplay`) |

**Not in this plan (deliberately):**
- The installers: an NSIS installer for the app, a Windows service for the server, a bundled PostgreSQL, scheduled backups and automatic updates — **Plan D**. They need administrator rights and cannot be verified here with the same rigour as the screens.
- Editing or deleting existing accounts, books and companies: the Plan B API can create them but not change them, so these screens list and create only (the account screen says so).
- Sub-project 2 and later: items and stock, invoices, challans, GST and e-invoicing, mill and job-work screens, WhatsApp/SMS, the cloud layer.
- Automatic re-sending of a voucher after a lost connection. The form keeps everything typed and says so; the operator presses `Ctrl+S` again. A background retry queue is a later refinement.
- Drag-and-drop column resizing, column choosers, user-defined report layouts, and printing to dot-matrix printers.

**Known limits:**
- Opening the voucher editor for a voucher whose book was later removed would show an empty book box; books cannot be removed yet, so this cannot happen today.
- The `Lookup` shows at most 50 matches and does not scroll the highlighted match into view; with very long lists add `scrollIntoView` (noted in Task 6).
- The integration tests start the real service once per run (about 10 seconds); on a very slow machine raise `hookTimeout`.
- The manual checklist in Task 16 must still be done by a person before a release: an Electron window, a printer and Excel cannot be exercised by the automated tests.



