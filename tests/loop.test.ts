import { describe, it, expect } from 'vitest';
import { FrameGate } from '../src/renderer/loop';

const gate = () => new FrameGate({ activeFps: 60, idleFps: 10 });

describe('FrameGate', () => {
  it('never draws when not visible', () => {
    const g = gate();
    expect(g.shouldDraw(0, true, false)).toBe(false);
    expect(g.shouldDraw(1000, true, false)).toBe(false);
  });
  it('limits to idleFps without animation', () => {
    const g = gate();
    expect(g.shouldDraw(0, false, true)).toBe(true);
    expect(g.shouldDraw(50, false, true)).toBe(false);
    expect(g.shouldDraw(100, false, true)).toBe(true);
  });
  it('allows ~60fps with animation', () => {
    const g = gate();
    expect(g.shouldDraw(0, true, true)).toBe(true);
    expect(g.shouldDraw(10, true, true)).toBe(false);
    expect(g.shouldDraw(17, true, true)).toBe(true);
  });
});
