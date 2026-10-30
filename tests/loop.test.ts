import { describe, it, expect } from 'vitest';
import { FrameGate, animTime, animationMode } from '../src/renderer/loop';
import type { Agent } from '../src/shared/types';

const a = (status: Agent['status']): Agent => ({ id: status, sessionId: status, cwd: 'x', status, lastEventTs: 0 });

describe('animationMode', () => {
  it('is fast only while an agent is working', () => expect(animationMode([a('idle'), a('working')])).toBe('fast'));
  it('is slow (not 60 fps) for waiting/error/done only', () => {
    for (const s of ['waiting', 'error', 'done'] as const) expect(animationMode([a(s)])).toBe('slow');
  });
  it('is fast while a done agent walks to the coffee machine, slow while drinking', () => {
    const now = 100_000;
    const done = (ts: number): Agent => ({ ...a('done'), lastEventTs: ts });
    expect(animationMode([done(now - 500)], now)).toBe('fast');
    expect(animationMode([done(now - 10_000)], now)).toBe('slow');
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

describe('reduced motion', () => {
  it('never runs at 60 fps; working agents need no redraw timer at all', () => {
    expect(animationMode([a('working')], Date.now(), true)).toBe('none');
    expect(animationMode([a('waiting')], Date.now(), true)).toBe('none');
    const done: Agent = { ...a('done'), lastEventTs: 100_000 - 500 };
    expect(animationMode([done], 100_000, true)).toBe('slow'); // relocation by time still needs a tick
  });
  it('animTime freezes the animation clock', () => {
    expect(animTime(12345, false)).toBe(12345);
    expect(animTime(12345, true)).toBe(0);
  });
});
