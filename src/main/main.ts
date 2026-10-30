import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, powerSaveBlocker, shell, Tray } from 'electron';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, saveConfigPort, updateConfig } from './config';
import { DEFAULT_APPROVAL_MODE, parseApprovalMode, shouldShowCard } from './approvals';
import type { ApprovalMode } from './approvals';
import { resetClickThrough, resetClickThroughWhenIdle } from './clickthrough';
import { PermissionQueue } from './control';
import { demoCountState, demoState } from './demo';
import { appLog, appLogPath, initDiag } from './diag';
import { EventLog, localDate, pruneLogs, writeDevLog, writeWeekLog } from './log';
import { iconPath } from './icon';
import { installHooks, stageHook, uninstallHooks } from './installer';
import { runPerf } from './perf';
import { AwakeManager } from './power';
import { applyRoles, ensureDefaultRoles, loadRoles } from './roles';
import type { RoleDef } from './roles';
import { startServer } from './server';
import { SourceGate } from './source';
import { hooksInstalled, tooltipText } from './status';
import type { WelcomeStatus } from './status';
import { initialState, nextDueMs, pruneStale, reduce, STALE_MS, tick } from './state';
import { createOverlay, createWelcome, toggleOverlay } from './window';
import { defaultLanguage, parseLanguage, t } from '../shared/i18n';
import type { Lang } from '../shared/i18n';
import { officeStats } from '../renderer/scene';
import type { AppState } from '../shared/types';

const PUBLISH_MIN_MS = 50;
const HINT_MS = 9000;
const DEMO_MS = 15000;
const HOTKEY = 'Control+Alt+O';

// packaged: argv = [exe, ...flags]; dev: [electron, appPath, ...flags] -> just take the flags
const args = process.argv.filter((a) => a.startsWith('--'));
const flag = (name: string) => args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const flagValue = (name: string) => flag(name)?.split('=')[1];
// --demo-count=<n>: n sample agents (layout checks); implies --demo
const demoCount = Number(flagValue('demo-count')) || 0;

let state: AppState = initialState();
let demo: AppState | null = null; // temporary sample office (tray / welcome / --demo)
let demoTimer: NodeJS.Timeout | null = null;
let win: BrowserWindow;
let welcomeWin: BrowserWindow | null = null;
let tray: Tray;
let publishTimer: NodeJS.Timeout | null = null;
let publishDirty = false;
let housekeeping: NodeJS.Timeout | null = null; // one-shot, armed for the next due moment only
const gate = new SourceGate();

const awake = new AwakeManager({
  start: (type) => powerSaveBlocker.start(type),
  stop: (id) => powerSaveBlocker.stop(id),
});

const queue = new PermissionQueue({
  onChange: () => {
    if (win && !win.isDestroyed()) win.webContents.send('permissions', queue.pending());
    resetClickThroughWhenIdle(win, queue.pending().length);
  },
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
let lang: Lang = 'en';
let livePort = 0;
let awakeEnabled = true;
let tooltip = '';

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

function updateTooltip(): void {
  if (!tray) return;
  const s = officeStats(Object.values(state.agents));
  const text = tooltipText(s, lang);
  if (text === tooltip) return;
  tooltip = text;
  tray.setToolTip(text);
}

function publish(): void {
  awake.update(state);
  updateTooltip();
  if (publishTimer) { publishDirty = true; return; }
  if (!win.isDestroyed()) win.webContents.send('state', applyRoles(view(), roles));
  publishTimer = setTimeout(() => {
    publishTimer = null;
    if (publishDirty) { publishDirty = false; publish(); }
  }, PUBLISH_MIN_MS);
}

function startDemo(ms: number | null): void {
  demo = demoCount ? demoCountState(demoCount) : demoState();
  if (demoTimer) clearTimeout(demoTimer);
  demoTimer = null;
  showOverlay();
  publish();
  if (ms) demoTimer = setTimeout(() => { demo = null; demoTimer = null; publish(); }, ms);
}

/** Arms a single timer for the next moment tick/pruneStale have work; no timer when nothing is due. */
function syncHousekeeping(): void {
  if (housekeeping) clearTimeout(housekeeping);
  housekeeping = null;
  const delay = nextDueMs(state, Date.now());
  if (delay === null) return;
  housekeeping = setTimeout(() => {
    housekeeping = null;
    const now = Date.now();
    const next = pruneStale(tick(state, now), now, STALE_MS);
    if (next !== state) { state = next; publish(); }
    syncHousekeeping();
  }, delay);
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
      text: [
        t(lang, 'dialog.hooksInstalled'),
        backupPath ? t(lang, 'dialog.backup', { path: backupPath }) : '',
        t(lang, 'dialog.newSessions'),
      ].filter(Boolean).join('\n') + (noNode ? `\n\n${t(lang, 'dialog.noNode')}` : ''),
    };
  } catch (e) {
    appLog('error', 'installer: install failed', e);
    return { ok: false, text: (e as Error).message };
  }
}

