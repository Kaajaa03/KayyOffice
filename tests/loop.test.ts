import { describe, it, expect } from 'vitest';
import { FrameGate, animationMode } from '../src/renderer/loop';
import type { Agent } from '../src/shared/types';

const a = (status: Agent['status']): Agent => ({ id: status, sessionId: status, cwd: 'x', status, lastEventTs: 0 });

describe('animationMode', () => {
  it('is fast only while an agent is working', () => expect(animationMode([a('idle'), a('working')])).toBe('fast'));
  it('is slow (not 60 fps) for waiting/error/done only', () => {
    for (const s of ['waiting', 'error', 'done'] as const) expect(animationMode([a(s)])).toBe('slow');
  });
  it('is none when everything is idle or empty', () => {
    expect(animationMode([a('idle')])).toBe('none');
    expect(animationMode([])).toBe('none');
  });
});

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
