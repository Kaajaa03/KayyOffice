// Overlay size: the room is pixel art on a 3 px unit, so only scales that give whole device pixels
// per art pixel (2/3/4/5/6) are offered. Pure functions (no Electron types), unit-tested.
import { clampToWorkAreas } from './position';
import type { Rect, Size } from './position';

export const SCALES = [0.67, 1, 1.33, 1.67, 2] as const;
const DEFAULT_SCALE = 1;
const SNAP = 0.01;

/** The allowed step a stored/received value stands for (tiny float noise is snapped); invalid => 1. */
export function parseScale(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_SCALE;
  return SCALES.find((s) => Math.abs(s - v) <= SNAP) ?? DEFAULT_SCALE;
}

export function stepScale(current: number, dir: 1 | -1): number {
  const i = SCALES.indexOf(parseScale(current) as (typeof SCALES)[number]);
  return SCALES[Math.min(SCALES.length - 1, Math.max(0, i + dir))];
}

/** Window size in DIP for a base size at `scale` (whole pixels). */
export function scaledSize(base: Size, scale: number): Size {
  return { width: Math.round(base.width * scale), height: Math.round(base.height * scale) };
}

/** Largest allowed step <= `scale` whose window still fits the work area; never below the smallest step. */
export function fitScale(scale: number, base: Size, area: Rect): number {
  const wanted = parseScale(scale);
  const fits = SCALES.filter((s) => s <= wanted && base.width * s <= area.width && base.height * s <= area.height);
  return fits.length ? fits[fits.length - 1] : SCALES[0];
}

/** New window bounds after a size change: same horizontal centre and top edge, kept reachable on a display. */
export function rescaleBounds(old: Rect, size: Size, areas: Rect[]): Rect {
  const x = Math.round(old.x + old.width / 2 - size.width / 2);
  const p = clampToWorkAreas({ x, y: old.y }, size, areas);
  return { x: p.x, y: p.y, width: size.width, height: size.height };
}
