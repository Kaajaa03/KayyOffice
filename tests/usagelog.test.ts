import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UsageStore, emptyUsage, lastDays, parseUsage, pruneUsage, recordCost } from '../src/main/usagelog';

const D1 = '2026-11-20';
const D2 = '2026-11-21';

describe('recordCost', () => {
  it('counts the delta to the last known cumulative cost', () => {
    let u = recordCost(emptyUsage(), 's1', 1, D1);
    u = recordCost(u, 's1', 1.5, D1);
    u = recordCost(u, 's1', 1.5, D1);
    expect(u.days[D1]).toEqual({ usd: 1.5, sessions: 1 });
  });
it('a stray lower value does not count the same cost twice (5 -> 1 -> 5)', () => {    let u = recordCost(emptyUsage(), 's1', 5, D1);    u = recordCost(u, 's1', 1, D1);    u = recordCost(u, 's1', 5, D1);    expect(u.days[D1].usd).toBe(5);  });
  it('counts sessions once per day and splits cost across days', () => {
    let u = recordCost(emptyUsage(), 's1', 1, D1);
    u = recordCost(u, 's2', 2, D1);
    u = recordCost(u, 's1', 3, D2);
    expect(u.days[D1]).toEqual({ usd: 3, sessions: 2 });
    expect(u.days[D2]).toEqual({ usd: 2, sessions: 1 });
  });
  it('does not double count after reload (state survives a round trip)', () => {
    const a = recordCost(emptyUsage(), 's1', 4, D1);
    const b = recordCost(parseUsage(JSON.parse(JSON.stringify(a))), 's1', 4, D1);
    expect(b.days[D1]).toEqual({ usd: 4, sessions: 1 });
  });
  it('ignores a falling cost and keeps the highest value as base', () => {
    let u = recordCost(emptyUsage(), 's1', 5, D1);
    u = recordCost(u, 's1', 1, D1);
    u = recordCost(u, 's1', 1.5, D1);
    expect(u.days[D1].usd).toBeCloseTo(5);
  });
  it('ignores invalid values and does not mutate its input', () => {
    const base = emptyUsage();
    for (const c of [NaN, -1, Infinity]) expect(recordCost(base, 's', c, D1)).toEqual(base);
    recordCost(base, 's', 1, D1);
    expect(base).toEqual(emptyUsage());
  });
  it('stores no session id in clear text', () => {
    const u = recordCost(emptyUsage(), 'secret-session-id', 1, D1);
    expect(JSON.stringify(u)).not.toContain('secret-session-id');
  });
});

describe('pruneUsage / lastDays', () => {
  it('keeps 30 days (today included) and drops older days and sessions', () => {
    let u = recordCost(emptyUsage(), 'old', 1, '2026-10-01');
    u = recordCost(u, 'edge', 1, '2026-10-26'); // 30th day back from 2026-11-24
    u = recordCost(u, 'new', 1, '2026-11-24');
    const p = pruneUsage(u, '2026-11-24');
    expect(Object.keys(p.days).sort()).toEqual(['2026-10-26', '2026-11-24']);
    expect(Object.keys(p.sessions)).toHaveLength(2);
  });
  it('lists the last n days oldest first, empty days as zero', () => {
    const u = recordCost(emptyUsage(), 's', 2, '2026-11-23');
    const l = lastDays(u, '2026-11-24', 7);
    expect(l).toHaveLength(7);
    expect(l[0].day).toBe('2026-11-18');
    expect(l[5]).toEqual({ day: '2026-11-23', usd: 2, sessions: 1 });
    expect(l[6]).toEqual({ day: '2026-11-24', usd: 0, sessions: 0 });
  });
});

describe('parseUsage', () => {
  it('returns empty for garbage', () => {
    for (const v of [null, 5, 'x', [], { days: 5 }, { days: { bad: { usd: 1, sessions: 1 } } }, { days: { [D1]: { usd: -1, sessions: 'a' } } }]) {
      expect(parseUsage(v).days).toEqual({});
    }
  });
  it('keeps valid entries and drops invalid ones', () => {
    const u = parseUsage({ days: { [D1]: { usd: 1.5, sessions: 2 }, nope: { usd: 1, sessions: 1 } }, sessions: { abc: { cost: 1, day: D1 }, x: { cost: 'a' } } });
    expect(u.days).toEqual({ [D1]: { usd: 1.5, sessions: 2 } });
    expect(Object.keys(u.sessions)).toEqual(['abc']);
  });
});

describe('UsageStore', () => {
  const dirs: string[] = [];
  const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'kayy-usage-')); dirs.push(d); return d; };
  afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
  const at = (iso: string) => () => new Date(iso).getTime();

  it('starts empty on missing or broken file and never throws', () => {
    const dir = tmp();
    const file = join(dir, 'usage.json');
    expect(new UsageStore(file, at('2026-11-24T12:00:00')).recent()).toHaveLength(7);
    writeFileSync(file, '{ not json');
    const s = new UsageStore(file, at('2026-11-24T12:00:00'));
    expect(s.recent().every((d) => d.usd === 0 && d.sessions === 0)).toBe(true);
    s.record('a', 1);
    s.flush();
    expect(JSON.parse(readFileSync(file, 'utf8')).days['2026-11-24'].usd).toBe(1);
  });
  it('persists atomically and a restart does not double count', () => {
    const dir = tmp();
    const file = join(dir, 'usage.json');
    const now = at('2026-11-24T12:00:00');
    const a = new UsageStore(file, now);
    a.record('s1', 2);
    a.record('s1', 3);
    a.flush();
    const b = new UsageStore(file, now);
    b.record('s1', 3);
    b.record('s1', 3.5);
    b.flush();
    expect(new UsageStore(file, now).recent().at(-1)).toEqual({ day: '2026-11-24', usd: 3.5, sessions: 1 });
    expect(readdirSync(dir)).toEqual(['usage.json']);
  });
  it('survives an unwritable target', () => {
    const dir = tmp();
    const s = new UsageStore(join(dir, 'missing', 'sub', 'usage.json'), at('2026-11-24T12:00:00'));
    s.record('a', 1);
    expect(() => s.flush()).not.toThrow();
  });
});
