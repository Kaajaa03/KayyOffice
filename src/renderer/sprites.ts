// Procedural pixel art for the office room. Everything is rects; 1 logical px = P css px.
// Static parts are painted once into an offscreen canvas (paintRoom), moving parts are
// cached sprites (sprite()) so a frame is mostly drawImage calls.
import { modelChip } from '../shared/model';
import type { Agent } from '../shared/types';
import { P, WALL_H, CLUSTER_W, PAD, KITCHEN_W } from './room';
import type { Room, Seat } from './room';
import type { DayPhase } from './sun';
import { pillLines } from './pill';
import type { Lang } from '../shared/i18n';

export const HEADER_H = 18;
export const FOOTER_H = 20;

const PALETTE = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#9775fa', '#f783ac'];
const FONT = '"Segoe UI", system-ui, sans-serif';

const hash = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

function agentColor(id: string, override?: string): string {
  return override || PALETTE[hash(id) % PALETTE.length];
}

type Ctx = CanvasRenderingContext2D;
export const r = (c: Ctx, x: number, y: number, w: number, h: number, color: string): void => {
  c.fillStyle = color;
  c.fillRect(x * P, y * P, w * P, h * P);
};

const shade = (hex: string, f: number): string => {
  const n = parseInt(hex.slice(1, 7), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(f < 1 ? v * f : v + (255 - v) * (f - 1)))).toString(16).padStart(2, '0');
  return '#' + ch(n >> 16) + ch((n >> 8) & 255) + ch(n & 255);
};

// ---------- lighting ----------

const TINT: Record<DayPhase, string | null> = {
  day: null,
  dawn: 'rgba(255,170,110,0.10)',
  dusk: 'rgba(90,50,120,0.20)',
  night: 'rgba(10,14,40,0.45)',
};

const SKY: Record<DayPhase, [string, string, string]> = {
  day: ['#6cb6ee', '#8fcaf4', '#b6defa'],
  dawn: ['#7d8fd0', '#f0a07c', '#fcd49a'],
  dusk: ['#3e3a7a', '#a2588a', '#f08a5d'],
  night: ['#0d1230', '#151c42', '#1f2a58'],
};

// ---------- sprite cache ----------

const cache = new Map<string, HTMLCanvasElement>();

/** Paints once per key into an offscreen canvas (dpr-sized, tinted for the day phase). */
export function sprite(key: string, w: number, h: number, dpr: number, phase: DayPhase | null, paint: (c: Ctx) => void): HTMLCanvasElement {
  const k = `${key}|${dpr}|${phase}`;
  let cv = cache.get(k);
  if (cv) return cv;
  if (cache.size > 600) cache.clear();
  cv = document.createElement('canvas');
  cv.width = Math.ceil(w * P * dpr);
  cv.height = Math.ceil(h * P * dpr);
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  paint(c);
  const tint = phase ? TINT[phase] : null;
  if (tint) {
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = tint;
    c.fillRect(0, 0, w * P, h * P);
  }
  cache.set(k, cv);
  return cv;
}

/** Draws a cached sprite at logical (x, y). Caller's transform = dpr (+ translate in css px). */
export function blit(c: Ctx, cv: HTMLCanvasElement, x: number, y: number, dpr: number): void {
  c.drawImage(cv, x * P, y * P, cv.width / dpr, cv.height / dpr);
}

// ---------- people ----------

export interface Look { skin: string; hair: string; long: boolean; shirt: string }

const SKINS = ['#f1c27d', '#c68642', '#e0ac69', '#8d5524'];
const HAIRS = ['#3b2a20', '#1c1c1c', '#c99a4f', '#8a3b22', '#5a4636'];

export function lookFor(agent: Agent): Look {
  const h = hash(agent.id);
  return {
    skin: SKINS[(h >>> 3) % SKINS.length],
    hair: HAIRS[(h >>> 5) % HAIRS.length],
    long: ((h >>> 9) & 1) === 1,
    shirt: agentColor(agent.id, agent.color),
  };
}

const PANTS = '#384052';
const SHOE = '#1f2128';
const EYE = '#2a2230';

function headFront(c: Ctx, l: Look, eyes: 'both' | 'left' | 'right' = 'both'): void {
  r(c, 1, 1, 6, 5, l.skin);
  r(c, 1, 0, 6, 2, l.hair);
  r(c, 1, 2, 1, 1, l.hair);
  r(c, 6, 2, 1, 1, l.hair);
  if (l.long) { r(c, 0, 1, 1, 6, l.hair); r(c, 7, 1, 1, 6, l.hair); }
  if (eyes !== 'right') r(c, 2, 3, 1, 1, EYE);
  if (eyes !== 'left') r(c, 5, 3, 1, 1, EYE);
  if (eyes === 'both') r(c, 3, 5, 2, 1, shade(l.skin, 0.8));
}

function headBack(c: Ctx, l: Look): void {
  r(c, 1, 0, 6, 6, l.hair);
  r(c, 1, 5, 6, 1, shade(l.hair, 1.15));
  if (l.long) { r(c, 0, 1, 8, 7, l.hair); r(c, 1, 7, 6, 1, shade(l.hair, 0.8)); }
}

