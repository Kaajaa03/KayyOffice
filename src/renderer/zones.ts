// The non-desk parts of the room: wall objects (window, shelf, clock, display), kitchen and lounge.
import { plant } from './furniture';
import { CREAM, r, rects, shade } from './pixels';
import type { Ctx } from './pixels';
import { P, WALL_H } from './room';
import type { Room } from './room';
import type { DayPhase } from './sun';

export const CLOCK_Y = 10;
export const DISPLAY_Y = 4;
export const SHELF_W = 18;

const SKY: Record<DayPhase, [string, string, string]> = {
  day: ['#6cb6ee', '#8fcaf4', '#b6defa'],
  dawn: ['#7d8fd0', '#f0a07c', '#fcd49a'],
  dusk: ['#3e3a7a', '#a2588a', '#f08a5d'],
  night: ['#0d1230', '#151c42', '#1f2a58'],
};

export function windowPane(c: Ctx, x: number, y: number, w: number, h: number, phase: DayPhase): void {
  const [a, b, d] = SKY[phase];
  const ix = x + 1, iy = y + 1, iw = w - 2, ih = h - 2, band = Math.ceil(ih / 3), frame = '#f3efe6';
  rects(c, 0, 0, [
    [x - 1, y - 1, w + 2, h + 2, '#b9b1a3'], [x, y, w, h, frame],
    [ix, iy, iw, band, a], [ix, iy + band, iw, band, b], [ix, iy + band * 2, iw, ih - band * 2, d],
  ]);
  if (phase === 'night') {
    for (let i = 0; i < 4; i++) r(c, ix + ((i * 7 + x) % iw), iy + ((i * 5 + 1) % (ih - 3)), 1, 1, '#e8ecff');
    if (x % 3 === 0) rects(c, ix + iw - 5, iy + 1, [[0, 0, 3, 3, '#f4f1d0'], [1, 0, 2, 2, SKY.night[0]]]);
  } else if (phase === 'day') {
    rects(c, ix, iy, [[2 + (x % 7), 2, 6, 2, '#ffffff'], [3 + (x % 7), 1, 3, 1, '#ffffff']]); // cloud
  } else {
    r(c, ix + iw - 7, iy + ih - 3, 4, 2, '#ffe6a3'); // low sun
  }
  rects(c, 0, 0, [
    [x + Math.floor(w / 2), y, 1, h, frame], [x, y + Math.floor(h / 2), w, 1, frame],
    [x - 2, y + h + 1, w + 4, 1, '#d8cfbf'], [x - 2, y + h + 2, w + 4, 1, '#b9b1a3'],
  ]);
}

/** Slanted sunbeam on the floor below a window. */
export function lightShaft(c: Ctx, x: number, w: number, phase: DayPhase, floorH: number): void {
  if (phase === 'night') return;
  c.fillStyle = phase === 'day' ? 'rgba(255,246,214,0.22)' : 'rgba(255,190,130,0.18)';
  const len = Math.min(34, floorH - 4);
  for (let k = 0; k < len; k += 2) c.fillRect((x + 2 + Math.floor(k * 0.6)) * P, (WALL_H + k) * P, (w - 4) * P, 2 * P);
}

const BOOKS = ['#c0392b', '#2e86c1', '#f1c40f', '#27ae60', '#8e44ad', '#e67e22', '#ecf0f1', '#16a085'];

export function bookshelf(c: Ctx, x: number, top: number, bottom: number): void {
  const w = SHELF_W;
  r(c, x, top, w, bottom - top, '#6e4b2f');
  r(c, x + 1, top + 1, w - 2, bottom - top - 2, '#4d3421');
  const shelves = Math.floor((bottom - top - 2) / 7);
  for (let s = 0; s < shelves; s++) {
    const sy = top + 1 + s * 7;
    let bx = x + 2;
    let i = s * 3 + x;
    while (bx < x + w - 3) {
      const bw = 1 + (i % 2), bh = 4 + (i % 3 === 0 ? 1 : 0);
      r(c, bx, sy + 6 - bh, bw, bh, BOOKS[i % BOOKS.length]);
      bx += bw + (i % 5 === 0 ? 1 : 0);
      i++;
    }
    r(c, x + 1, sy + 6, w - 2, 1, '#8a6141');
  }
}

const RIM = '#3d3946';
const FACE = '#faf7ef';
/** Round clock face centred at (cx, CLOCK_Y); the hands are live (screens.ts). */
export const clockFace = (c: Ctx, cx: number): void =>
  rects(c, cx, CLOCK_Y, [
    [-3, -5, 7, 11, RIM], [-5, -3, 11, 7, RIM], [-4, -4, 9, 9, RIM],
    [-2, -4, 5, 9, FACE], [-4, -2, 9, 5, FACE], [-3, -3, 7, 7, FACE],
    [0, -4, 1, 1, RIM], [0, 4, 1, 1, RIM], [-4, 0, 1, 1, RIM], [4, 0, 1, 1, RIM],
  ]);

