import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, powerSaveBlocker, shell, Tray } from 'electron';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, saveConfigPort } from './config';
import { PermissionQueue } from './control';
import { demoState } from './demo';
import { installHooks, uninstallHooks } from './installer';
import { runPerf } from './perf';
import { AwakeManager } from './power';
import { applyRoles, ensureDefaultRoles, loadRoles } from './roles';
import type { RoleDef } from './roles';
import { startServer } from './server';
import { initialState, pruneStale, reduce, tick } from './state';
import { createOverlay, toggleOverlay } from './window';
import type { AppState } from '../shared/types';

const STALE_MS = 15 * 60 * 1000;
const PUBLISH_MIN_MS = 50;
const HOTKEY = 'Control+Alt+O';

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const flagValue = (name: string) => flag(name)?.split('=')[1];

let state: AppState = initialState();
let win: BrowserWindow;
let tray: Tray;
let publishTimer: NodeJS.Timeout | null = null;
let publishDirty = false;
let housekeeping: NodeJS.Timeout | null = null;

const awake = new AwakeManager({
  start: (type) => powerSaveBlocker.start(type),
  stop: (id) => powerSaveBlocker.stop(id),
});

const queue = new PermissionQueue({
  onChange: () => { if (win && !win.isDestroyed()) win.webContents.send('permissions', queue.pending()); },
});

function showOverlay(): void {
  if (win.isVisible()) return;
  win.showInactive();
  win.webContents.send('visibility', true);
}

let roles: RoleDef[] = [];
let rolesPath = '';

function publish(): void {
  awake.update(state);
  if (publishTimer) { publishDirty = true; return; }
  if (!win.isDestroyed()) win.webContents.send('state', applyRoles(state, roles));
  publishTimer = setTimeout(() => {
    publishTimer = null;
    if (publishDirty) { publishDirty = false; publish(); }
  }, PUBLISH_MIN_MS);
}

function syncHousekeeping(): void {
  const hasAgents = Object.keys(state.agents).length > 0;
  if (hasAgents && !housekeeping) {
    housekeeping = setInterval(() => {
      const next = pruneStale(tick(state, Date.now()), Date.now(), STALE_MS);
      if (next !== state) { state = next; publish(); }
      if (!Object.keys(state.agents).length && housekeeping) { clearInterval(housekeeping); housekeeping = null; }
    }, 5000);
  }
}

function trayIcon() {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const border = x < 2 || y < 2 || x >= size - 2 || y >= size - 2;
    const [b, g, r] = border ? [0xfa, 0x97, 0x77] : y < 8 ? [0x5c, 0x3d, 0x2c] : [0xff, 0xd4, 0x3b];
    buf[i] = b; buf[i + 1] = g; buf[i + 2] = r; buf[i + 3] = 255;
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

const settingsPath = () => join(homedir(), '.claude', 'settings.json');
const hookPath = () => (app.isPackaged ? join(process.resourcesPath, 'hook', 'hook.js') : join(app.getAppPath(), 'hook', 'hook.js'));

async function toast(message: string, type: 'info' | 'error' = 'info'): Promise<void> {
  await dialog.showMessageBox({ type, title: 'Kayy Office', message });
}

function buildTray(): void {
  tray = new Tray(trayIcon());
  tray.setToolTip('Kayy Office');
  tray.on('click', () => toggleOverlay(win));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Anzeigen / Verstecken (${HOTKEY.replace('Control', 'Ctrl')})`, click: () => toggleOverlay(win) },
    {
      label: 'Hooks installieren',
      click: async () => {
        try {
          const { backupPath } = installHooks(settingsPath(), hookPath());
          await toast(`Hooks installiert.${backupPath ? `\nBackup: ${backupPath}` : ''}\nNeue Claude-Code-Sessions nutzen sie automatisch.`);
        } catch (e) { await toast((e as Error).message, 'error'); }
      },
    },
    {
      label: 'Hooks entfernen',
      click: async () => {
        try { uninstallHooks(settingsPath()); await toast('Hooks entfernt.'); }
        catch (e) { await toast((e as Error).message, 'error'); }
      },
    },
    { label: 'Rollen-Datei öffnen (roles.json)', click: () => void shell.openPath(rolesPath) },
    { label: 'Rollen neu laden', click: () => { roles = loadRoles(rolesPath); publish(); } },
    {
      label: 'Wach bleiben, solange Agents arbeiten',
      type: 'checkbox',
      checked: true,
      click: (item) => awake.setEnabled(item.checked),
    },
    { type: 'separator' },
    { label: 'Beenden', click: () => app.quit() },
  ]));
}

async function screenshotAndQuit(path: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 1500));
  const img = await win.webContents.capturePage();
  writeFileSync(path, img.toPNG());
  app.quit();
}

// Measured (tools/perf-check.ts): software rendering + in-process GPU roughly halves RAM
// (154 -> 84 MB idle) for this small 2D canvas. KAYY_GFX=hw opts back into the GPU process.
if (process.env.KAYY_GFX !== 'hw') {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('in-process-gpu');
}

async function main(): Promise<void> {
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }
  await app.whenReady();

  const configDir = join(app.getPath('appData'), 'KayyOffice');
  const config = loadConfig(configDir);
  rolesPath = join(configDir, 'roles.json');
  ensureDefaultRoles(rolesPath);
  roles = loadRoles(rolesPath);
  win = createOverlay();
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('visibility', true);
    win.webContents.send('state', applyRoles(state, roles));
    win.webContents.send('permissions', queue.pending());
  });

  ipcMain.on('interactive', (_e, v: unknown) => {
    if (typeof v === 'boolean') win.setIgnoreMouseEvents(!v, { forward: true });
  });
  ipcMain.on('permission:decide', (_e, id: unknown, decision: unknown) => {
    if (typeof id !== 'string' || (decision !== 'allow' && decision !== 'deny')) return;
    const info = queue.pending().find((p) => p.id === id);
    if (!info || !queue.resolve(id, decision)) return;
    const a = state.agents[info.agentId];
    if (a) { state = reduce(state, { ts: Date.now(), sessionId: a.sessionId, agentId: a.id, event: 'PreToolUse', tool: info.tool, cwd: a.cwd }); publish(); }
  });
  app.on('before-quit', () => queue.dispose());

  if (flag('demo')) {
    state = demoState();
    void queue.add({ id: 'demo', agentId: 'reviewer', tool: 'Bash', summary: 'npm run build && node dist/main.js' });
  } else {
    const server = await startServer({
      token: config.token,
      port: config.port,
      onEvent: (e) => { state = reduce(state, e); syncHousekeeping(); publish(); },
      onPermission: (p, signal) => {
        const known = state.agents[p.agentId];
        state = reduce(state, {
          ts: Date.now(), sessionId: p.sessionId, agentId: p.agentId, event: 'Notification',
          cwd: known?.cwd ?? '', message: `permission: ${p.tool}`,
        });
        syncHousekeeping();
        publish();
        showOverlay();
        return queue.add({ id: randomUUID(), agentId: p.agentId, tool: p.tool, summary: p.summary }, signal);
      },
    });
    if (server.port !== config.port) saveConfigPort(configDir, server.port);
    app.on('before-quit', () => { void server.close(); });
  }

  buildTray();
  globalShortcut.register(HOTKEY, () => toggleOverlay(win));
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => { /* tray app: keep running */ });

  const perf = flagValue('perf');
  if (perf) runPerf(Number(flagValue('perf-seconds') ?? 20), perf);

  const shot = flagValue('screenshot');
  if (shot) await screenshotAndQuit(shot);
}

main().catch((e) => { console.error(e); app.quit(); });