function torso(c: Ctx, l: Look, h: number, armsDown = true): void {
  r(c, 1, 6, 6, h, l.shirt);
  r(c, 3, 6, 2, 1, shade(l.shirt, 1.3));
  const arm = shade(l.shirt, 0.78);
  if (armsDown) {
    r(c, 0, 7, 1, Math.min(4, h - 1), arm);
    r(c, 7, 7, 1, Math.min(4, h - 1), arm);
  }
}

export type Pose = 'stand' | 'walk0' | 'walk1' | 'back0' | 'back1' | 'sideR0' | 'sideR1' | 'sideL0' | 'sideL1'
  | 'seatFront' | 'seatBack0' | 'seatBack1' | 'lounge' | 'cup';

function legs(c: Ctx, frame: -1 | 0 | 1, y = 12): void {
  const L = frame === 1 ? 2 : 3, R = frame === 0 ? 2 : 3;
  r(c, 1, y, 2, L, PANTS); r(c, 1, y + L, 2, 1, SHOE);
  r(c, 5, y, 2, R, PANTS); r(c, 5, y + R, 2, 1, SHOE);
}

/** 8 x 16 logical px, origin = top-left of the hair. */
function paintPerson(c: Ctx, l: Look, pose: Pose): void {
  switch (pose) {
    case 'stand': case 'walk0': case 'walk1': case 'cup':
      headFront(c, l);
      torso(c, l, 6);
      r(c, 0, 11, 1, 1, l.skin); r(c, 7, 11, 1, 1, l.skin);
      legs(c, pose === 'walk0' ? 0 : pose === 'walk1' ? 1 : -1);
      if (pose === 'cup') { r(c, 6, 8, 3, 3, '#f4f1ea'); r(c, 6, 8, 3, 1, '#6b4a33'); r(c, 6, 10, 3, 1, '#d8d2c6'); }
      break;
    case 'back0': case 'back1':
      headBack(c, l);
      torso(c, l, 6);
      legs(c, pose === 'back0' ? 0 : 1);
      break;
    case 'sideR0': case 'sideR1': case 'sideL0': case 'sideL1': {
      const right = pose.startsWith('sideR');
      headFront(c, l, right ? 'right' : 'left');
      r(c, right ? 1 : 6, 1, 1, 4, l.hair);
      torso(c, l, 6, false);
      r(c, right ? 3 : 4, 7, 1, 4, shade(l.shirt, 0.78));
      legs(c, pose.endsWith('0') ? 0 : 1);
      break;
    }
    case 'seatFront':
      headFront(c, l);
      torso(c, l, 5);
      break;
    case 'seatBack0': case 'seatBack1': {
      headBack(c, l);
      torso(c, l, 6, false);
      const arm = shade(l.shirt, 0.78);
      const up = pose === 'seatBack1' ? 1 : 0;
      r(c, 0, 6 - up, 1, 3, arm);
      r(c, 7, 5 + up, 1, 3, arm);
      break;
    }
    case 'lounge':
      headFront(c, l);
      torso(c, l, 5);
      r(c, 1, 11, 6, 2, PANTS);
      r(c, 1, 13, 2, 1, SHOE); r(c, 5, 13, 2, 1, SHOE);
      r(c, 3, 8, 2, 2, '#f4f1ea'); r(c, 3, 8, 2, 1, '#6b4a33');
      break;
  }
}

export function personSprite(l: Look, pose: Pose, dpr: number, phase: DayPhase): HTMLCanvasElement {
  return sprite(`p|${l.skin}|${l.hair}|${l.long}|${l.shirt}|${pose}`, 9, 16, dpr, phase, (c) => paintPerson(c, l, pose));
}

// ---------- furniture pieces (shared by static + dynamic) ----------

/** Chair seen from behind (bottom row, in front of its person). */
function chairBack(c: Ctx, x: number, y: number): void {
  r(c, x - 5, y, 10, 5, '#3c4352');
  r(c, x - 5, y, 10, 1, '#58607a');
  r(c, x - 6, y + 3, 1, 3, '#2d323d');
  r(c, x + 5, y + 3, 1, 3, '#2d323d');
  r(c, x - 1, y + 5, 2, 2, '#23262e');
  r(c, x - 4, y + 7, 8, 1, '#1d2027');
}

/** Chair seen from the front (top row, behind its person). */
function chairFront(c: Ctx, x: number, y: number): void {
  r(c, x - 5, y, 10, 7, '#3c4352');
  r(c, x - 5, y, 10, 1, '#58607a');
  r(c, x - 4, y + 7, 8, 2, '#2d323d');
}

export const bottomChairY = (s: Seat): number => s.y + 8;
const topChairY = (s: Seat): number => s.y + 2;

/** Monitor whose screen faces the viewer: bezel 14 x 9 at (x-7, y). Screen inner = (x-6, y+1, 12, 7). */
function monitorFront(c: Ctx, x: number, y: number): void {
  r(c, x - 7, y, 14, 9, '#2a2e37');
  r(c, x - 6, y + 1, 12, 7, '#151a22');
  r(c, x - 1, y + 9, 2, 1, '#4a505c');
  r(c, x - 3, y + 10, 6, 1, '#5b6270');
}

