// Pixel primitives shared by all painters: rects in logical px (1 = P css px), shading, the day-phase
// tint and the offscreen cache (moving parts are cached sprites, so a frame is mostly drawImage).
import { P } from './room';
import type { DayPhase } from './sun';

export type Ctx = CanvasRenderingContext2D;
export type Rect = [x: number, y: number, w: number, h: number, color: string];

export const CREAM = '#f4f1ea';
export const COFFEE = '#6b4a33';

export const r = (c: Ctx, x: number, y: number, w: number, h: number, color: string): void => {
  c.fillStyle = color;
  c.fillRect(x * P, y * P, w * P, h * P);
};

/** Fills a table of rects given relative to (ox, oy), in order. */
export const rects = (c: Ctx, ox: number, oy: number, list: Rect[]): void => {
  for (const [x, y, w, h, color] of list) r(c, ox + x, oy + y, w, h, color);
};

/** Mug seen from above: cream body with a coffee top row. */
export const mug = (c: Ctx, x: number, y: number, w: number, h: number): void => {
  r(c, x, y, w, h, CREAM);
  r(c, x, y, w, 1, COFFEE);
};

/** Animation step: `Math.floor(t / ms) % n` (n = 2: blink). */
export const tick = (t: number, ms: number, n = 2): number => Math.floor(t / ms) % n;

/** f < 1 darkens, f > 1 lightens (1.3 = a third of the way to white). */
export const shade = (hex: string, f: number): string => {
  const n = parseInt(hex.slice(1, 7), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(f < 1 ? v * f : v + (255 - v) * (f - 1)))).toString(16).padStart(2, '0');
  return '#' + ch(n >> 16) + ch((n >> 8) & 255) + ch(n & 255);
};

export const TINT: Record<DayPhase, string | null> = {
  day: null,
  dawn: 'rgba(255,170,110,0.10)',
  dusk: 'rgba(90,50,120,0.20)',
  night: 'rgba(10,14,40,0.45)',
};

const cache = new Map<string, HTMLCanvasElement>();

/** Builds a canvas once per key; the cache is dropped when it grows past 600 entries. */
export function cached(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement {
  let cv = cache.get(key);
  if (cv) return cv;
  if (cache.size > 600) cache.clear();
  cv = make();
  cache.set(key, cv);
  return cv;
}

/** dpr-sized offscreen canvas of css size w x h, drawn to in css px. */
export function offscreen(w: number, h: number, dpr: number): [HTMLCanvasElement, Ctx] {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * dpr);
  cv.height = Math.ceil(h * dpr);
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [cv, c];
}

/** Sprite of w x h logical px, painted once per key and day phase (tinted like the room). */
export function sprite(key: string, w: number, h: number, dpr: number, phase: DayPhase | null, paint: (c: Ctx) => void): HTMLCanvasElement {
  return cached(`${key}|${dpr}|${phase}`, () => {
    const [cv, c] = offscreen(w * P, h * P, dpr);
    paint(c);
    const tint = phase ? TINT[phase] : null;
    if (tint) {
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = tint;
      c.fillRect(0, 0, w * P, h * P);
    }
    return cv;
  });
}

/** Draws a cached sprite at logical (x, y). Caller's transform = dpr (+ translate in css px). */
export function blit(c: Ctx, cv: HTMLCanvasElement, x: number, y: number, dpr: number): void {
  c.drawImage(cv, x * P, y * P, cv.width / dpr, cv.height / dpr);
}

/** Soft round glow (waiting highlight, screen light at night), cached per colour. */
export function glowSprite(color: string, rad: number, dpr: number): HTMLCanvasElement {
  return sprite(`glow|${color}|${rad}`, rad * 2, rad * 2, dpr, null, (c) => {
    const g = c.createRadialGradient(rad * P, rad * P, 0, rad * P, rad * P, rad * P);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, rad * 2 * P, rad * 2 * P);
  });
}
