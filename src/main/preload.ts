import { contextBridge, ipcRenderer } from 'electron';
import type { Lang } from '../shared/i18n';
import type { AppState, PermissionRequestInfo } from '../shared/types';
import type { WelcomeStatus } from './status';

contextBridge.exposeInMainWorld('kayy', {
  onState: (cb: (s: AppState) => void) => ipcRenderer.on('state', (_e, s: AppState) => cb(s)),
  onVisibility: (cb: (v: boolean) => void) => ipcRenderer.on('visibility', (_e, v: boolean) => cb(v)),
  onLanguage: (cb: (lang: Lang) => void) => ipcRenderer.on('language', (_e, l: Lang) => cb(l)),
  onHint: (cb: (t: string | null) => void) => ipcRenderer.on('hint', (_e, t: string | null) => cb(t)),
  onPermissions: (cb: (p: PermissionRequestInfo[]) => void) =>
    ipcRenderer.on('permissions', (_e, p: PermissionRequestInfo[]) => cb(p)),
  setInteractive: (v: boolean) => ipcRenderer.send('interactive', v),
  decide: (id: string, decision: 'allow' | 'deny') => ipcRenderer.send('permission:decide', id, decision),
  /** Dragging the title strip: screen-pixel deltas, then a final end message (main saves the position). */
  dragBy: (dx: number, dy: number) => ipcRenderer.send('drag:by', dx, dy),
  dragEnd: () => ipcRenderer.send('drag:end'),
  /** Welcome window buttons: 'install-hooks' | 'demo' | 'close'. Resolves with a status text. */
  action: (name: string): Promise<string> => ipcRenderer.invoke('action', name),
  /** Welcome window: live status rows (hooks, approval mode, port). */
  status: (): Promise<WelcomeStatus> => ipcRenderer.invoke('status'),
});