/** Monitor seen from behind (top row). */
function monitorBack(c: Ctx, x: number, y: number): void {
  r(c, x - 7, y, 14, 9, '#c9ccd3');
  r(c, x - 7, y + 8, 14, 1, '#a7abb5');
  r(c, x - 1, y + 3, 2, 2, '#e9ebef');
  r(c, x - 2, y + 9, 4, 1, '#8f95a1');
}

export const monitorFrontY = (s: Seat): number => s.y - 13;
export const monitorBackY = (s: Seat): number => s.y + 5;

// ---------- static room ----------

interface WallItem { kind: 'window' | 'clock' | 'display' | 'shelf'; x: number; w: number }

const WIDTH: Record<WallItem['kind'], number> = { window: 24, clock: 12, display: 34, shelf: 18 };

/** Wall decoration along the desk zone (clock + display always come early). */
export function wallItems(room: Room): WallItem[] {
  const seq: WallItem['kind'][] = ['window', 'clock', 'display', 'window', 'shelf', 'window', 'window', 'shelf', 'window', 'window'];
  const items: WallItem[] = [];
  const start = PAD + KITCHEN_W + 4;
  let x = start;
  for (const kind of seq) {
    const w = WIDTH[kind];
    if (x + w > room.loungeX - 2) break;
    items.push({ kind, x, w });
    x += w + 5;
  }
  const shift = Math.floor((room.loungeX - 2 - start - (x - 5 - start)) / 2);
  for (const it of items) it.x += shift;
  return items;
}

function window_(c: Ctx, x: number, y: number, w: number, h: number, phase: DayPhase): void {
  const [a, b, d] = SKY[phase];
  r(c, x - 1, y - 1, w + 2, h + 2, '#b9b1a3');
  r(c, x, y, w, h, '#f3efe6');
  const ix = x + 1, iy = y + 1, iw = w - 2, ih = h - 2;
  const band = Math.ceil(ih / 3);
  r(c, ix, iy, iw, band, a);
  r(c, ix, iy + band, iw, band, b);
  r(c, ix, iy + band * 2, iw, ih - band * 2, d);
  if (phase === 'night') {
    for (let i = 0; i < 4; i++) r(c, ix + ((i * 7 + x) % iw), iy + ((i * 5 + 1) % (ih - 3)), 1, 1, '#e8ecff');
    if (x % 3 === 0) { r(c, ix + iw - 5, iy + 1, 3, 3, '#f4f1d0'); r(c, ix + iw - 4, iy + 1, 2, 2, SKY.night[0]); }
  } else if (phase === 'day') {
    r(c, ix + 2 + (x % 7), iy + 2, 6, 2, '#ffffff');
    r(c, ix + 3 + (x % 7), iy + 1, 3, 1, '#ffffff');
  } else {
    r(c, ix + iw - 7, iy + ih - 3, 4, 2, '#ffe6a3');
  }
  r(c, x + Math.floor(w / 2), y, 1, h, '#f3efe6');
  r(c, x, y + Math.floor(h / 2), w, 1, '#f3efe6');
  r(c, x - 2, y + h + 1, w + 4, 1, '#d8cfbf');
  r(c, x - 2, y + h + 2, w + 4, 1, '#b9b1a3');
}

function lightShaft(c: Ctx, x: number, w: number, phase: DayPhase, floorH: number): void {
  if (phase === 'night') return;
  c.fillStyle = phase === 'day' ? 'rgba(255,246,214,0.22)' : 'rgba(255,190,130,0.18)';
  const len = Math.min(34, floorH - 4);
  for (let k = 0; k < len; k += 2) c.fillRect((x + 2 + Math.floor(k * 0.6)) * P, (WALL_H + k) * P, (w - 4) * P, 2 * P);
}

function bookshelf(c: Ctx, x: number, top: number, bottom: number): void {
  const w = 18;
  r(c, x, top, w, bottom - top, '#6e4b2f');
  r(c, x + 1, top + 1, w - 2, bottom - top - 2, '#4d3421');
  const books = ['#c0392b', '#2e86c1', '#f1c40f', '#27ae60', '#8e44ad', '#e67e22', '#ecf0f1', '#16a085'];
  const shelves = Math.floor((bottom - top - 2) / 7);
  for (let s = 0; s < shelves; s++) {
    const sy = top + 1 + s * 7;
    let bx = x + 2;
    let i = s * 3 + x;
    while (bx < x + w - 3) {
      const bw = 1 + (i % 2), bh = 4 + (i % 3 === 0 ? 1 : 0);
      r(c, bx, sy + 6 - bh, bw, bh, books[i % books.length]);
      bx += bw + (i % 5 === 0 ? 1 : 0);
      i++;
    }
    r(c, x + 1, sy + 6, w - 2, 1, '#8a6141');
  }
}

