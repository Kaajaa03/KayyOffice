import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';

export const OVERLAY_W = 900;
export const OVERLAY_H = 400;

export function createOverlay(): BrowserWindow {
  const wa = screen.getPrimaryDisplay().workArea;
  const width = Math.min(OVERLAY_W, Math.round(wa.width * 0.6));
  const win = new BrowserWindow({
    width,
    height: OVERLAY_H,
    x: wa.x + Math.round((wa.width - width) / 2),
    y: wa.y,
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: true,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  // debug: --hour=<0-23> lets the renderer simulate the time of day (screenshots)
  const hour = process.argv.find((a) => /^--hour=\d{1,2}$/.test(a))?.slice(7);
  win.loadFile(join(__dirname, 'index.html'), hour ? { query: { hour } } : undefined);
  win.once('ready-to-show', () => win.showInactive());
  return win;
}

export function createWelcome(): BrowserWindow {
  const win = new BrowserWindow({
    width: 580,
    height: 700,
    title: 'Kayy Office',
    backgroundColor: '#0f1422',
    autoHideMenuBar: true,
    maximizable: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.removeMenu();
  win.loadFile(join(__dirname, 'welcome.html'));
  return win;
}

export function toggleOverlay(win: BrowserWindow): void {
  if (win.isVisible()) {
    win.webContents.send('visibility', false);
    win.hide();
  } else {
    win.showInactive();
    win.webContents.send('visibility', true);
  }
}
