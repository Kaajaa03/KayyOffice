import { contextBridge, ipcRenderer } from 'electron';
import type { AppState, PermissionRequestInfo } from '../shared/types';

contextBridge.exposeInMainWorld('kayy', {
  onState: (cb: (s: AppState) => void) => ipcRenderer.on('state', (_e, s: AppState) => cb(s)),
  onVisibility: (cb: (v: boolean) => void) => ipcRenderer.on('visibility', (_e, v: boolean) => cb(v)),
  onPermissions: (cb: (p: PermissionRequestInfo[]) => void) =>
    ipcRenderer.on('permissions', (_e, p: PermissionRequestInfo[]) => cb(p)),
  setInteractive: (v: boolean) => ipcRenderer.send('interactive', v),
  decide: (id: string, decision: 'allow' | 'deny') => ipcRenderer.send('permission:decide', id, decision),
});