function clockFace(c: Ctx, cx: number, cy: number): void {
  r(c, cx - 3, cy - 5, 7, 11, '#3d3946');
  r(c, cx - 5, cy - 3, 11, 7, '#3d3946');
  r(c, cx - 4, cy - 4, 9, 9, '#3d3946');
  r(c, cx - 2, cy - 4, 5, 9, '#faf7ef');
  r(c, cx - 4, cy - 2, 9, 5, '#faf7ef');
  r(c, cx - 3, cy - 3, 7, 7, '#faf7ef');
  r(c, cx, cy - 4, 1, 1, '#3d3946'); r(c, cx, cy + 4, 1, 1, '#3d3946');
  r(c, cx - 4, cy, 1, 1, '#3d3946'); r(c, cx + 4, cy, 1, 1, '#3d3946');
}

export const CLOCK_Y = 10;
export const DISPLAY_Y = 4;

function plant(c: Ctx, x: number, y: number, big = false): void {
  const s = big ? 2 : 1;
  r(c, x + 1, y + 6 * s, 5 * s - 1, 4 * s, '#b4643a');
  r(c, x + 1, y + 6 * s, 5 * s - 1, 1, '#cf7b4c');
  const g = ['#2f7d4a', '#3f9a5c', '#57b36f'];
  r(c, x, y + 2 * s, 3 * s, 4 * s, g[0]);
  r(c, x + 2 * s, y, 3 * s, 6 * s, g[1]);
  r(c, x + 1 * s, y + 1 * s, 2 * s, 2 * s, g[2]);
  r(c, x + 4 * s, y + 3 * s, 2 * s, 3 * s, g[0]);
}

function kitchen(c: Ctx, room: Room, phase: DayPhase): void {
  const x = room.kitchenX;
  r(c, x + 1, 3, 24, 8, '#c8b49a');
  r(c, x + 1, 10, 24, 1, '#a8937a');
  r(c, x + 12, 3, 1, 8, '#a8937a');
  r(c, x + 10, 6, 1, 2, '#6b5a47'); r(c, x + 14, 6, 1, 2, '#6b5a47');
  // counter
  r(c, x, 20, 26, 5, '#dcd7cf');
  r(c, x, 20, 26, 1, '#eeeae4');
  r(c, x, 25, 26, 6, '#9d7f60');
  r(c, x + 12, 25, 1, 6, '#7f6449');
  r(c, x + 9, 27, 2, 1, '#e6d3b3'); r(c, x + 15, 27, 2, 1, '#e6d3b3');
  // coffee machine
  r(c, x + 4, 12, 9, 9, '#2b2f36');
  r(c, x + 4, 12, 9, 1, '#4a505c');
  r(c, x + 5, 14, 4, 2, phase === 'night' ? '#7ee787' : '#5fb878');
  r(c, x + 10, 14, 2, 1, '#ff6b6b');
  r(c, x + 6, 17, 4, 1, '#8b939f');
  r(c, x + 7, 19, 2, 2, '#f4f1ea');
  // mugs + kettle
  r(c, x + 16, 17, 2, 3, '#4dabf7'); r(c, x + 19, 17, 2, 3, '#ffd43b');
  r(c, x + 22, 15, 3, 5, '#c0c6cf');
  // fridge
  r(c, x + 27, 3, 12, 28, '#b8c0c8');
  r(c, x + 28, 4, 10, 26, '#e9edf0');
  r(c, x + 28, 13, 10, 1, '#b8c0c8');
  r(c, x + 36, 7, 1, 4, '#8f99a3'); r(c, x + 36, 16, 1, 6, '#8f99a3');
  r(c, x + 30, 6, 3, 2, '#ffd43b'); r(c, x + 31, 9, 2, 2, '#ff8787');
}

function serverRack(c: Ctx, x: number, y: number, phase: DayPhase): void {
  r(c, x, y, 12, 22, '#1f232b');
  r(c, x + 1, y + 1, 10, 20, '#2c313b');
  for (let i = 0; i < 5; i++) {
    r(c, x + 2, y + 2 + i * 4, 8, 3, '#3a404c');
    r(c, x + 3, y + 3 + i * 4, 1, 1, i % 2 ? '#51cf66' : '#4dabf7');
    r(c, x + 5, y + 3 + i * 4, 1, 1, phase === 'night' ? '#ffd43b' : '#2f9e44');
  }
  r(c, x, y + 22, 12, 1, 'rgba(0,0,0,0.25)');
}

