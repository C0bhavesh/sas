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
