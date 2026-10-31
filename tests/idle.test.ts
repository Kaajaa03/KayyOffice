import { describe, it, expect } from 'vitest';
import { idleTimeline } from '../src/renderer/agents';

describe('idleTimeline', () => {
  it('loops through coffee and lounge phases', () => {
    const seen = new Set<string>();
    for (let ms = 0; ms < 24000; ms += 500) seen.add(idleTimeline(ms, 'a1').phase);
    expect(seen).toEqual(new Set(['toCoffee', 'coffee', 'toLounge', 'lounge']));
  });
  it('repeats after one cycle and never walks when reduced', () => {
    expect(idleTimeline(1000, 'x')).toEqual(idleTimeline(25000, 'x'));
    for (let ms = 0; ms < 24000; ms += 500) expect(['coffee', 'lounge']).toContain(idleTimeline(ms, 'x', true).phase);
  });
});
