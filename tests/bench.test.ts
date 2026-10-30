import { describe, it, expect } from 'vitest';
import { BENCH_SPOTS, benchName, benchPlan, typeInUse } from '../src/renderer/bench';
import { roomLayout } from '../src/renderer/room';
import type { Agent, RosterEntry } from '../src/shared/types';

const agent = (o: Partial<Agent>): Agent => ({ id: 'a', sessionId: 'a', cwd: 'C:\p', status: 'working', lastEventTs: 0, ...o });
const roster: RosterEntry[] = [
  { type: 'kayy-scout', model: 'haiku' }, { type: 'kayy-coder', model: 'sonnet' }, { type: 'codex-worker' },
];

describe('benchName', () => {
  it('strips the kayy- prefix and shortens long names', () => {
    expect(benchName('kayy-scout')).toBe('scout');
    expect(benchName('codex-worker')).toBe('codex-worker');
    expect(benchName('kayy-')).toBe('kayy-');
    expect(benchName('kayy-extremely-long-type')).toHaveLength(12);
    expect(benchName('kayy-extremely-long-type').endsWith('…')).toBe(true);
  });
});

describe('typeInUse', () => {
  it('is true for working, waiting and error agents of that name only', () => {
    for (const status of ['working', 'waiting', 'error'] as const) expect(typeInUse('x', [agent({ name: 'x', status })])).toBe(true);
    for (const status of ['idle', 'done'] as const) expect(typeInUse('x', [agent({ name: 'x', status })])).toBe(false);
    expect(typeInUse('x', [agent({ name: 'y' }), agent({ id: 'b' })])).toBe(false);
  });
});

describe('benchPlan', () => {
  it('is empty without a roster', () => {
    expect(benchPlan(undefined, [])).toEqual({ figures: [], more: 0 });
    expect(benchPlan([], [])).toEqual({ figures: [], more: 0 });
  });
  it('lists every type not in use, in roster order, with name and chip', () => {
    const p = benchPlan(roster, [agent({ name: 'kayy-coder' })]);
    expect(p.figures.map((f) => f.type)).toEqual(['kayy-scout', 'codex-worker']);
    expect(p.figures[0].name).toBe('scout');
    expect(p.figures[0].chip?.letter).toBe('H');
    expect(p.figures[1].chip).toBeNull();
    expect(p.more).toBe(0);
  });
  it('a figure returns to the bench once its agent is done', () => {
    const p = benchPlan(roster, [agent({ name: 'kayy-coder', status: 'done' })]);
    expect(p.figures.map((f) => f.type)).toContain('kayy-coder');
  });
  it('shows at most 6 and counts the rest', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ type: `t${i}` }));
    const p = benchPlan(many, [agent({ name: 't0' })]);
    expect(BENCH_SPOTS).toBe(6);
    expect(p.figures).toHaveLength(6);
    expect(p.more).toBe(3);
    expect(p.figures[0].type).toBe('t1');
  });
  it('ignores duplicate types', () => {
    expect(benchPlan([{ type: 'a' }, { type: 'a', model: 'opus' }], []).figures).toHaveLength(1);
  });
});

describe('room bench spots', () => {
  it('has 6 distinct spots inside the lounge, independent of the desk count', () => {
    for (const slots of [1, 12, 40]) {
      const r = roomLayout(slots);
      expect(r.benchSpots).toHaveLength(BENCH_SPOTS);
      expect(new Set(r.benchSpots.map((p) => `${p.x},${p.y}`)).size).toBe(BENCH_SPOTS);
      for (const p of r.benchSpots) {
        expect(p.x).toBeGreaterThan(r.loungeX);
        expect(p.x).toBeLessThan(r.w);
        expect(p.y).toBeLessThan(r.h - 8);
      }
    }
    expect(roomLayout(12).seats).toHaveLength(roomLayout(12).clusters.length * 4);
  });
});
