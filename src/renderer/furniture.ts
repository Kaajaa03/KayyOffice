// Furniture of the desk zone (chairs, monitors, desk clusters, decor) plus plant and server rack.
// Tables are [x, y, w, h, colour] rects relative to the object's anchor.
import { P } from './room';
import type { Room, Seat } from './room';
import { mug, r, rects, sprite } from './pixels';
import type { Ctx, Rect } from './pixels';
import type { DayPhase } from './sun';
import { FONT, fit, measure } from './text';

// ---------- chairs and monitors (anchor x = centre) ----------

const CHAIR_BACK: Rect[] = [[-5, 0, 10, 5, '#3c4352'], [-5, 0, 10, 1, '#58607a'], [-6, 3, 1, 3, '#2d323d'], [5, 3, 1, 3, '#2d323d'], [-1, 5, 2, 2, '#23262e'], [-4, 7, 8, 1, '#1d2027']];
const CHAIR_FRONT: Rect[] = [[-5, 0, 10, 7, '#3c4352'], [-5, 0, 10, 1, '#58607a'], [-4, 7, 8, 2, '#2d323d']];
/** Screen inner area is (x-6, y+1, 12, 7); screens.ts paints into it. */
const MONITOR_FRONT: Rect[] = [[-7, 0, 14, 9, '#2a2e37'], [-6, 1, 12, 7, '#151a22'], [-1, 9, 2, 1, '#4a505c'], [-3, 10, 6, 1, '#5b6270']];
const MONITOR_BACK: Rect[] = [[-7, 0, 14, 9, '#c9ccd3'], [-7, 8, 14, 1, '#a7abb5'], [-1, 3, 2, 2, '#e9ebef'], [-2, 9, 4, 1, '#8f95a1']];

export const bottomChairY = (s: Seat): number => s.y + 8;
const topChairY = (s: Seat): number => s.y + 2;
export const monitorFrontY = (s: Seat): number => s.y - 13;
export const monitorBackY = (s: Seat): number => s.y + 5;

/** Chair and monitor from behind move with their person, so they are cached sprites. */
export const chairBackSprite = (dpr: number, phase: DayPhase): HTMLCanvasElement =>
  sprite('chairB', 12, 8, dpr, phase, (c) => rects(c, 6, 0, CHAIR_BACK));
export const monitorBackSprite = (dpr: number, phase: DayPhase): HTMLCanvasElement =>
  sprite('monB', 14, 10, dpr, phase, (c) => rects(c, 7, 0, MONITOR_BACK));

// ---------- desks ----------

const DESK: Rect[] = [
  [1, 35, 75, 5, 'rgba(0,0,0,0.10)'], [1, 20, 74, 14, '#c49a6c'], [1, 20, 74, 1, '#d8b385'],
  [1, 26, 74, 2, '#a3acb8'], [1, 26, 74, 1, '#c3cad3'], [1, 34, 74, 5, '#8b6644'], [1, 34, 74, 1, '#a07752'],
  [2, 39, 2, 2, '#5d4430'], [72, 39, 2, 2, '#5d4430'], [37, 39, 2, 2, '#5d4430'],
];
const LABEL_FONT = `700 8px ${FONT}`;

/** Desk of four with a project label plate on its front edge. */
function deskCluster(c: Ctx, x0: number, y0: number, label: string): void {
  rects(c, x0, y0, DESK);
  if (!label) return;
  const text = fit(label, LABEL_FONT, 60 * P, 3);
  const tw = measure(text, LABEL_FONT) + 8;
  const cx = (x0 + 46) * P, top = (y0 + 34.5) * P;
  c.save();
  c.font = LABEL_FONT;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = '#e9dcc4';
  c.fillRect(Math.round(cx - tw / 2), top, Math.round(tw), 8);
  c.fillStyle = '#4a3523';
  c.fillText(text, cx, top + 4.5);
  c.restore();
}

const paper = (c: Ctx, x: number, y: number, w: number, h: number): void => {
  r(c, x, y, w, h, '#f8f9fa');
  r(c, x + 1, y + 1, w - 2, 1, '#ced4da');
};

/** Keyboard + one of three props on the near desk, plant or paper on the far one. */
function deskDecor(c: Ctx, s: Seat): void {
  if (s.facing === 'up') {
    rects(c, s.x, s.y, [[-4, -4, 8, 2, '#e4e6ea'], [-3, -4, 6, 1, '#cfd3da'], [6, -4, 2, 2, '#e4e6ea']]);
    const k = s.slot % 3;
    if (k === 0) mug(c, s.x - 16, s.y - 6, 3, 3);
    else if (k === 1) paper(c, s.x - 17, s.y - 7, 6, 4);
    else r(c, s.x - 15, s.y - 8, 3, 4, '#ffd43b');
  } else if (s.slot % 2) {
    rects(c, s.x, s.y, [[10, 9, 3, 3, '#3f9a5c'], [10, 12, 3, 2, '#b4643a']]);
  } else {
    paper(c, s.x + 9, s.y + 10, 6, 4);
  }
}

/** Static desk layer: far chairs, desks, decor, monitors, and the chair/monitor of every empty seat. */
export function paintDesks(c: Ctx, room: Room, occupied: Set<number>, labels: string[]): void {
  room.clusters.forEach((cl, k) => {
    const seats = room.seats.slice(k * 4, k * 4 + 4);
    for (const s of seats) if (s.facing === 'down') rects(c, s.x, topChairY(s), CHAIR_FRONT);
    deskCluster(c, cl.x, cl.y, labels[k] ?? '');
    for (const s of seats) {
      const free = !occupied.has(s.slot);
      deskDecor(c, s);
      if (s.facing === 'up') {
        rects(c, s.x, monitorFrontY(s), MONITOR_FRONT);
        if (free) rects(c, s.x, bottomChairY(s), CHAIR_BACK);
      } else if (free) rects(c, s.x, monitorBackY(s), MONITOR_BACK);
    }
  });
}

// ---------- shared small objects ----------

export function plant(c: Ctx, x: number, y: number, big = false): void {
  const k = big ? 2 : 1;
  rects(c, x, y, [
    [1, 6 * k, 5 * k - 1, 4 * k, '#b4643a'], [1, 6 * k, 5 * k - 1, 1, '#cf7b4c'],
    [0, 2 * k, 3 * k, 4 * k, '#2f7d4a'], [2 * k, 0, 3 * k, 6 * k, '#3f9a5c'], [k, k, 2 * k, 2 * k, '#57b36f'], [4 * k, 3 * k, 2 * k, 3 * k, '#2f7d4a'],
  ]);
}

export function serverRack(c: Ctx, x: number, y: number, phase: DayPhase): void {
  rects(c, x, y, [[0, 0, 12, 22, '#1f232b'], [1, 1, 10, 20, '#2c313b']]);
  for (let i = 0; i < 5; i++) {
    rects(c, x, y + i * 4, [[2, 2, 8, 3, '#3a404c'], [3, 3, 1, 1, i % 2 ? '#51cf66' : '#4dabf7'], [5, 3, 1, 1, phase === 'night' ? '#ffd43b' : '#2f9e44']]);
  }
  rects(c, x, y, [[0, 22, 12, 1, 'rgba(0,0,0,0.25)']]);
}
