import { describe, it, expect } from 'vitest';
import { clampToWorkAreas, parsePlacement, parsePosition, placementPoint, PLACEMENTS } from '../src/main/position';

const A = { x: 0, y: 0, width: 1920, height: 1040 }; // primary work area
const B = { x: 1920, y: 0, width: 1920, height: 1040 }; // second monitor to the right
const SIZE = { width: 900, height: 460 };

describe('placementPoint', () => {
  it('puts the window at the six presets of a work area', () => {
    expect(placementPoint('top-center', SIZE, A)).toEqual({ x: 510, y: 0 });
    expect(placementPoint('top-left', SIZE, A)).toEqual({ x: 0, y: 0 });
    expect(placementPoint('top-right', SIZE, A)).toEqual({ x: 1020, y: 0 });
    expect(placementPoint('bottom-center', SIZE, A)).toEqual({ x: 510, y: 580 });
    expect(placementPoint('bottom-left', SIZE, A)).toEqual({ x: 0, y: 580 });
    expect(placementPoint('bottom-right', SIZE, A)).toEqual({ x: 1020, y: 580 });
  });
  it('respects the work area offset (taskbar at the top, second monitor)', () => {
    expect(placementPoint('top-left', SIZE, { x: 1920, y: 40, width: 1920, height: 1000 })).toEqual({ x: 1920, y: 40 });
  });
  it('every preset name is listed', () => expect([...PLACEMENTS].sort()).toEqual(
    ['bottom-center', 'bottom-left', 'bottom-right', 'top-center', 'top-left', 'top-right']));
});

describe('clampToWorkAreas', () => {
  it('leaves a visible position untouched', () => {
    expect(clampToWorkAreas({ x: 300, y: 200 }, SIZE, [A])).toEqual({ x: 300, y: 200 });
  });
  it('keeps a window on the second monitor where it is', () => {
    expect(clampToWorkAreas({ x: 2500, y: 100 }, SIZE, [A, B])).toEqual({ x: 2500, y: 100 });
  });
  it('pulls a window that was on a monitor which is gone into the nearest work area', () => {
    const p = clampToWorkAreas({ x: 2500, y: 100 }, SIZE, [A]);
    expect(p.x).toBeLessThanOrEqual(A.x + A.width - 200);
    expect(p.x).toBeGreaterThanOrEqual(A.x - (SIZE.width - 200));
    expect(p.y).toBe(100);
  });
  it('never lets the title strip leave the screen vertically', () => {
    expect(clampToWorkAreas({ x: 100, y: -300 }, SIZE, [A]).y).toBe(0);
    expect(clampToWorkAreas({ x: 100, y: 5000 }, SIZE, [A]).y).toBe(A.y + A.height - 40);
  });
  it('allows a partly off-screen window but keeps at least 200 px visible', () => {
    expect(clampToWorkAreas({ x: -5000, y: 0 }, SIZE, [A]).x).toBe(-(SIZE.width - 200));
    expect(clampToWorkAreas({ x: 5000, y: 0 }, SIZE, [A]).x).toBe(A.width - 200);
  });
  it('falls back to the first area when none is given', () => {
    expect(clampToWorkAreas({ x: 10, y: 10 }, SIZE, [])).toEqual({ x: 10, y: 10 });
  });
});

describe('config parsing', () => {
  it('parsePosition accepts finite numbers only', () => {
    expect(parsePosition({ x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
    for (const bad of [undefined, null, 'x', {}, { x: 1 }, { x: 'a', y: 2 }, { x: Infinity, y: 0 }, { x: NaN, y: 0 }]) {
      expect(parsePosition(bad)).toBeUndefined();
    }
  });
  it('parsePlacement validates the preset name', () => {
    expect(parsePlacement('bottom-right')).toBe('bottom-right');
    expect(parsePlacement('nonsense')).toBeUndefined();
  });
});
