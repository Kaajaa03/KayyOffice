// Paints the static layer: window frame strips plus the whole room without people and without
// anything that sits in front of people. Repainted only when size, day phase or seating changes.
import { paintDesks, plant, serverRack } from './furniture';
import { TINT, r, rects } from './pixels';
import type { Ctx } from './pixels';
import { CLUSTER_W, KITCHEN_W, P, PAD, WALL_H } from './room';
import type { Room } from './room';
import type { DayPhase } from './sun';
import { SHELF_W, bookshelf, clockFace, kitchen, lampHead, lightShaft, lounge, wallDisplay, windowPane } from './zones';

export const HEADER_H = 18;
export const FOOTER_H = 20;

interface WallItem { kind: 'window' | 'clock' | 'display' | 'shelf'; x: number; w: number }

const WIDTH: Record<WallItem['kind'], number> = { window: 24, clock: 12, display: 34, shelf: SHELF_W };
const WALL_ORDER: WallItem['kind'][] = ['window', 'clock', 'display', 'window', 'shelf', 'window', 'window', 'shelf', 'window', 'window'];

/** Wall decoration along the desk zone (clock + display always come early), centred in the free span. */
export function wallItems(room: Room): WallItem[] {
  const items: WallItem[] = [];
  const start = PAD + KITCHEN_W + 4;
  const end = room.loungeX - 2;
  let x = start;
  for (const kind of WALL_ORDER) {
    const w = WIDTH[kind];
    if (x + w > end) break;
    items.push({ kind, x, w });
    x += w + 5;
  }
  const shift = Math.floor((end - start - (x - 5 - start)) / 2);
  for (const it of items) it.x += shift;
  return items;
}

function lightPool(c: Ctx, x: number, y: number, rad: number, color: string): void {
  const g = c.createRadialGradient(x * P, y * P, 0, x * P, y * P, rad * P);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(255,214,150,0)');
  c.fillStyle = g;
  c.fillRect((x - rad) * P, (y - rad) * P, rad * 2 * P, rad * 2 * P);
}

function paintWall(c: Ctx, room: Room, phase: DayPhase): void {
  const { w, h } = room;
  r(c, 0, WALL_H, w, h - WALL_H, '#c9c2b2');
  for (let y = WALL_H; y < h; y += 8) {
    for (let x = 0; x < w; x += 8) r(c, x, y, 7, 7, ((x + y) / 8) % 2 ? '#ddd6c8' : '#d6cfc0');
  }
  rects(c, 0, 0, [
    [0, 0, w, WALL_H, '#e7e0d3'], [0, 0, w, 2, '#cbbfad'], [0, WALL_H - 7, w, 5, '#ddd4c4'],
    [0, WALL_H - 7, w, 1, '#cfc5b3'], [0, WALL_H - 2, w, 2, '#8f8372'], [0, WALL_H, w, 1, 'rgba(0,0,0,0.12)'],
  ]);
  for (const it of wallItems(room)) {
    if (it.kind === 'window') { windowPane(c, it.x, 4, it.w, 14, phase); lightShaft(c, it.x, it.w, phase, h - WALL_H); }
    else if (it.kind === 'clock') clockFace(c, it.x + it.w / 2);
    else if (it.kind === 'display') wallDisplay(c, it.x, it.w);
    else bookshelf(c, it.x, 5, 31);
  }
}

/** Warm lamplight pools after dark. */
function paintLamps(c: Ctx, room: Room, phase: DayPhase): void {
  const warm = phase === 'night' ? 'rgba(255,210,140,0.30)' : 'rgba(255,210,140,0.16)';
  for (const cl of room.clusters) lightPool(c, cl.x + CLUSTER_W / 2, cl.y + 27, 44, warm);
  lightPool(c, room.loungeX + 81, 26, 34, warm);
  lightPool(c, room.kitchenX + 10, 24, 22, warm);
  lampHead(c, room, '#fff1bf');
}

export function paintRoom(c: Ctx, room: Room, phase: DayPhase, occupied: Set<number>, labels: string[]): void {
  const { w, h } = room;
  paintWall(c, room, phase);
  lightShaft(c, room.loungeX + 14, 40, phase, h - WALL_H);
  kitchen(c, room, phase);
  serverRack(c, room.kitchenX + 2, h - 26, phase);
  plant(c, room.kitchenX + 25, h - 12);
  lounge(c, room, phase);
  paintDesks(c, room, occupied, labels);

  const tint = TINT[phase];
  if (tint) { c.fillStyle = tint; c.fillRect(0, 0, w * P, h * P); }
  if (phase === 'night' || phase === 'dusk') paintLamps(c, room, phase);
  c.strokeStyle = '#2b2a35';
  c.lineWidth = 2;
  c.strokeRect(1, 1, w * P - 2, h * P - 2);
}

const DOTS: Array<[number, string]> = [[10, '#ff6b6b'], [20, '#ffd43b'], [30, '#51cf66']];

/** Dark strips above (title, traffic-light dots) and below (footer) the room. */
export function paintFrame(c: Ctx, w: number, roomH: number): void {
  c.fillStyle = '#1b1e28';
  c.beginPath();
  c.roundRect(0, 0, w, HEADER_H + 2, [8, 8, 0, 0]);
  c.fill();
  c.beginPath();
  c.roundRect(0, HEADER_H + roomH - 2, w, FOOTER_H + 2, [0, 0, 10, 10]);
  c.fill();
  for (const [x, color] of DOTS) {
    c.fillStyle = color;
    c.beginPath();
    c.arc(x, HEADER_H / 2, 3, 0, Math.PI * 2);
    c.fill();
  }
}
