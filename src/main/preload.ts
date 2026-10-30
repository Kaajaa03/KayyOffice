import { contextBridge, ipcRenderer } from 'electron';
import type { Lang } from '../shared/i18n';
import type { AppState, PermissionRequestInfo } from '../shared/types';
import type { WelcomeStatus } from './status';
import type { ActionResult, SetResult, SettingsSnapshot } from './settings';

contextBridge.exposeInMainWorld('kayy', {
  onState: (cb: (s: AppState) => void) => ipcRenderer.on('state', (_e, s: AppState) => cb(s)),
  onVisibility: (cb: (v: boolean) => void) => ipcRenderer.on('visibility', (_e, v: boolean) => cb(v)),
  onLanguage: (cb: (lang: Lang) => void) => ipcRenderer.on('language', (_e, l: Lang) => cb(l)),
  onHint: (cb: (t: string | null) => void) => ipcRenderer.on('hint', (_e, t: string | null) => cb(t)),
  onPermissions: (cb: (p: PermissionRequestInfo[]) => void) =>
    ipcRenderer.on('permissions', (_e, p: PermissionRequestInfo[]) => cb(p)),
  setInteractive: (v: boolean) => ipcRenderer.send('interactive', v),
  decide: (id: string, decision: 'allow' | 'deny') => ipcRenderer.send('permission:decide', id, decision),
  /** Dragging the title strip: main follows the real cursor (independent of page zoom), then saves the position. */
  dragStart: () => ipcRenderer.send('drag:start'),
  dragMove: () => ipcRenderer.send('drag:move'),
  dragEnd: () => ipcRenderer.send('drag:end'),
  /** Ctrl + wheel over the title strip: one size step up (+1) or down (-1). */
  stepScale: (dir: 1 | -1) => ipcRenderer.send('scale:step', dir),
  /** Settings window. */
  settings: {
    get: (): Promise<SettingsSnapshot | null> => ipcRenderer.invoke('settings:get'),
    set: (key: string, value: unknown): Promise<SetResult> => ipcRenderer.invoke('settings:set', key, value),
    action: (name: string): Promise<ActionResult> => ipcRenderer.invoke('settings:action', name),
    onChanged: (cb: (s: SettingsSnapshot) => void) => ipcRenderer.on('settings:changed', (_e, s: SettingsSnapshot) => cb(s)),
  },
  /** Welcome window buttons: 'install-hooks' | 'demo' | 'close'. Resolves with a status text. */
  action: (name: string): Promise<string> => ipcRenderer.invoke('action', name),
  /** Welcome window: live status rows (hooks, approval mode, port). */
  status: (): Promise<WelcomeStatus> => ipcRenderer.invoke('status'),
});
