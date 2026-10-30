import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, powerSaveBlocker, screen, shell, Tray } from 'electron';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, watch, writeFileSync } from 'node:fs';
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
import { initialState, nextDueMs, pruneStale, reduce, tick } from './state';
import { createOverlay, createSettings, createWelcome, moveOverlayTo, placeOverlay, resizeOverlay, toggleOverlay } from './window';
import { parsePlacement, parsePosition } from './position';
import { parseOpacity } from './opacity';
import { parseScale } from './scale';
import { SettingsModel } from './settings';
import type { ActionResult } from './settings';
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
let settingsWin: BrowserWindow | null = null;
let model: SettingsModel;
let zoom = 1; // size step actually applied to the overlay
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
let tooltip = '';

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
    const next = pruneStale(tick(state, now), now);
    if (next !== state) { state = next; publish(); }
    syncHousekeeping();
  }, delay);
}

const settingsPath = () => join(homedir(), '.claude', 'settings.json');
const hookPath = () => (app.isPackaged ? join(process.resourcesPath, 'hook', 'hook.js') : join(app.getAppPath(), 'hook', 'hook.js'));

/** Shared by settings and welcome window; returns a plain-language result (never throws). */
function installHooksAction(): ActionResult {
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
    return { ok: false, text: t(lang, 'dialog.failed') };
  }
}

function uninstallHooksAction(): ActionResult {
  try {
    uninstallHooks(settingsPath());
    return { ok: true, text: t(lang, 'dialog.hooksRemoved') };
  } catch (e) {
    appLog('error', 'installer: uninstall failed', e);
    return { ok: false, text: t(lang, 'dialog.failed') };
  }
}

let hooksAdviceDone = false;

/** Once, when the Claude mod reports while the hooks are installed too: the hooks only cost a
 *  process per tool call and add nothing, so offer to remove them. Asked once, ever. */
async function adviseAboutHooks(): Promise<void> {
  if (hooksAdviceDone) return;
  hooksAdviceDone = true;
  let text: string | null = null;
  try { text = readFileSync(settingsPath(), 'utf8'); } catch { return; /* no settings file: no hooks */ }
  if (!hooksInstalled(text)) return;
  updateConfig(configDirPath, { hooksAdvice: 'asked' });
  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: 'Kayy Office',
    message: t(lang, 'advice.hooks.text'),
    buttons: [t(lang, 'advice.hooks.remove'), t(lang, 'advice.hooks.keep')],
    defaultId: 1,
    cancelId: 1,
  });
  if (response !== 0) return;
  try { uninstallHooks(settingsPath()); } catch (e) { appLog('error', 'installer: uninstall after advice failed', e); }
}

function openWelcome(): void {
  if (welcomeWin && !welcomeWin.isDestroyed()) { welcomeWin.focus(); return; }
  welcomeWin = createWelcome(lang);
  welcomeWin.on('closed', () => { welcomeWin = null; });
}

function openSettings(): void {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = createSettings(lang);
  settingsWin.on('closed', () => { settingsWin = null; });
}

/** Pushes a fresh snapshot to the settings window (something changed in the settings, tray, drag or hooks). */
function pushSettings(): void {
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('settings:changed', model.snapshot());
}

/** Applies a size step: window bounds first, then the page zoom so layout (CSS px) stays the same. */
function applyScale(wanted: number): number {
  zoom = resizeOverlay(win, wanted);
  win.webContents.setZoomFactor(zoom);
  return zoom;
}

function applyLanguage(next: Lang): void {
  lang = next;
  for (const w of [win, welcomeWin, settingsWin]) if (w && !w.isDestroyed()) w.webContents.send('language', next);
  refreshTray();
}

/** Result text of a tool button that opens a file/folder. */
async function openPath(file: string): Promise<ActionResult> {
  const err = await shell.openPath(file);
  return err ? { ok: false, text: t(lang, 'set.msg.openFailed') } : { ok: true, text: '' };
}

