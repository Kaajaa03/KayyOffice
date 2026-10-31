// IPC handlers: overlay window (drag, size, permission answers) and settings window.
// Only the window a message belongs to may send it: the windows share one preload.
import { ipcMain, screen } from 'electron';
import type { BrowserWindow } from 'electron';
import type { PermissionQueue } from './control';
import type { Office } from './office';
import type { ActionResult, SettingsModel } from './settings';
import { moveOverlayTo } from './window';
import type { SettingsWindow } from './window';

interface IpcDeps {
  win: BrowserWindow;
  settings: SettingsWindow;
  model: SettingsModel;
  queue: PermissionQueue;
  office: Office;
  action(name: unknown): Promise<ActionResult>;
}

type Pt = { x: number; y: number };

export function registerIpc({ win, settings, model, queue, office, action }: IpcDeps): void {
  const fromOverlay = (e: { sender: unknown }) => e.sender === win.webContents;

  ipcMain.on('interactive', (e, v: unknown) => {
    if (fromOverlay(e) && typeof v === 'boolean') win.setIgnoreMouseEvents(!v, { forward: true });
  });

  // the drag follows the real cursor (not screenX deltas), so it is exact at every page zoom and DPI
  let dragFrom: { cursor: Pt; origin: Pt } | null = null;
  const position = (): Pt => { const [x, y] = win.getPosition(); return { x, y }; };
  ipcMain.on('drag:start', (e) => {
    if (fromOverlay(e)) dragFrom = { cursor: screen.getCursorScreenPoint(), origin: position() };
  });
  ipcMain.on('drag:move', (e) => {
    if (!fromOverlay(e) || !dragFrom) return;
    const c = screen.getCursorScreenPoint();
    moveOverlayTo(win, { x: dragFrom.origin.x + c.x - dragFrom.cursor.x, y: dragFrom.origin.y + c.y - dragFrom.cursor.y });
  });
  ipcMain.on('drag:end', (e) => {
    if (!fromOverlay(e) || !dragFrom) return;
    dragFrom = null;
    model.dragged(position());
  });

  ipcMain.on('scale:step', (e, dir: unknown) => {
    if (fromOverlay(e) && (dir === 1 || dir === -1)) model.stepScale(dir);
  });

  // a settled card lets the office show the agent working again
  const settled = (info: { agentId: string; tool: string }) => {
    const a = office.agent(info.agentId);
    if (a) office.apply({ ts: Date.now(), sessionId: a.sessionId, agentId: a.id, event: 'PreToolUse', tool: info.tool, cwd: a.cwd });
  };

  ipcMain.on('permission:decide', (e, id: unknown, decision: unknown) => {
    if (!fromOverlay(e) || typeof id !== 'string' || (decision !== 'allow' && decision !== 'deny')) return;
    const info = queue.pending().find((p) => p.id === id);
    if (info && queue.resolve(id, decision)) settled(info);
  });

  // a click on option `index` of a question card (queue.choose refuses anything but a question and a bad index)
  ipcMain.on('permission:choose', (e, id: unknown, index: unknown) => {
    if (!fromOverlay(e) || typeof id !== 'string' || typeof index !== 'number') return;
    const info = queue.pending().find((p) => p.id === id);
    if (info && queue.choose(id, index)) settled(info);
  });

  ipcMain.handle('settings:get', (e) => (settings.owns(e.sender) ? model.snapshot() : null));
  ipcMain.handle('settings:set', (e, key: unknown, value: unknown) => (settings.owns(e.sender) ? model.set(key, value) : { ok: false, error: 'unknown' }));
  ipcMain.handle('settings:action', (e, name: unknown) => (settings.owns(e.sender) ? action(name) : { ok: false, text: '' }));
}
