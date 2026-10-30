// Composition root: builds the modules and wires them together. No logic of its own.
import { app, powerSaveBlocker } from 'electron';
import { join } from 'node:path';
import { createActions } from './actions';
import { parseApprovalMode } from './approvals';
import type { ApprovalMode } from './approvals';
import { resetClickThrough, resetClickThroughWhenIdle } from './clickthrough';
import { loadConfig, updateConfig } from './config';
import { PermissionQueue } from './control';
import { runPerf, screenshotAndQuit } from './devtools';
import { appLog, guardProcess, initDiag } from './diag';
import { parseFlags } from './flags';
import { startIngest } from './ingest';
import { registerIpc } from './ipc';
import { EventLog, localDate, pruneLogs } from './log';
import { Office } from './office';
import { parseOpacity } from './opacity';
import { parsePlacement, parsePosition } from './position';
import { AwakeManager } from './power';
import { applyRoles, openRoles } from './roles';
import { parseScale } from './scale';
import { SettingsModel } from './settings';
import { SourceGate } from './source';
import { createTray, HOTKEY_LABEL } from './tray';
import { createOverlay, placeOverlay, resizeOverlay, SettingsWindow, showOverlay, toggleOverlay } from './window';
import { defaultLanguage, parseLanguage, t } from '../shared/i18n';
import type { Lang } from '../shared/i18n';
import { officeStats } from '../renderer/scene';
import type { AppState } from '../shared/types';

const HINT_MS = 9000;
const DEMO_MS = 15000;

const flags = parseFlags(process.argv);

// Measured (tools/perf-check.ts): software rendering + in-process GPU roughly halves RAM
// (154 -> 84 MB idle) for this small 2D canvas. KAYY_GFX=hw opts back into the GPU process.
if (process.env.KAYY_GFX !== 'hw') {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('in-process-gpu');
}