async function settingsAction(name: unknown): Promise<ActionResult> {
  switch (name) {
    case 'install-hooks': { const r = installHooksAction(); pushSettings(); return r; }
    case 'remove-hooks': { const r = uninstallHooksAction(); pushSettings(); return r; }
    case 'demo': startDemo(DEMO_MS); return { ok: true, text: t(lang, 'dialog.demoRunning') };
    case 'welcome': openWelcome(); return { ok: true, text: '' };
    case 'devlog': await openRecap(false); return { ok: true, text: '' };
    case 'week': await openRecap(true); return { ok: true, text: '' };
    case 'roles': return openPath(rolesPath);
    case 'diag': {
      const p = appLogPath();
      if (!p || !existsSync(p)) return { ok: true, text: t(lang, 'set.msg.noDiag') };
      shell.showItemInFolder(p);
      return { ok: true, text: '' };
    }
    case 'close': settingsWin?.close(); return { ok: true, text: '' };
    default: return { ok: false, text: t(lang, 'set.err.invalid') };
  }
}

function buildTray(): void {
  tray = new Tray(nativeImage.createFromPath(iconPath()));
  tray.on('click', () => toggleOverlay(win));
  tray.on('double-click', () => openSettings());
  refreshTray();
}

/** (Re)builds menu and tooltip; the menu is rebuilt when the language changes. */
function refreshTray(): void {
  tooltip = '';
  updateTooltip();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t(lang, 'tray.toggle', { hotkey: HOTKEY.replace('Control', 'Ctrl') }), click: () => toggleOverlay(win) },
    { label: t(lang, 'tray.settings'), click: () => openSettings() },
    { label: t(lang, 'tray.demo'), click: () => startDemo(DEMO_MS) },
    { type: 'separator' },
    { label: t(lang, 'tray.quit'), click: () => app.quit() },
  ]));
}

