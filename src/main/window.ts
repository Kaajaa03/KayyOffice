import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { resetClickThrough } from './clickthrough';
import type { Lang } from '../shared/i18n';
import { iconPath } from './icon';
import { clampToWorkAreas, placementPoint } from './position';
import type { Placement, Point, Rect, Size } from './position';
import { fitScale, rescaleBounds, scaledSize } from './scale';

export const OVERLAY_W = 900;
/** Narrowest width the room (one desk cluster + kitchen + lounge) fits into. */
export const OVERLAY_MIN_W = 460;
/** Room (max 300) + header/footer + a permission card below it. Transparent and click-through, so spare height costs nothing. */
export const OVERLAY_H = 460;

const workAreas = (): Rect[] => screen.getAllDisplays().map((d) => d.workArea);

/** Window size at scale 1: min(900, 60 % of the primary work area); --overlay-width=<px> is a debug flag. */
function overlayBase(wa: Rect): Size {
  const forced = Number(process.argv.find((a) => /^--overlay-width=\d{3,4}$/.test(a))?.slice(16));
  const width = forced || Math.min(wa.width, Math.max(OVERLAY_MIN_W, Math.min(OVERLAY_W, Math.round(wa.width * 0.6))));
  return { width, height: Math.min(OVERLAY_H, wa.height) };
}

/** Window size at scale 1; `scale` multiplies it. Set once by createOverlay. */
let base: Size = { width: OVERLAY_W, height: OVERLAY_H };

/** `saved` is the position the user dragged the overlay to (remembered in config.json); it is
 *  pulled back onto a display when that monitor is gone. Default: top centre of the primary display.
 *  `wantedScale` is fitted to the display; the scale actually used is returned. */
export function createOverlay(saved: Point | undefined, wantedScale: number, opacity: number): { win: BrowserWindow; scale: number } {
  const wa = screen.getPrimaryDisplay().workArea;
  base = overlayBase(wa);
  const scale = fitScale(wantedScale, base, wa);
  const size = scaledSize(base, scale);
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
    opacity,
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
  return { win, scale };
}

/** Resizes the overlay to `wanted` (fitted to the display it is on), keeping its centre and top edge.
 *  Returns the scale actually used; the caller sets the zoom factor. */
export function resizeOverlay(win: BrowserWindow, wanted: number): number {
  const b = win.getBounds();
  const area = screen.getDisplayMatching(b).workArea;
  const scale = fitScale(wanted, base, area);
  win.setBounds(rescaleBounds(b, scaledSize(base, scale), workAreas()));
  return scale;
}

/** Moves the overlay to `pos` (screen px) and keeps it reachable on the displays. */
export function moveOverlayTo(win: BrowserWindow, pos: Point): void {
  const b = win.getBounds();
  const p = clampToWorkAreas(pos, b, workAreas());
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

export function createSettings(lang: Lang): BrowserWindow {
  const win = new BrowserWindow({
    width: 560,
    height: 700,
    minWidth: 480,
    minHeight: 420,
    maxWidth: 760,
    maxHeight: 1000,
    useContentSize: true,
    title: 'Kayy Office',
    backgroundColor: '#0f1422',
    icon: iconPath(),
    autoHideMenuBar: true,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.removeMenu();
  win.loadFile(join(__dirname, 'settings.html'), { query: { lang } });
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