function lounge(c: Ctx, room: Room, phase: DayPhase): void {
  const lx = room.loungeX;
  const bottom = room.h - 3;
  // rug
  r(c, lx + 4, WALL_H + 9, 82, bottom - WALL_H - 9, '#5f8f5a');
  r(c, lx + 5, WALL_H + 10, 80, bottom - WALL_H - 11, '#6fa06a');
  for (let yy = WALL_H + 13; yy < bottom - 3; yy += 6) for (let xx = lx + 9 + ((yy / 6) % 2) * 3; xx < lx + 82; xx += 6) r(c, xx, yy, 1, 1, '#82b37c');
  // window + bookshelf + plant on/at the wall
  window_(c, lx + 14, 4, 40, 15, phase);
  bookshelf(c, lx + 60, 4, 31);
  plant(c, lx + 2, 18, true);
  // sofa (seat spots at lx+22 / 34 / 46)
  r(c, lx + 14, 27, 40, 6, '#4f6d8f');
  r(c, lx + 14, 27, 40, 1, '#6a8bb0');
  r(c, lx + 14, 33, 40, 4, '#6688ad');
  r(c, lx + 12, 29, 3, 9, '#45607e');
  r(c, lx + 53, 29, 3, 9, '#45607e');
  r(c, lx + 14, 37, 40, 1, '#3a516b');
  // round table
  const tx = lx + 45, ty = WALL_H + 30;
  r(c, tx - 7, ty + 6, 14, 2, 'rgba(0,0,0,0.15)');
  r(c, tx - 5, ty - 3, 10, 9, '#efe9de');
  r(c, tx - 7, ty - 1, 14, 5, '#efe9de');
  r(c, tx - 6, ty - 2, 12, 7, '#efe9de');
  r(c, tx - 6, ty + 4, 12, 1, '#cfc6b7');
  r(c, tx - 3, ty - 1, 2, 2, '#f783ac');
  r(c, tx + 1, ty, 3, 2, '#ffffff');
  // beanbags (spots at lx+16 / lx+74)
  const bean = (bx: number, col: string) => {
    r(c, bx - 6, WALL_H + 40, 12, 7, shade(col, 0.82));
    r(c, bx - 5, WALL_H + 39, 10, 7, col);
    r(c, bx - 3, WALL_H + 40, 4, 2, shade(col, 1.2));
  };
  bean(lx + 16, '#e07a5f');
  bean(lx + 74, '#f2cc8f');
  // floor lamp in the corner
  r(c, lx + 81, 10, 1, 21, '#4b4f58');
  r(c, lx + 79, 30, 5, 1, '#4b4f58');
  r(c, lx + 78, 6, 7, 5, phase === 'night' || phase === 'dusk' ? '#ffe9a8' : '#efe3c8');
  r(c, lx + 78, 10, 7, 1, '#d4c39c');
  plant(c, lx + 78, bottom - 12);
}