async function main(): Promise<void> {
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }
  await app.whenReady();
  const configDir = flags.configDir ?? join(app.getPath('appData'), 'KayyOffice');
  initDiag(configDir);
  const config = loadConfig(configDir);
  // runtime settings, changed from the settings window (--lang is a debug override and is not saved)
  let lang: Lang = flags.lang ?? parseLanguage(config.language) ?? defaultLanguage(app.getLocale());
  let approvalMode: ApprovalMode = parseApprovalMode(config.approvals);
  let port = config.port;

  const logDir = join(configDir, 'logs');
  const eventLog = new EventLog(logDir);
  pruneLogs(logDir, localDate(Date.now()));
  const rolesPath = join(configDir, 'roles.json');
  const awake = new AwakeManager({ start: (type) => powerSaveBlocker.start(type), stop: (id) => powerSaveBlocker.stop(id) }, { enabled: config.awake !== false });
  const roles = openRoles(rolesPath, () => office.publish());
  const gate = new SourceGate();
  const settings = new SettingsWindow();

  const { win, scale } = createOverlay(parsePosition(config.position), parseScale(flags.scale ?? config.scale), parseOpacity(config.opacity), flags);
  let zoom = scale; // size step actually applied to the overlay
  const render = (view: AppState) => { if (!win.isDestroyed()) win.webContents.send('state', applyRoles(view, roles.current())); };
  const startDemo = (ms: number | null) => { showOverlay(win); office.startDemo(flags.demoCount, ms); };

  const tray = createTray({ toggle: () => toggleOverlay(win), openSettings: () => settings.open(lang), demo: () => startDemo(DEMO_MS) }, lang);
  const office = new Office({ render, changed: (live) => { awake.update(live); tray.setStats(officeStats(Object.values(live.agents))); } });
  const queue = new PermissionQueue({
    onChange: () => {
      if (!win.isDestroyed()) win.webContents.send('permissions', queue.pending());
      resetClickThroughWhenIdle(win, queue.pending().length);
    },
  });

  const pushSettings = () => settings.current?.webContents.send('settings:changed', model.snapshot());
  const actions = createActions({
    lang: () => lang, configDir, devLogDir: config.devLogDir || join(configDir, 'devlog'), rolesPath, eventLog, settings,
    adviceAsked: config.hooksAdvice === 'asked', startDemo: () => startDemo(DEMO_MS), changed: pushSettings,
  });
  actions.refreshStagedHook();

  const model: SettingsModel = new SettingsModel({
    initial: { language: lang, scale: zoom, opacity: parseOpacity(config.opacity), placement: parsePlacement(config.placement), approvals: approvalMode, awake: config.awake !== false },
    version: app.getVersion(),
    hotkey: HOTKEY_LABEL,
    autostartAvailable: app.isPackaged,
    getAutostart: () => app.getLoginItemSettings().openAtLogin,
    setAutostart: (on) => app.setLoginItemSettings({ openAtLogin: on }),
    applyLanguage: (next) => { lang = next; win.webContents.send('language', next); tray.setLang(next); },
    // window bounds first, then the page zoom so layout (CSS px) stays the same
    applyScale: (wanted) => { zoom = resizeOverlay(win, wanted); win.webContents.setZoomFactor(zoom); return zoom; },
    applyOpacity: (o) => win.setOpacity(o),
    applyPlacement: (p) => { placeOverlay(win, p); const [x, y] = win.getPosition(); return { x, y }; },
    setAwake: (on) => awake.setEnabled(on),
    setApprovals: (mode) => { approvalMode = mode; },
    persist: (patch) => updateConfig(configDir, patch),
    hooksInstalled: actions.hooksInstalled,
    modActive: () => gate.modActive(),
    port: () => port,
    changed: pushSettings,
  });
  registerIpc({ win, settings, model, queue, office, action: actions.run });

  win.webContents.on('did-finish-load', () => {
    resetClickThrough(win);
    win.webContents.setZoomFactor(zoom); // the zoom is lost on reload; the window size already includes it
    win.webContents.send('language', lang);
    win.webContents.send('visibility', true);
    render(office.view);
    win.webContents.send('permissions', queue.pending());
    win.webContents.send('hint', t(lang, 'hint.start'));
    setTimeout(() => { if (!win.isDestroyed()) win.webContents.send('hint', null); }, HINT_MS);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    appLog('error', `overlay: renderer gone (${details.reason})`);
    resetClickThrough(win);
  });
  // a second launch (double click) must not look like "nothing happened"
  app.on('second-instance', () => { showOverlay(win); settings.open(lang); });
  app.on('before-quit', () => { eventLog.flush(); queue.dispose(); });
  app.on('window-all-closed', () => { /* tray app: keep running */ });

  if (flags.demo) {
    startDemo(null);
    if (!flags.noCard) void queue.add({ id: 'demo', agentId: flags.demoCount ? `agent${Math.min(3, flags.demoCount)}` : 'reviewer', tool: 'Bash', summary: 'git push --force origin main' });
  } else {
    const server = await startIngest({
      token: config.token, port, gate, eventLog, office, queue, showOverlay: () => showOverlay(win),
      approvalMode: () => approvalMode,
      onModEvent: () => void actions.adviseAboutHooks(),
    });
    if (server.port !== port) updateConfig(configDir, { port: server.port });
    port = server.port;
    app.on('before-quit', () => { void server.close(); });
  }

  if (flags.perf) runPerf(flags.perfSeconds, flags.perf);
  if (flags.settings) settings.open(lang);
  if (flags.screenshot) await screenshotAndQuit(settings.current ?? win, flags.screenshot, settings.current !== null);
  else if (!flags.perf && !flags.demo && !config.welcomeShown) {
    settings.open(lang, true); // first run: the settings window with a short intro on top
    updateConfig(configDir, { welcomeShown: true });
  }
}

guardProcess();
main().catch((e) => { appLog('error', 'main: startup failed', e); console.error(e); app.quit(); });
