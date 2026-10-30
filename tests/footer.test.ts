import { describe, it, expect } from 'vitest';
import { footerParts, meterLevel } from '../src/renderer/footer';
import type { Agent } from '../src/shared/types';

const agent = (o: Partial<Agent>): Agent => ({ id: 'a', sessionId: 'a', cwd: 'C:\p', status: 'idle', lastEventTs: 0, ...o });
const texts = (a: Agent[], lang: 'de' | 'en' = 'de') => footerParts(a, lang).map((p) => p.text);

describe('meterLevel', () => {
  it.each([[0, 'ok'], [69, 'ok'], [70, 'warn'], [84, 'warn'], [85, 'high'], [100, 'high'], [250, 'high']] as const)('%i -> %s', (p, l) => {
    expect(meterLevel(p)).toBe(l);
  });
});

describe('footerParts', () => {
  it('keeps the existing parts and adds none when nothing is known', () => {
    expect(texts([agent({ status: 'working', costUsd: 1.5 })])).toEqual(['1 Agent', '1 aktiv', '$1.50']);
  });
  it('adds context (highest of the top-level sessions) and the five-hour limit', () => {
    const a = [
      agent({ id: 'a', context: { percent: 34 }, limit: { kind: 'five_hour', percent: 21 } }),
      agent({ id: 'b', context: { percent: 12 }, limit: { kind: 'five_hour', percent: 18 } }),
      agent({ id: 'c', parentId: 'a', context: { percent: 90 } }),
    ];
    expect(texts(a)).toEqual(['3 Agents', 'Kontext 34 %', '5h 21 %']);
    expect(texts(a, 'en')).toEqual(['3 agents', 'Context 34%', '5h 21%']);
  });
  it('colours by threshold', () => {
    const parts = footerParts([agent({ context: { percent: 72 }, limit: { kind: 'five_hour', percent: 90 } })], 'de');
    expect(parts[1]).toEqual({ text: 'Kontext 72 %', level: 'warn' });
    expect(parts[2]).toEqual({ text: '5h 90 %', level: 'high' });
    expect(footerParts([agent({})], 'de')[0].level).toBeUndefined();
  });
  it('names other limit kinds and prefers five_hour', () => {
    expect(texts([agent({ limit: { kind: 'seven_day', percent: 40 } })]).pop()).toBe('7d 40 %');
    expect(texts([agent({ limit: { kind: 'opus_weekly', percent: 5 } })]).pop()).toBe('opus_weekly 5 %');
    expect(texts([agent({ id: 'a', limit: { kind: 'seven_day', percent: 99 } }), agent({ id: 'b', limit: { kind: 'five_hour', percent: 3 } })]).pop()).toBe('5h 3 %');
  });
});