/** Wall display; its live text is drawn on top (screens.ts). */
export const wallDisplay = (c: Ctx, x: number, w: number): void =>
  rects(c, x, DISPLAY_Y, [[0, 0, w, 14, '#22252e'], [1, 1, w - 2, 12, '#0f1a2b'], [w / 2 - 2, 14, 4, 1, '#3a3f4b']]);

export function kitchen(c: Ctx, room: Room, phase: DayPhase): void {
  rects(c, room.kitchenX, 0, [
    // wall cabinet
    [1, 3, 24, 8, '#c8b49a'], [1, 10, 24, 1, '#a8937a'], [12, 3, 1, 8, '#a8937a'], [10, 6, 1, 2, '#6b5a47'], [14, 6, 1, 2, '#6b5a47'],
    // counter
    [0, 20, 26, 5, '#dcd7cf'], [0, 20, 26, 1, '#eeeae4'], [0, 25, 26, 6, '#9d7f60'], [12, 25, 1, 6, '#7f6449'], [9, 27, 2, 1, '#e6d3b3'], [15, 27, 2, 1, '#e6d3b3'],
    // coffee machine
    [4, 12, 9, 9, '#2b2f36'], [4, 12, 9, 1, '#4a505c'], [5, 14, 4, 2, phase === 'night' ? '#7ee787' : '#5fb878'], [10, 14, 2, 1, '#ff6b6b'], [6, 17, 4, 1, '#8b939f'], [7, 19, 2, 2, CREAM],
    // mugs + kettle
    [16, 17, 2, 3, '#4dabf7'], [19, 17, 2, 3, '#ffd43b'], [22, 15, 3, 5, '#c0c6cf'],
    // fridge
    [27, 3, 12, 28, '#b8c0c8'], [28, 4, 10, 26, '#e9edf0'], [28, 13, 10, 1, '#b8c0c8'], [36, 7, 1, 4, '#8f99a3'], [36, 16, 1, 6, '#8f99a3'], [30, 6, 3, 2, '#ffd43b'], [31, 9, 2, 2, '#ff8787'],
  ]);
}

/** Lamp shade of the corner floor lamp (repainted brighter when the room is lit at night). */
export const lampHead = (c: Ctx, room: Room, color: string): void => r(c, room.loungeX + 78, 6, 7, 5, color);

export function lounge(c: Ctx, room: Room, phase: DayPhase): void {
  const lx = room.loungeX, bottom = room.h - 3;
  const top = WALL_H + 9;
  rects(c, lx, 0, [[4, top, 82, bottom - top, '#5f8f5a'], [5, top + 1, 80, bottom - top - 2, '#6fa06a']]);
  for (let yy = WALL_H + 13; yy < bottom - 3; yy += 6) for (let xx = lx + 9 + ((yy / 6) % 2) * 3; xx < lx + 82; xx += 6) r(c, xx, yy, 1, 1, '#82b37c');
  windowPane(c, lx + 14, 4, 40, 15, phase);
  bookshelf(c, lx + 60, 4, 31);
  plant(c, lx + 2, 18, true);
  // sofa (seat spots at lx+22 / 34 / 46)
  rects(c, lx, 0, [[14, 27, 40, 6, '#4f6d8f'], [14, 27, 40, 1, '#6a8bb0'], [14, 33, 40, 4, '#6688ad'], [12, 29, 3, 9, '#45607e'], [53, 29, 3, 9, '#45607e'], [14, 37, 40, 1, '#3a516b']]);
  const cloth = '#efe9de';
  rects(c, lx + 45, WALL_H + 30, [
    [-7, 6, 14, 2, 'rgba(0,0,0,0.15)'], [-5, -3, 10, 9, cloth], [-7, -1, 14, 5, cloth], [-6, -2, 12, 7, cloth], [-6, 4, 12, 1, '#cfc6b7'],
    [-3, -1, 2, 2, '#f783ac'], [1, 0, 3, 2, '#ffffff'],
  ]);
  // beanbags (spots at lx+16 / lx+74)
  for (const [bx, col] of [[16, '#e07a5f'], [74, '#f2cc8f'], [60, '#81c3d7']] as const) {
    rects(c, lx + bx, WALL_H, [[-6, 40, 12, 7, shade(col, 0.82)], [-5, 39, 10, 7, col], [-3, 40, 4, 2, shade(col, 1.2)]]);
  }
  rects(c, lx, 0, [[81, 10, 1, 21, '#4b4f58'], [79, 30, 5, 1, '#4b4f58']]);
  lampHead(c, room, phase === 'night' || phase === 'dusk' ? '#ffe9a8' : '#efe3c8');
  r(c, lx + 78, 10, 7, 1, '#d4c39c');
  plant(c, lx + 78, bottom - 12);
}
