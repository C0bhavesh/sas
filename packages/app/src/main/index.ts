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
