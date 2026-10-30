import { describe, it, expect } from 'vitest';
import { doneTimeline, isWalking, walkPath, pointAlong, WALK_MS, COFFEE_MS } from '../src/renderer/walk';
import type { Agent } from '../src/shared/types';

describe('doneTimeline', () => {
  it('walks to the coffee machine first', () => {
    expect(doneTimeline(0)).toEqual({ phase: 'toCoffee', t: 0 });
    expect(doneTimeline(WALK_MS / 2)).toEqual({ phase: 'toCoffee', t: 0.5 });
  });
  it('then drinks coffee, walks to the lounge and stays there', () => {
    expect(doneTimeline(WALK_MS + 10).phase).toBe('coffee');
    expect(doneTimeline(WALK_MS + COFFEE_MS + 10).phase).toBe('toLounge');
    expect(doneTimeline(10 * 60_000)).toEqual({ phase: 'lounge', t: 1 });
  });
  it('treats negative elapsed (clock skew) as just started', () => {
    expect(doneTimeline(-500).phase).toBe('toCoffee');
  });
});

describe('isWalking', () => {
  const ag = (status: Agent['status'], ts: number): Agent => ({ id: 'a', sessionId: 'a', cwd: 'x', status, lastEventTs: ts });
  it('only done agents in a walk phase walk', () => {
    expect(isWalking(ag('done', 1000), 1500)).toBe(true);
    expect(isWalking(ag('done', 1000), 1000 + WALK_MS + 100)).toBe(false);
    expect(isWalking(ag('working', 1000), 1500)).toBe(false);
  });
});

describe('walkPath / pointAlong', () => {
  const path = walkPath({ x: 100, y: 50 }, { x: 10, y: 30 }, 70);
  it('goes via the aisle (no diagonal shortcuts through desks)', () => {
    expect(path).toEqual([{ x: 100, y: 50 }, { x: 100, y: 70 }, { x: 10, y: 70 }, { x: 10, y: 30 }]);
  });
  it('drops duplicate waypoints', () => {
    expect(walkPath({ x: 5, y: 70 }, { x: 5, y: 70 }, 70)).toEqual([{ x: 5, y: 70 }]);
  });
  it('interpolates by distance, with direction and a 2-frame cycle', () => {
    const start = pointAlong(path, 0);
    expect(start).toMatchObject({ x: 100, y: 50, dir: 'down' });
    const end = pointAlong(path, 1);
    expect(end).toMatchObject({ x: 10, y: 30, dir: 'up' });
    const mid = pointAlong(path, 0.5); // total 20+90+40 = 150 -> 75 = 20 down + 55 left
    expect(mid).toMatchObject({ x: 45, y: 70, dir: 'left' });
    const frames = new Set([0.1, 0.12, 0.14, 0.16, 0.18, 0.2].map((t) => pointAlong(path, t).frame));
    expect(frames).toEqual(new Set([0, 1]));
  });
  it('handles a single-point path', () => {
    expect(pointAlong([{ x: 3, y: 4 }], 0.7)).toMatchObject({ x: 3, y: 4 });
  });
});
