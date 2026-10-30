import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { resetClickThrough } from './clickthrough';
import type { Lang } from '../shared/i18n';
import { iconPath } from './icon';
import { clampToWorkAreas, placementPoint } from './position';
import type { Placement, Point, Rect } from './position';

export const OVERLAY_W = 900;
/** Narrowest width the room (one desk cluster + kitchen + lounge) fits into. */
export const OVERLAY_MIN_W = 460;
/** Room (max 300) + header/footer + a permission card below it. Transparent and click-through, so spare height costs nothing. */
export const OVERLAY_H = 460;

const workAreas = (): Rect[] => screen.getAllDisplays().map((d) => d.workArea);

/** `saved` is the position the user dragged the overlay to (remembered in config.json); it is
 *  pulled back onto a display when that monitor is gone. Default: top centre of the primary display. */
export function createOverlay(saved?: Point): BrowserWindow {
  const wa = screen.getPrimaryDisplay().workArea;
  // --overlay-width=<px> is a debug flag (small-display checks); the default is min(900, 60 % of the work area)
  const forced = Number(process.argv.find((a) => /^--overlay-width=\d{3,4}$/.test(a))?.slice(16));
  const width = forced || Math.min(wa.width, Math.max(OVERLAY_MIN_W, Math.min(OVERLAY_W, Math.round(wa.width * 0.6))));
  const size = { width, height: Math.min(OVERLAY_H, wa.height) };
  const start = saved ? clampToWorkAreas(saved, size, workAreas()) : placementPoint('top-center', size, wa);
  const win = new BrowserWindow({
    ...size,
    x: start.x,
    y: start.y,
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

/** Moves the overlay by a drag delta (screen px) and keeps it reachable on the displays. */
export function moveOverlayBy(win: BrowserWindow, dx: number, dy: number): void {
  const b = win.getBounds();
  const p = clampToWorkAreas({ x: b.x + dx, y: b.y + dy }, b, workAreas());
  win.setBounds({ x: p.x, y: p.y, width: b.width, height: b.height }); // explicit size: no DPI drift on mixed-scale monitors
}

/** Puts the overlay at a preset of the display it is on (or the primary one). */
export function placeOverlay(win: BrowserWindow, placement: Placement): Point {
  const b = win.getBounds();
  const area = screen.getDisplayMatching(b).workArea;
  const p = placementPoint(placement, b, area);
  win.setBounds({ x: p.x, y: p.y, width: b.width, height: b.height });
  return p;
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
