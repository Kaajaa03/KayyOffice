import { contextBridge, ipcRenderer } from 'electron';
import type { AppState } from '../shared/types';

contextBridge.exposeInMainWorld('kayy', {
  onState: (cb: (s: AppState) => void) => ipcRenderer.on('state', (_e, s: AppState) => cb(s)),
  onVisibility: (cb: (v: boolean) => void) => ipcRenderer.on('visibility', (_e, v: boolean) => cb(v)),
});
