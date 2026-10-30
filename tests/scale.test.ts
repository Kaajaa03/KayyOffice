import { describe, it, expect } from 'vitest';
import { SCALES, fitScale, parseScale, rescaleBounds, scaledSize, stepScale } from '../src/main/scale';

const WA = { x: 0, y: 0, width: 1920, height: 1040 };
const BASE = { width: 900, height: 460 };

describe('parseScale', () => {
  it('accepts the five steps', () => {
    for (const s of SCALES) expect(parseScale(s)).toBe(s);
  });
  it('snaps tiny float noise to the step', () => expect(parseScale(1.3333)).toBe(1.33));
  it('falls back to 1 for everything else', () => {
    for (const bad of [undefined, null, 'x', '1.33', NaN, Infinity, 0, -1, 1.5, 3, {}]) expect(parseScale(bad)).toBe(1);
  });
});

describe('stepScale', () => {
  it('moves one step up or down', () => {
    expect(stepScale(1, 1)).toBe(1.33);
    expect(stepScale(1, -1)).toBe(0.67);
    expect(stepScale(1.67, 1)).toBe(2);
  });
  it('clamps at both ends', () => {
    expect(stepScale(2, 1)).toBe(2);
    expect(stepScale(0.67, -1)).toBe(0.67);
  });
});

describe('scaledSize', () => {
  it('multiplies and rounds to whole pixels', () => {
    expect(scaledSize(BASE, 1.33)).toEqual({ width: 1197, height: 612 });
    expect(scaledSize(BASE, 0.67)).toEqual({ width: 603, height: 308 });
    expect(scaledSize(BASE, 1)).toEqual(BASE);
  });
});

describe('fitScale', () => {
  it('keeps the wanted step when it fits', () => expect(fitScale(2, BASE, WA)).toBe(2));
  it('steps down to the largest allowed scale that fits the work area', () => {
    expect(fitScale(2, BASE, { x: 0, y: 0, width: 1366, height: 728 })).toBe(1.33); // 1197 x 612
    expect(fitScale(2, BASE, { x: 0, y: 0, width: 1920, height: 800 })).toBe(1.67); // 1503 x 768
  });
  it('never goes below 0.67, even on a tiny display', () => {
    expect(fitScale(2, BASE, { x: 0, y: 0, width: 300, height: 200 })).toBe(0.67);
  });
  it('never goes above the wanted scale', () => expect(fitScale(1, BASE, WA)).toBe(1));
});

describe('rescaleBounds', () => {
  const old = { x: 510, y: 0, width: 900, height: 460 };
  it('keeps horizontal centre and top edge', () => {
    const b = rescaleBounds(old, { width: 1197, height: 612 }, [WA]);
    expect(b).toEqual({ x: 362, y: 0, width: 1197, height: 612 }); // centre 960 -> 361.5 rounded
    expect(Math.abs(b.x + b.width / 2 - 960)).toBeLessThanOrEqual(1);
  });
  it('keeps the window reachable when growing past the display edge', () => {
    const right = { x: 1020, y: 0, width: 900, height: 460 };
    const b = rescaleBounds(right, { width: 1800, height: 920 }, [WA]);
    expect(b.x).toBeLessThanOrEqual(WA.x + WA.width - 200);
    expect(b.y).toBe(0);
    expect(b.width).toBe(1800);
  });
  it('shrinking keeps the centre', () => {
    const b = rescaleBounds(old, { width: 603, height: 308 }, [WA]);
    expect(b.x).toBe(Math.round(510 + 450 - 301.5));
  });
});
