import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, powerSaveBlocker, shell, Tray } from 'electron';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, saveConfigPort, updateConfig } from './config';
import { DEFAULT_APPROVAL_MODE, parseApprovalMode, shouldShowCard } from './approvals';
import type { ApprovalMode } from './approvals';
import { PermissionQueue } from './control';
import { demoState } from './demo';
import { EventLog, localDate, writeDevLog, writeWeekLog } from './log';
import { installHooks, stageHook, uninstallHooks } from './installer';
import { runPerf } from './perf';
import { AwakeManager } from './power';
import { applyRoles, ensureDefaultRoles, loadRoles } from './roles';
import type { RoleDef } from './roles';
import { startServer } from './server';
import { SourceGate } from './source';
import { initialState, pruneStale, reduce, tick } from './state';
import { createOverlay, createWelcome, toggleOverlay } from './window';
import type { AppState } from '../shared/types';

const STALE_MS = 15 * 60 * 1000;
const PUBLISH_MIN_MS = 50;
const HINT_MS = 9000;
const DEMO_MS = 15000;
const HOTKEY = 'Control+Alt+O';

// packaged: argv = [exe, ...flags]; dev: [electron, appPath, ...flags] -> just take the flags
const args = process.argv.filter((a) => a.startsWith('--'));
const flag = (name: string) => args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const flagValue = (name: string) => flag(name)?.split('=')[1];

let state: AppState = initialState();
let demo: AppState | null = null; // temporary sample office (tray / welcome / --demo)
let demoTimer: NodeJS.Timeout | null = null;
let win: BrowserWindow;
let welcomeWin: BrowserWindow | null = null;
let tray: Tray;
let publishTimer: NodeJS.Timeout | null = null;
let publishDirty = false;
let housekeeping: NodeJS.Timeout | null = null;
const gate = new SourceGate();

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
let eventLog = new EventLog(null);
let devLogDir = '';
let configDirPath = '';
let approvalMode: ApprovalMode = DEFAULT_APPROVAL_MODE;

function setApprovalMode(mode: ApprovalMode): void {
  approvalMode = mode;
  updateConfig(configDirPath, { approvals: mode });
}

async function openRecap(week: boolean): Promise<void> {
  const today = localDate(Date.now());
  const file = week ? writeWeekLog(devLogDir, today, eventLog) : writeDevLog(devLogDir, eventLog.day(today));
  await shell.openPath(file);
}

const view = (): AppState => demo ?? state;

function publish(): void {
  awake.update(state);
  if (publishTimer) { publishDirty = true; return; }
  if (!win.isDestroyed()) win.webContents.send('state', applyRoles(view(), roles));
  publishTimer = setTimeout(() => {
    publishTimer = null;
    if (publishDirty) { publishDirty = false; publish(); }
  }, PUBLISH_MIN_MS);
}

