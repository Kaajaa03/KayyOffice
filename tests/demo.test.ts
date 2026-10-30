import { describe, it, expect } from 'vitest';
import { demoCountState, demoState } from '../src/main/demo';
import { projectOf } from '../src/shared/project';

describe('demoCountState (--demo-count=<n>)', () => {
  it.each([1, 2, 5, 10, 16, 24, 40])('creates exactly %i agents with unique ids', (n) => {
    const agents = Object.values(demoCountState(n, 1_000_000).agents);
    expect(agents.length).toBe(n);
    expect(new Set(agents.map((a) => a.id)).size).toBe(n);
  });
  it('spreads agents over 1 to 4 projects', () => {
    const projects = (n: number) => new Set(Object.values(demoCountState(n).agents).map(projectOf)).size;
    expect(projects(1)).toBe(1);
    expect(projects(5)).toBeGreaterThanOrEqual(1);
    expect(projects(40)).toBe(4);
    for (const n of [2, 5, 10, 16, 24]) expect(projects(n)).toBeLessThanOrEqual(4);
  });
  it('mixes statuses once there are enough agents', () => {
    const statuses = new Set(Object.values(demoCountState(10).agents).map((a) => a.status));
    expect(statuses.size).toBeGreaterThanOrEqual(4);
  });
  it('clamps absurd counts', () => {
    expect(Object.keys(demoCountState(0).agents).length).toBe(1);
    expect(Object.keys(demoCountState(500).agents).length).toBe(60);
  });
  it('the fixed demo is unchanged in size', () => {
    expect(Object.keys(demoState().agents).length).toBe(10);
  });
  it('both demos carry a roster, context and a five-hour limit; two types are in use', () => {
    for (const s of [demoState(), demoCountState(5)]) {
      expect(s.roster!.length).toBeGreaterThanOrEqual(6);
      const agents = Object.values(s.agents);
      expect(agents.some((a) => a.context?.percent === 34)).toBe(true);
      expect(agents.some((a) => a.limit?.kind === 'five_hour' && a.limit.percent === 62)).toBe(true);
      expect(s.roster!.filter((e) => agents.some((a) => a.name === e.type)).length).toBe(2);
    }
  });
});