function deskCluster(c: Ctx, x0: number, y0: number, label: string): void {
  r(c, x0 + 1, y0 + 35, 75, 5, 'rgba(0,0,0,0.10)');
  r(c, x0 + 1, y0 + 20, 74, 14, '#c49a6c');
  r(c, x0 + 1, y0 + 20, 74, 1, '#d8b385');
  r(c, x0 + 1, y0 + 26, 74, 2, '#a3acb8');
  r(c, x0 + 1, y0 + 26, 74, 1, '#c3cad3');
  r(c, x0 + 1, y0 + 34, 74, 5, '#8b6644');
  r(c, x0 + 1, y0 + 34, 74, 1, '#a07752');
  r(c, x0 + 2, y0 + 39, 2, 2, '#5d4430');
  r(c, x0 + 72, y0 + 39, 2, 2, '#5d4430');
  r(c, x0 + 37, y0 + 39, 2, 2, '#5d4430');
  if (label) {
    c.save();
    c.font = `700 8px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    let t = label;
    while (t.length > 3 && c.measureText(t).width > 60 * P) t = t.replace(/…$/, '').slice(0, -1) + '…';
    const tw = c.measureText(t).width + 8;
    const cx = (x0 + 46) * P;
    c.fillStyle = '#e9dcc4';
    c.fillRect(Math.round(cx - tw / 2), (y0 + 34.5) * P, Math.round(tw), 8);
    c.fillStyle = '#4a3523';
    c.fillText(t, cx, (y0 + 34.5) * P + 4.5);
    c.restore();
  }
}

function deskDecor(c: Ctx, s: Seat, i: number): void {
  if (s.facing === 'up') {
    r(c, s.x - 4, s.y - 4, 8, 2, '#e4e6ea');
    r(c, s.x - 3, s.y - 4, 6, 1, '#cfd3da');
    r(c, s.x + 6, s.y - 4, 2, 2, '#e4e6ea');
    const k = i % 3;
    if (k === 0) { r(c, s.x - 16, s.y - 6, 3, 3, '#f4f1ea'); r(c, s.x - 16, s.y - 6, 3, 1, '#6b4a33'); }
    else if (k === 1) { r(c, s.x - 17, s.y - 7, 6, 4, '#f8f9fa'); r(c, s.x - 16, s.y - 6, 4, 1, '#ced4da'); }
    else { r(c, s.x - 15, s.y - 8, 3, 4, '#ffd43b'); }
  } else {
    if (i % 2) { r(c, s.x + 10, s.y + 9, 3, 3, '#3f9a5c'); r(c, s.x + 10, s.y + 12, 3, 2, '#b4643a'); }
    else { r(c, s.x + 9, s.y + 10, 6, 4, '#f8f9fa'); r(c, s.x + 10, s.y + 11, 4, 1, '#ced4da'); }
  }
}

function lightPool(c: Ctx, x: number, y: number, rad: number, color: string): void {
  const g = c.createRadialGradient(x * P, y * P, 0, x * P, y * P, rad * P);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(255,214,150,0)');
  c.fillStyle = g;
  c.fillRect((x - rad) * P, (y - rad) * P, rad * 2 * P, rad * 2 * P);
}

/** The whole room without people (and without things that sit in front of people). */
export function paintRoom(c: Ctx, room: Room, phase: DayPhase, occupied: Set<number>, labels: string[]): void {
  const { w, h } = room;
  // floor tiles
  r(c, 0, WALL_H, w, h - WALL_H, '#c9c2b2');
  for (let y = WALL_H; y < h; y += 8) {
    for (let x = 0; x < w; x += 8) r(c, x, y, 7, 7, ((x + y) / 8) % 2 ? '#ddd6c8' : '#d6cfc0');
  }
  // wall
  r(c, 0, 0, w, WALL_H, '#e7e0d3');
  r(c, 0, 0, w, 2, '#cbbfad');
  r(c, 0, WALL_H - 7, w, 5, '#ddd4c4');
  r(c, 0, WALL_H - 7, w, 1, '#cfc5b3');
  r(c, 0, WALL_H - 2, w, 2, '#8f8372');
  r(c, 0, WALL_H, w, 1, 'rgba(0,0,0,0.12)');

  for (const it of wallItems(room)) {
    if (it.kind === 'window') { window_(c, it.x, 4, it.w, 14, phase); lightShaft(c, it.x, it.w, phase, h - WALL_H); }
    else if (it.kind === 'clock') clockFace(c, it.x + 6, CLOCK_Y);
    else if (it.kind === 'display') {
      r(c, it.x, DISPLAY_Y, it.w, 14, '#22252e');
      r(c, it.x + 1, DISPLAY_Y + 1, it.w - 2, 12, '#0f1a2b');
      r(c, it.x + it.w / 2 - 2, DISPLAY_Y + 14, 4, 1, '#3a3f4b');
    } else bookshelf(c, it.x, 5, 31);
  }
  lightShaft(c, room.loungeX + 14, 40, phase, h - WALL_H);
  kitchen(c, room, phase);
  serverRack(c, room.kitchenX + 2, h - 26, phase);
  plant(c, room.kitchenX + 25, h - 12);
  lounge(c, room, phase);

  // desks: top chairs (behind people) are static; empty seats get chair + monitor here too
  room.clusters.forEach((cl, k) => {
    const seats = room.seats.slice(k * 4, k * 4 + 4);
    for (const s of seats) if (s.facing === 'down') chairFront(c, s.x, topChairY(s));
    deskCluster(c, cl.x, cl.y, labels[k] ?? '');
    for (const s of seats) {
      deskDecor(c, s, s.slot);
      if (s.facing === 'up') monitorFront(c, s.x, monitorFrontY(s));
      else if (!occupied.has(s.slot)) monitorBack(c, s.x, monitorBackY(s));
      if (s.facing === 'up' && !occupied.has(s.slot)) chairBack(c, s.x, bottomChairY(s));
    }
  });

  const tint = TINT[phase];
  if (tint) { c.fillStyle = tint; c.fillRect(0, 0, w * P, h * P); }
  if (phase === 'night' || phase === 'dusk') {
    const warm = phase === 'night' ? 'rgba(255,210,140,0.30)' : 'rgba(255,210,140,0.16)';
    for (const cl of room.clusters) lightPool(c, cl.x + CLUSTER_W / 2, cl.y + 27, 44, warm);
    lightPool(c, room.loungeX + 81, 26, 34, warm);
    lightPool(c, room.kitchenX + 10, 24, 22, warm);
    r(c, room.loungeX + 78, 6, 7, 5, '#fff1bf');
  }
  c.strokeStyle = '#2b2a35';
  c.lineWidth = 2;
  c.strokeRect(1, 1, w * P - 2, h * P - 2);
}

// ---------- dynamic pieces ----------

export function chairBackSprite(dpr: number, phase: DayPhase): HTMLCanvasElement {
  return sprite('chairB', 12, 8, dpr, phase, (c) => chairBack(c, 6, 0));
}
export function monitorBackSprite(dpr: number, phase: DayPhase): HTMLCanvasElement {
  return sprite('monB', 14, 10, dpr, phase, (c) => monitorBack(c, 7, 0));
}

/** Screen content of a visible monitor (bezel is static). Inner area 12 x 7 at (x-6, y+1). */
export function drawScreen(c: Ctx, agent: Agent, x: number, y: number, t: number): void {
  const sx = x - 6, sy = y + 1;
  switch (agent.status) {
    case 'working': {
      const cat = agent.category ?? 'other';
      if (cat === 'code') {
        r(c, sx, sy, 12, 7, '#0d1117');
        const cols = ['#69db7c', '#4dabf7', '#ffd43b', '#f783ac'];
        const scroll = Math.floor(t / 600);
        for (let i = 0; i < 3; i++) {
          const n = (i + scroll) % 7;
          r(c, sx + 1 + (n % 3 === 0 ? 0 : 2), sy + 1 + i * 2, Math.min(3 + ((n * 5) % 7), 9), 1, cols[(i + scroll) % 4]);
        }
        if (Math.floor(t / 400) % 2) r(c, sx + 10, sy + 5, 1, 1, '#ffffff');
      } else if (cat === 'terminal') {
        r(c, sx, sy, 12, 7, '#0b0b0d');
        const scroll = Math.floor(t / 500) % 3;
        for (let i = 0; i < 2; i++) { r(c, sx + 1, sy + 1 + i * 2, 1, 1, '#69db7c'); r(c, sx + 3, sy + 1 + i * 2, 3 + ((i + scroll) % 3) * 2, 1, '#a5adba'); }
        if (Math.floor(t / 400) % 2 === 0) r(c, sx + 1, sy + 5, 2, 1, '#69db7c');
      } else if (cat === 'browser') {
        r(c, sx, sy, 12, 7, '#f1f3f5');
        r(c, sx, sy, 12, 1, '#4dabf7');
        r(c, sx + 1, sy + 2, 5, 3, '#ced4da');
        const scroll = Math.floor(t / 700) % 2;
        r(c, sx + 7, sy + 2 + scroll, 4, 1, '#868e96');
        r(c, sx + 7, sy + 4 - scroll, 3, 1, '#adb5bd');
      } else {
        r(c, sx, sy, 12, 7, '#1a1f2b');
        for (let i = 0; i < 3; i++) r(c, sx + 3 + i * 2, sy + 3, 1, 1, Math.floor(t / 250) % 3 === i ? '#ffffff' : '#4b5563');
      }
      break;
    }
    case 'error':
      r(c, sx, sy, 12, 7, Math.floor(t / 300) % 2 ? '#7f1d1d' : '#e03131');
      r(c, sx + 5, sy + 1, 2, 3, '#fff5f5');
      r(c, sx + 5, sy + 5, 2, 1, '#fff5f5');
      break;
    case 'waiting':
      r(c, sx, sy, 12, 7, '#3b2f0d');
      r(c, sx + 5, sy + 1, 2, 3, '#ffd43b');
      r(c, sx + 5, sy + 5, 2, 1, '#ffd43b');
      break;
    case 'done':
      r(c, sx, sy, 12, 7, '#12261b');
      r(c, sx + 3, sy + 3, 1, 1, '#69db7c'); r(c, sx + 4, sy + 4, 1, 1, '#69db7c');
      r(c, sx + 5, sy + 3, 1, 1, '#69db7c'); r(c, sx + 6, sy + 2, 1, 1, '#69db7c'); r(c, sx + 7, sy + 1, 1, 1, '#69db7c');
      break;
    default:
      r(c, sx, sy, 12, 7, '#10141c');
      r(c, sx + 2 + (agent.id.length % 7), sy + 2 + (agent.id.length % 3), 1, 1, '#3b4a6b');
  }
}

/** Soft round glow (waiting highlight / screen light at night), cached per colour. */
export function glowSprite(color: string, rad: number, dpr: number): HTMLCanvasElement {
  return sprite(`glow|${color}|${rad}`, rad * 2, rad * 2, dpr, null, (c) => {
    const g = c.createRadialGradient(rad * P, rad * P, 0, rad * P, rad * P, rad * P);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, rad * 2 * P, rad * 2 * P);
  });
}

export function drawClockHands(c: Ctx, cx: number, cy: number, date: Date): void {
  const hand = (angle: number, len: number, color: string) => {
    for (let i = 1; i <= len; i++) r(c, cx + Math.round(Math.sin(angle) * i), cy - Math.round(Math.cos(angle) * i), 1, 1, color);
  };
  const m = date.getMinutes();
  hand((((date.getHours() % 12) + m / 60) / 12) * Math.PI * 2, 2, '#2b2a35');
  hand((m / 60) * Math.PI * 2, 3, '#c92a2a');
  r(c, cx, cy, 1, 1, '#2b2a35');
}

// ---------- text (cached) ----------

function textCanvas(key: string, dpr: number, cssW: number, cssH: number, paint: (c: Ctx) => void): HTMLCanvasElement {
  const k = `t|${key}|${dpr}`;
  let cv = cache.get(k);
  if (cv) return cv;
  if (cache.size > 600) cache.clear();
  cv = document.createElement('canvas');
  cv.width = Math.ceil(cssW * dpr);
  cv.height = Math.ceil(cssH * dpr);
  const c = cv.getContext('2d')!;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  paint(c);
  cache.set(k, cv);
  return cv;
}

let measureCtx: Ctx | null = null;
const widths = new Map<string, number>();
const measure = (text: string, font: string): number => {
  const k = font + '|' + text;
  let w = widths.get(k);
  if (w === undefined) {
    measureCtx ??= document.createElement('canvas').getContext('2d')!;
    measureCtx.font = font;
    w = measureCtx.measureText(text).width;
    if (widths.size > 2000) widths.clear();
    widths.set(k, w);
  }
  return w;
};

const fit = (text: string, font: string, max: number): string => {
  let t = text;
  while (t.length > 2 && measure(t, font) > max) t = t.replace(/…$/, '').slice(0, -1) + '…';
  return t;
};

const PILL_TITLE = `700 9px ${FONT}`;
const PILL_SUB = `600 8px ${FONT}`;
export const PILL_H = 21;
const PILL_MAX = 72;

function pillParts(agent: Agent, lang: Lang) {
  const p = pillLines(agent, lang);
  const chip = modelChip(agent.model);
  const extra = 12 + (chip ? 12 : 0);
  const title = fit(p.title, PILL_TITLE, PILL_MAX - extra);
  const sub = fit(p.sub, PILL_SUB, PILL_MAX - 10);
  const subColor = agent.status === 'waiting' ? '#ffc078' : agent.status === 'error' ? '#ffa8a8' : '#b8c1d1';
  const w = Math.ceil(Math.max(measure(title, PILL_TITLE) + extra, measure(sub, PILL_SUB) + 10) + 4);
  return { p, chip, title, sub, subColor, w };
}

/** Width in css px of the name pill (needed for collision placement before drawing). */
export const pillWidth = (agent: Agent, lang: Lang): number => pillParts(agent, lang).w;

/** Lumio-style name pill centred at css (cx, top). */
export function drawPill(c: Ctx, agent: Agent, cx: number, top: number, dpr: number, lang: Lang): void {
  const { p, chip, title, sub, subColor, w } = pillParts(agent, lang);
  const cv = textCanvas(`pill|${title}|${sub}|${p.dot}|${chip?.letter}|${subColor}`, dpr, w, PILL_H, (q) => {
    q.fillStyle = 'rgba(22,26,36,0.90)';
    q.beginPath();
    q.roundRect(0.5, 0.5, w - 1, PILL_H - 1, 6);
    q.fill();
    q.fillStyle = p.dot;
    q.beginPath();
    q.arc(7, 7, 2.6, 0, Math.PI * 2);
    q.fill();
    q.fillStyle = '#f1f3f5';
    q.font = PILL_TITLE;
    q.fillText(title, 12, 10.5);
    if (chip) {
      const x = 12 + measure(title, PILL_TITLE) + 3;
      q.fillStyle = chip.color;
      q.beginPath();
      q.roundRect(x, 2.5, 9, 9, 2.5);
      q.fill();
      q.fillStyle = '#0b1020';
      q.font = `800 7px ${FONT}`;
      q.textAlign = 'center';
      q.fillText(chip.letter, x + 4.5, 9.6);
      q.textAlign = 'left';
    }
    q.fillStyle = subColor;
    q.font = PILL_SUB;
    q.fillText(sub, 5, 18.5);
  });
  c.drawImage(cv, Math.round(cx - w / 2), Math.round(top), w, PILL_H);
}

/** Single line of cached text at css (x, baseline y). */
export function drawText(c: Ctx, text: string, x: number, y: number, font: string, color: string, align: 'left' | 'center' | 'right', dpr: number): void {
  const w = Math.ceil(measure(text, font)) + 2;
  const cv = textCanvas(`txt|${text}|${font}|${color}`, dpr, w, 14, (q) => {
    q.font = font;
    q.fillStyle = color;
    q.fillText(text, 1, 10);
  });
  const left = align === 'left' ? x : align === 'center' ? x - w / 2 : x - w;
  c.drawImage(cv, Math.round(left), Math.round(y - 10), w, 14);
}

export const SMALL_FONT = `700 7px ${FONT}`;
export const HEADER_FONT = `700 10px ${FONT}`;
export const FOOTER_FONT = `600 10px ${FONT}`;

/** Dark frame strips above (header) and below (footer) the room, painted into the static layer. */
export function paintFrame(c: Ctx, w: number, roomH: number): void {
  c.fillStyle = '#1b1e28';
  c.beginPath();
  c.roundRect(0, 0, w, HEADER_H + 2, [8, 8, 0, 0]);
  c.fill();
  c.beginPath();
  c.roundRect(0, HEADER_H + roomH - 2, w, FOOTER_H + 2, [0, 0, 10, 10]);
  c.fill();
  const dot = (x: number, col: string) => { c.fillStyle = col; c.beginPath(); c.arc(x, HEADER_H / 2, 3, 0, Math.PI * 2); c.fill(); };
  dot(10, '#ff6b6b'); dot(20, '#ffd43b'); dot(30, '#51cf66');
}

/** Small pill shown briefly after start so an empty overlay does not look dead. */
export function drawHint(c: Ctx, w: number, text: string): void {
  c.save();
  c.font = '600 12px ui-monospace, Consolas, monospace';
  const tw = c.measureText(text).width + 36;
  const x = Math.round((w - tw) / 2);
  c.fillStyle = 'rgba(24,32,46,0.94)';
  c.strokeStyle = 'rgba(255,212,59,0.7)';
  c.lineWidth = 1.2;
  c.beginPath();
  c.roundRect(x, 0, tw, 34, [0, 0, 14, 14]);
  c.fill();
  c.stroke();
  c.fillStyle = '#ffd43b';
  c.fillRect(x + 14, 14, 6, 6);
  c.fillStyle = '#e5e7eb';
  c.textAlign = 'left';
  c.fillText(text, x + 28, 21);
  c.restore();
}
