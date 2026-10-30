import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { resetClickThrough } from './clickthrough';
import type { Lang } from '../shared/i18n';
import { iconPath } from './icon';

export const OVERLAY_W = 900;
/** Narrowest width the room (one desk cluster + kitchen + lounge) fits into. */
export const OVERLAY_MIN_W = 460;
/** Room (max 300) + header/footer + a permission card below it. Transparent and click-through, so spare height costs nothing. */
export const OVERLAY_H = 460;

export function createOverlay(): BrowserWindow {
  const wa = screen.getPrimaryDisplay().workArea;
  // --overlay-width=<px> is a debug flag (small-display checks); the default is min(900, 60 % of the work area)
  const forced = Number(process.argv.find((a) => /^--overlay-width=\d{3,4}$/.test(a))?.slice(16));
  const width = forced || Math.min(wa.width, Math.max(OVERLAY_MIN_W, Math.min(OVERLAY_W, Math.round(wa.width * 0.6))));
  const win = new BrowserWindow({
    width,
    height: Math.min(OVERLAY_H, wa.height),
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

export function createWelcome(lang: Lang): BrowserWindow {
  const win = new BrowserWindow({
    width: 580,
    height: 700,
    useContentSize: true,
    title: 'Kayy Office',
    backgroundColor: '#0f1422',
    icon: iconPath(),
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
  win.loadFile(join(__dirname, 'welcome.html'), { query: { lang } });
  return win;
}

export function toggleOverlay(win: BrowserWindow): void {
  if (win.isVisible()) {
    win.webContents.send('visibility', false);
    win.hide();
    resetClickThrough(win); // a hidden overlay must never keep swallowing clicks
  } else {
    win.showInactive();
    win.webContents.send('visibility', true);
  }
}
