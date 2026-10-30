// Where the overlay window sits: presets, free dragging and keeping it reachable after display changes.
// Pure functions (no Electron types) so the geometry is unit-tested.

export interface Rect { x: number; y: number; width: number; height: number }
export interface Point { x: number; y: number }
export interface Size { width: number; height: number }

export const PLACEMENTS = ['top-center', 'top-left', 'top-right', 'bottom-center', 'bottom-left', 'bottom-right'] as const;
export type Placement = (typeof PLACEMENTS)[number];

/** A window must keep at least this much visible, or it could be dragged out of reach. */
const MIN_VISIBLE_W = 200;
const MIN_VISIBLE_H = 40;

export function parsePlacement(v: unknown): Placement | undefined {
  return PLACEMENTS.find((p) => p === v);
}

export function parsePosition(v: unknown): Point | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const { x, y } = v as Record<string, unknown>;
  return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}

export function placementPoint(p: Placement, size: Size, area: Rect): Point {
  const left = area.x;
  const right = Math.max(area.x, area.x + area.width - size.width);
  const centerX = Math.max(area.x, area.x + Math.round((area.width - size.width) / 2));
  const top = area.y;
  const bottom = Math.max(area.y, area.y + area.height - size.height);
  const [vertical, horizontal] = p.split('-') as ['top' | 'bottom', 'left' | 'center' | 'right'];
  return { x: horizontal === 'left' ? left : horizontal === 'right' ? right : centerX, y: vertical === 'top' ? top : bottom };
}

const overlap = (a: Rect, b: Rect): number => {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};

const distance = (a: Rect, b: Rect): number =>
  Math.hypot(a.x + a.width / 2 - (b.x + b.width / 2), a.y + a.height / 2 - (b.y + b.height / 2));

/** Keeps the window reachable: picks the display it overlaps most (else the nearest one) and
 *  limits the position so at least MIN_VISIBLE_W x MIN_VISIBLE_H of its top edge stays on it. */
export function clampToWorkAreas(pos: Point, size: Size, areas: Rect[]): Point {
  if (!areas.length) return pos;
  const win: Rect = { ...pos, ...size };
  let best = areas[0];
  let bestOverlap = -1;
  for (const a of areas) {
    const o = overlap(win, a);
    if (o > bestOverlap || (o === bestOverlap && o === 0 && distance(win, a) < distance(win, best))) { best = a; bestOverlap = o; }
  }
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  return {
    x: clamp(pos.x, best.x - (size.width - MIN_VISIBLE_W), best.x + best.width - MIN_VISIBLE_W),
    y: clamp(pos.y, best.y, best.y + best.height - MIN_VISIBLE_H),
  };
}