function openWelcome(): void {
  if (welcomeWin && !welcomeWin.isDestroyed()) { welcomeWin.focus(); return; }
  welcomeWin = createWelcome(lang);
  welcomeWin.on('closed', () => { welcomeWin = null; });
}

function setLanguage(next: Lang): void {
  if (next === lang) return;
  lang = next;
  updateConfig(configDirPath, { language: next });
  for (const w of [win, welcomeWin]) if (w && !w.isDestroyed()) w.webContents.send('language', next);
  refreshTray();
}

function buildTray(): void {
  tray = new Tray(nativeImage.createFromPath(iconPath()));
  tray.on('click', () => toggleOverlay(win));
  refreshTray();
}

/** (Re)builds menu and tooltip; the menu is rebuilt when the language changes. */
function refreshTray(): void {
  tooltip = '';
  updateTooltip();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t(lang, 'tray.toggle', { hotkey: HOTKEY.replace('Control', 'Ctrl') }), click: () => toggleOverlay(win) },
    { label: t(lang, 'tray.demo'), click: () => startDemo(DEMO_MS) },
    { label: t(lang, 'tray.welcome'), click: () => openWelcome() },
    {
      label: t(lang, 'tray.approvals'),
      submenu: ([
        ['risky', 'tray.approvals.risky'],
        ['all', 'tray.approvals.all'],
        ['off', 'tray.approvals.off'],
      ] as const).map(([mode, key]) => ({
        label: t(lang, key), type: 'radio' as const, checked: approvalMode === mode, click: () => setApprovalMode(mode),
      })),
    },
    {
      label: t(lang, 'tray.language'),
      submenu: ([['de', 'Deutsch'], ['en', 'English']] as const).map(([code, label]) => ({
        label, type: 'radio' as const, checked: lang === code, click: () => setLanguage(code),
      })),
    },
    { type: 'separator' },
    {
      label: t(lang, 'tray.installHooks'),
      click: async () => { const r = installHooksAction(); await toast(r.text, r.ok ? 'info' : 'error'); },
    },
    {
      label: t(lang, 'tray.removeHooks'),
      click: async () => {
        try { uninstallHooks(settingsPath()); await toast(t(lang, 'dialog.hooksRemoved')); }
        catch (e) { appLog('error', 'installer: uninstall failed', e); await toast((e as Error).message, 'error'); }
      },
    },
    { type: 'separator' },
    { label: t(lang, 'tray.devLog'), click: () => void openRecap(false) },
    { label: t(lang, 'tray.weekRecap'), click: () => void openRecap(true) },
    { label: t(lang, 'tray.rolesOpen'), click: () => void shell.openPath(rolesPath) },
    { label: t(lang, 'tray.rolesReload'), click: () => { roles = loadRoles(rolesPath); publish(); } },
    { label: t(lang, 'tray.diagnostics'), click: () => { const p = appLogPath(); if (p) shell.showItemInFolder(p); } },
    { type: 'separator' },
    {
      label: t(lang, 'tray.awake'),
      type: 'checkbox',
      checked: awakeEnabled,
      click: (item) => { awakeEnabled = item.checked; awake.setEnabled(item.checked); },
    },
    {
      label: t(lang, 'tray.autostart'),
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      enabled: app.isPackaged,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { type: 'separator' },
    { label: t(lang, 'tray.quit'), click: () => app.quit() },
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
  initDiag(configDir);
  const config = loadConfig(configDir);
  configDirPath = configDir;
  approvalMode = parseApprovalMode(config.approvals);
  lang = parseLanguage(config.language) ?? defaultLanguage(app.getLocale());
  livePort = config.port;
  // keep an already staged hook in sync with this app version (protocol changes must not silently break it)
  try { if (existsSync(join(configDir, 'hook.js'))) stageHook(hookPath(), configDir); } catch (e) { appLog('warn', 'main: could not refresh staged hook.js', e); }
  eventLog = new EventLog(join(configDir, 'logs'));
  pruneLogs(join(configDir, 'logs'), localDate(Date.now()));
  devLogDir = config.devLogDir || join(configDir, 'devlog');
  app.on('before-quit', () => eventLog.flush());
  rolesPath = join(configDir, 'roles.json');
  ensureDefaultRoles(rolesPath);
  roles = loadRoles(rolesPath);
  win = createOverlay();
  win.webContents.on('did-finish-load', () => {
    resetClickThrough(win);
    win.webContents.send('language', lang);
    win.webContents.send('visibility', true);
    win.webContents.send('state', applyRoles(view(), roles));
    win.webContents.send('permissions', queue.pending());
    win.webContents.send('hint', t(lang, 'hint.start'));
    setTimeout(() => { if (!win.isDestroyed()) win.webContents.send('hint', null); }, HINT_MS);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    appLog('error', `overlay: renderer gone (${details.reason})`);
    resetClickThrough(win);
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
    if (a) { state = reduce(state, { ts: Date.now(), sessionId: a.sessionId, agentId: a.id, event: 'PreToolUse', tool: info.tool, cwd: a.cwd }); syncHousekeeping(); publish(); }
  });
  ipcMain.handle('status', (e): WelcomeStatus | null => {
    if (!welcomeWin || e.sender !== welcomeWin.webContents) return null;
    let text: string | null = null;
    try { text = readFileSync(settingsPath(), 'utf8'); } catch { /* no settings file yet */ }
    return { hooks: hooksInstalled(text), mode: approvalMode, port: livePort };
  });
  ipcMain.handle('action', async (e, name: unknown) => {
    if (!welcomeWin || e.sender !== welcomeWin.webContents) return '';
    if (name === 'install-hooks') return installHooksAction().text;
    if (name === 'demo') { startDemo(DEMO_MS); return t(lang, 'dialog.demoRunning'); }
    if (name === 'close') { welcomeWin.close(); return ''; }
    return '';
  });
  app.on('before-quit', () => queue.dispose());

  if (flag('demo') || demoCount) {
    startDemo(null);
    if (!flag('no-card')) void queue.add({ id: 'demo', agentId: demoCount ? `agent${Math.min(3, demoCount)}` : 'reviewer', tool: 'Bash', summary: 'git push --force origin main' });
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
    livePort = server.port;
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
  else if (!perf && !flag('demo') && !demoCount && !flag('no-welcome') && !config.welcomeShown) {
    openWelcome();
    updateConfig(configDir, { welcomeShown: true });
  }
}

// Non-fatal by design: a stray rejection in a tray app must be logged, not kill the overlay.
process.on('uncaughtException', (e) => appLog('error', 'uncaughtException', e));
process.on('unhandledRejection', (e) => appLog('error', 'unhandledRejection', e));

main().catch((e) => { appLog('error', 'main: startup failed', e); console.error(e); app.quit(); });