async function screenshotAndQuit(path: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 1500));
  const target = [flag('settings') ? settingsWin : null, flag('welcome') ? welcomeWin : null].find((w) => w && !w.isDestroyed()) ?? win;
  if (target === settingsWin) { // the whole (scrolling) page in one picture
    const h = await target.webContents.executeJavaScript('document.documentElement.scrollHeight') as number;
    target.setMaximumSize(0, 0);
    target.setContentSize(560, h);
    await new Promise((r) => setTimeout(r, 300));
  }
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

  // --config-dir=<path> is a debug flag (manual runs must not touch the real settings)
  const configDir = flagValue('config-dir') ?? join(app.getPath('appData'), 'KayyOffice');
  initDiag(configDir);
  const config = loadConfig(configDir);
  configDirPath = configDir;
  approvalMode = parseApprovalMode(config.approvals);
  hooksAdviceDone = config.hooksAdvice === 'asked';
  // --lang=<de|en> is a debug flag for screenshots (the run does not save it)
  lang = parseLanguage(flagValue('lang')) ?? parseLanguage(config.language) ?? defaultLanguage(app.getLocale());
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
  // edits of roles.json apply right after saving; fs.watch is event-driven (no timer, no polling)
  let rolesDebounce: NodeJS.Timeout | null = null;
  try {
    watch(configDir, (_event, name) => {
      if (name !== 'roles.json') return;
      if (rolesDebounce) clearTimeout(rolesDebounce);
      rolesDebounce = setTimeout(() => { rolesDebounce = null; roles = loadRoles(rolesPath); publish(); }, 300);
    }).on('error', (e) => appLog('warn', 'main: roles watcher stopped', e));
  } catch (e) { appLog('warn', 'main: cannot watch roles.json', e); }
  awake.setEnabled(config.awake !== false);
  // --scale=<n> is a debug flag for screenshots (the run does not save it)
  const created = createOverlay(parsePosition(config.position), parseScale(flagValue('scale') !== undefined ? Number(flagValue('scale')) : config.scale), parseOpacity(config.opacity));
  win = created.win;
  zoom = created.scale;
  model = new SettingsModel({
    initial: { language: lang, scale: zoom, opacity: parseOpacity(config.opacity), placement: parsePlacement(config.placement), approvals: approvalMode, awake: config.awake !== false },
    version: app.getVersion(),
    hotkey: HOTKEY.replace('Control', 'Ctrl'),
    autostartAvailable: app.isPackaged,
    getAutostart: () => app.getLoginItemSettings().openAtLogin,
    setAutostart: (on) => app.setLoginItemSettings({ openAtLogin: on }),
    applyLanguage,
    applyScale,
    applyOpacity: (o) => win.setOpacity(o),
    applyPlacement: (p) => { placeOverlay(win, p); const [x, y] = win.getPosition(); return { x, y }; },
    setAwake: (on) => awake.setEnabled(on),
    setApprovals: (mode) => { approvalMode = mode; },
    persist: (patch) => updateConfig(configDirPath, patch),
    hooksInstalled: () => {
      try { return hooksInstalled(readFileSync(settingsPath(), 'utf8')); } catch { return false; /* no settings file yet */ }
    },
    modActive: () => gate.modActive(),
    port: () => livePort,
    changed: pushSettings,
  });
  win.webContents.on('did-finish-load', () => {
    resetClickThrough(win);
    win.webContents.setZoomFactor(zoom); // the zoom is lost on reload; the window size already includes it
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

  // only the overlay window may drive click-through and decisions (the welcome window shares the preload)
  ipcMain.on('interactive', (e, v: unknown) => {
    if (e.sender !== win.webContents) return;
    if (typeof v === 'boolean') win.setIgnoreMouseEvents(!v, { forward: true });
  });
  // the drag follows the real cursor (not screenX deltas), so it is exact at every page zoom and DPI
  let dragFrom: { cursor: { x: number; y: number }; origin: { x: number; y: number } } | null = null;
  ipcMain.on('drag:start', (e) => {
    if (e.sender !== win.webContents) return;
    const [x, y] = win.getPosition();
    dragFrom = { cursor: screen.getCursorScreenPoint(), origin: { x, y } };
  });
  ipcMain.on('drag:move', (e) => {
    if (e.sender !== win.webContents || !dragFrom) return;
    const c = screen.getCursorScreenPoint();
    moveOverlayTo(win, { x: dragFrom.origin.x + c.x - dragFrom.cursor.x, y: dragFrom.origin.y + c.y - dragFrom.cursor.y });
  });
  ipcMain.on('drag:end', (e) => {
    if (e.sender !== win.webContents || !dragFrom) return;
    dragFrom = null;
    const [x, y] = win.getPosition();
    model.dragged({ x, y });
  });
  ipcMain.on('scale:step', (e, dir: unknown) => {
    if (e.sender !== win.webContents) return;
    if (dir === 1 || dir === -1) model.stepScale(dir);
  });
  ipcMain.on('permission:decide', (e, id: unknown, decision: unknown) => {
    if (e.sender !== win.webContents) return;
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
    if (name === 'lang:de' || name === 'lang:en') { model.set('language', name.slice(5)); return ''; }
    if (name === 'open-settings') { openSettings(); return ''; }
    return '';
  });
  // settings window: the sender must be that window (the other windows share the preload)
  const fromSettings = (e: Electron.IpcMainInvokeEvent) => settingsWin !== null && !settingsWin.isDestroyed() && e.sender === settingsWin.webContents;
  ipcMain.handle('settings:get', (e) => (fromSettings(e) ? model.snapshot() : null));
  ipcMain.handle('settings:set', (e, key: unknown, value: unknown) => (fromSettings(e) ? model.set(key, value) : { ok: false, error: 'unknown' }));
  ipcMain.handle('settings:action', (e, name: unknown) => (fromSettings(e) ? settingsAction(name) : { ok: false, text: '' }));
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
        if (e.source === 'mod') void adviseAboutHooks();
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
  if (flag('settings')) openSettings();
  if (shot) await screenshotAndQuit(shot);
  else if (!perf && !flag('demo') && !demoCount && !flag('no-welcome') && !config.welcomeShown) {
    openWelcome();
    updateConfig(configDir, { welcomeShown: true });
  }
}

// Non-fatal by design: a stray rejection in a tray app must be logged, not kill the overlay.
// Logged and survived: a stray error in one handler must not take the whole overlay down.
process.on('uncaughtException', (e) => { console.error('uncaughtException', e); appLog('error', 'uncaughtException', e); });
process.on('unhandledRejection', (e) => { console.error('unhandledRejection', e); appLog('error', 'unhandledRejection', e); });

main().catch((e) => { appLog('error', 'main: startup failed', e); console.error(e); app.quit(); });