function startDemo(ms: number | null): void {
  demo = demoState();
  if (demoTimer) clearTimeout(demoTimer);
  demoTimer = null;
  showOverlay();
  publish();
  if (ms) demoTimer = setTimeout(() => { demo = null; demoTimer = null; publish(); }, ms);
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

/** Shared by tray and welcome window; returns a human-readable result (never throws). */
function installHooksAction(): { ok: boolean; text: string } {
  try {
    const staged = stageHook(hookPath(), configDirPath);
    const { backupPath } = installHooks(settingsPath(), staged);
    const noNode = spawnSync('where', ['node'], { windowsHide: true }).status !== 0;
    return {
      ok: true,
      text:
        `Hooks installiert.${backupPath ? `\nBackup: ${backupPath}` : ''}\nNeue Claude-Code-Sessions nutzen sie automatisch.` +
        (noNode ? '\n\nACHTUNG: "node" wurde nicht im PATH gefunden. Die Hooks brauchen Node.js, sonst melden sie Fehler.' : ''),
    };
  } catch (e) {
    return { ok: false, text: (e as Error).message };
  }
}

function openWelcome(): void {
  if (welcomeWin && !welcomeWin.isDestroyed()) { welcomeWin.focus(); return; }
  welcomeWin = createWelcome();
  welcomeWin.on('closed', () => { welcomeWin = null; });
}

function buildTray(): void {
  tray = new Tray(trayIcon());
  tray.setToolTip('Kayy Office – Klick: ein/aus');
  tray.on('click', () => toggleOverlay(win));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Anzeigen / Verstecken (${HOTKEY.replace('Control', 'Ctrl')})`, click: () => toggleOverlay(win) },
    { label: 'Demo zeigen (15 s)', click: () => startDemo(DEMO_MS) },
    { label: 'Willkommen / Hilfe', click: () => openWelcome() },
    {
      label: 'Freigabe-Karten im Overlay',
      submenu: ([
        ['risky', 'Nur bei riskanten Befehlen (Standard)'],
        ['all', 'Bei jeder Rückfrage'],
        ['off', 'Nie (Claude fragt normal)'],
      ] as Array<[ApprovalMode, string]>).map(([mode, label]) => ({
        label, type: 'radio' as const, checked: approvalMode === mode, click: () => setApprovalMode(mode),
      })),
    },
    { type: 'separator' },
    {
      label: 'Hooks installieren',
      click: async () => { const r = installHooksAction(); await toast(r.text, r.ok ? 'info' : 'error'); },
    },
    {
      label: 'Hooks entfernen',
      click: async () => {
        try { uninstallHooks(settingsPath()); await toast('Hooks entfernt.'); }
        catch (e) { await toast((e as Error).message, 'error'); }
      },
    },
    { type: 'separator' },
    { label: 'Dev-Log (heute) öffnen', click: () => void openRecap(false) },
    { label: 'Wochen-Recap öffnen', click: () => void openRecap(true) },
    { label: 'Rollen-Datei öffnen (roles.json)', click: () => void shell.openPath(rolesPath) },
    { label: 'Rollen neu laden', click: () => { roles = loadRoles(rolesPath); publish(); } },
    { type: 'separator' },
    {
      label: 'Wach bleiben, solange Agents arbeiten',
      type: 'checkbox',
      checked: true,
      click: (item) => awake.setEnabled(item.checked),
    },
    {
      label: 'Mit Windows starten',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      enabled: app.isPackaged,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { type: 'separator' },
    { label: 'Beenden', click: () => app.quit() },
  ]));
}

async function screenshotAndQuit(path: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 1500));
  const target = flag('welcome') && welcomeWin && !welcomeWin.isDestroyed() ? welcomeWin : win;
  const img = await target.webContents.capturePage();
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
  configDirPath = configDir;
  approvalMode = parseApprovalMode(config.approvals);
  // keep an already staged hook in sync with this app version (protocol changes must not silently break it)
  try { if (existsSync(join(configDir, 'hook.js'))) stageHook(hookPath(), configDir); } catch { /* best effort */ }
  eventLog = new EventLog(join(configDir, 'logs'));
  devLogDir = config.devLogDir || join(configDir, 'devlog');
  app.on('before-quit', () => eventLog.flush());
  rolesPath = join(configDir, 'roles.json');
  ensureDefaultRoles(rolesPath);
  roles = loadRoles(rolesPath);
  win = createOverlay();
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('visibility', true);
    win.webContents.send('state', applyRoles(view(), roles));
    win.webContents.send('permissions', queue.pending());
    win.webContents.send('hint', 'Kayy Office läuft · wartet auf Agents · Strg+Alt+O');
    setTimeout(() => { if (!win.isDestroyed()) win.webContents.send('hint', null); }, HINT_MS);
  });
  // a second launch (double click) must not look like "nothing happened"
  app.on('second-instance', () => { showOverlay(); openWelcome(); });

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
  ipcMain.handle('action', async (e, name: unknown) => {
    if (!welcomeWin || e.sender !== welcomeWin.webContents) return '';
    if (name === 'install-hooks') return installHooksAction().text;
    if (name === 'demo') { startDemo(DEMO_MS); return 'Demo läuft 15 Sekunden – schau an den oberen Bildschirmrand.'; }
    if (name === 'close') { welcomeWin.close(); return ''; }
    return '';
  });
  app.on('before-quit', () => queue.dispose());

  if (flag('demo')) {
    startDemo(null);
    void queue.add({ id: 'demo', agentId: 'reviewer', tool: 'Bash', summary: 'git push --force origin main' });
  } else {
    const server = await startServer({
      token: config.token,
      port: config.port,
      onEvent: (e) => {
        if (!gate.acceptEvent(e)) return;
        eventLog.append(e);
        state = reduce(state, e);
        syncHousekeeping();
        publish();
      },
      onPermission: (p, signal) => {
        if (!gate.acceptPermission(p)) return Promise.resolve('ask' as const);
        // everyday requests stay with Claude's own dialog; the overlay only speaks up for real risks
        if (!shouldShowCard(approvalMode, p.tool, p.summary)) return Promise.resolve('ask' as const);
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
  if (flag('welcome')) openWelcome();
  if (shot) await screenshotAndQuit(shot);
  else if (!perf && !flag('demo') && !flag('no-welcome') && !config.welcomeShown) {
    openWelcome();
    updateConfig(configDir, { welcomeShown: true });
  }
}

main().catch((e) => { console.error(e); app.quit(); });
