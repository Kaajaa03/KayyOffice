import { describe, it, expect } from 'vitest';
import { placePills } from '../src/renderer/pillplace';
import type { PillBox } from '../src/renderer/pillplace';

const bounds = { left: 0, right: 400, top: 0, bottom: 200 };
const box = (cx: number, top: number, w = 70, h = 21): PillBox => ({ cx, top, w, h });
const overlaps = (a: { x: number; top: number }, wa: number, b: { x: number; top: number }, wb: number, h = 21) =>
  Math.abs(a.x - b.x) < (wa + wb) / 2 && Math.abs(a.top - b.top) < h;

describe('placePills', () => {
  it('leaves non-overlapping pills where they are', () => {
    const out = placePills([box(50, 50), box(200, 50)], bounds);
    expect(out).toEqual([{ x: 50, top: 50 }, { x: 200, top: 50 }]);
  });
  it('separates pills that sit on top of each other, keeping the first one in place', () => {
    const boxes = [box(100, 100), box(105, 100), box(95, 102), box(110, 98)];
    const out = placePills(boxes, bounds);
    expect(out[0]).toEqual({ x: 100, top: 100 });
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) expect(overlaps(out[i], 70, out[j], 70)).toBe(false);
  });
  it('clamps pills into the bounds', () => {
    const out = placePills([box(-10, 50), box(420, 50)], bounds);
    expect(out[0].x).toBe(35);
    expect(out[1].x).toBe(365);
  });
  it('never moves a pill outside the vertical bounds', () => {
    const out = placePills(Array.from({ length: 12 }, () => box(100, 5)), bounds);
    for (const p of out) {
      expect(p.top).toBeGreaterThanOrEqual(bounds.top);
      expect(p.top + 21).toBeLessThanOrEqual(bounds.bottom);
    }
  });
});
