import { describe, it, expect } from 'vitest';
import { DeskLayout, CELL_W, officeStats } from '../src/renderer/scene';

describe('officeStats', () => {
  const a = (id: string, o: Partial<Agent>): Agent => ({ id, sessionId: id, cwd: 'x', status: 'idle', lastEventTs: 1, ...o });
  it('counts agents/working/waiting and sums cost of top-level sessions only', () => {
    const s = officeStats([
      a('s1', { status: 'working', costUsd: 0.5 }),
      a('sub', { status: 'working', parentId: 's1', costUsd: 9 }),
      a('s2', { status: 'waiting', costUsd: 0.25 }),
      a('s3', {}),
    ]);
    expect(s).toEqual({ total: 4, working: 2, waiting: 1, costUsd: 0.75 });
  });
  it('costUsd is null when no session reported any', () => {
    expect(officeStats([a('s1', {})]).costUsd).toBeNull();
  });
});
import type { Agent } from '../src/shared/types';

const ag = (id: string, o: Partial<Agent> = {}): Agent => ({
  id, sessionId: id, cwd: 'C:\\p', status: 'idle', lastEventTs: 1, ...o,
});

describe('DeskLayout', () => {
  it('gives 3 agents 3 distinct positions inside the width', () => {
    const d = new DeskLayout().layout([ag('a'), ag('b'), ag('c')], 900);
    expect(new Set(d.map((x) => `${x.x},${x.y}`)).size).toBe(3);
    d.forEach((x) => expect(x.x + CELL_W).toBeLessThanOrEqual(900));
  });
  it('keeps an agent in place when another one leaves', () => {
    const l = new DeskLayout();
    l.layout([ag('a'), ag('b'), ag('c')], 900);
    const before = l.layout([ag('a'), ag('c')], 900).find((x) => x.agentId === 'c')!;
    const first = new DeskLayout();
    const all = first.layout([ag('a'), ag('b'), ag('c')], 900).find((x) => x.agentId === 'c')!;
    expect(before.x).toBe(all.x);
    expect(before.y).toBe(all.y);
  });
  it('places a subagent right next to its parent', () => {
    const l = new DeskLayout();
    l.layout([ag('p')], 900);
    const d = l.layout([ag('p'), ag('s', { parentId: 'p' })], 900);
    const p = d.find((x) => x.agentId === 'p')!;
    const s = d.find((x) => x.agentId === 's')!;
    expect(s.slot).toBe(p.slot + 1);
  });
  it('seats a new agent next to its project mates instead of in the lowest free slot', () => {
    const P1 = 'C:\\x\\P1', P2 = 'C:\\x\\P2';
    const l = new DeskLayout();
    l.layout([ag('p', { cwd: P1 }), ag('q', { cwd: P2 }), ag('r', { cwd: P2 })], 900); // slots 0,1,2
    l.layout([ag('q', { cwd: P2 }), ag('r', { cwd: P2 })], 900); // p leaves, slot 0 is free
    const d = l.layout([ag('q', { cwd: P2 }), ag('r', { cwd: P2 }), ag('s', { cwd: P2 })], 900);
    expect(d.find((x) => x.agentId === 's')!.slot).toBe(3);
  });
  it('wraps to a new row when the width is exceeded', () => {
    const agents = Array.from({ length: 5 }, (_, i) => ag('a' + i));
    const d = new DeskLayout().layout(agents, CELL_W * 2);
    expect(Math.max(...d.map((x) => x.row))).toBe(2);
  });
});
