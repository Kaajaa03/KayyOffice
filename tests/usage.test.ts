import { describe, it, expect } from 'vitest';
import { parseEvent } from '../src/main/validate';
import { initialState, nextDueMs, pruneStale, reduce, tick } from '../src/main/state';
import { EventLog } from '../src/main/log';
import { SourceGate } from '../src/main/source';
import type { AgentEvent } from '../src/shared/types';

const base: AgentEvent = { ts: 1, sessionId: 's', agentId: 's', event: 'PostToolUse', cwd: 'C:\dev\Proj', tool: 'Bash' };
const roster = (r: unknown): AgentEvent => parseEvent({ ...base, event: 'Roster', roster: r })!;

describe('context / limit in parseEvent', () => {
  it('keeps valid values', () => {
    const e = parseEvent({ ...base, context: { percent: 34, tokens: 68000, window: 200000 }, limit: { kind: 'five_hour', percent: 21.4 } })!;
    expect(e.context).toEqual({ percent: 34, tokens: 68000, window: 200000 });
    expect(e.limit).toEqual({ kind: 'five_hour', percent: 21 });
  });
  it('drops malformed context fields without dropping the event', () => {
    for (const context of [{ percent: 101 }, { percent: -1 }, { percent: 1.5 }, { percent: '5' }, 'x', null, {}]) {
      const e = parseEvent({ ...base, context });
      expect(e).not.toBeNull();
      expect(e!.context).toBeUndefined();
    }
  });
  it('drops bad tokens/window but keeps the percent', () => {
    const e = parseEvent({ ...base, context: { percent: 10, tokens: -5, window: 1e9 } })!;
    expect(e.context).toEqual({ percent: 10 });
    expect(parseEvent({ ...base, context: { percent: 10, tokens: 1.5, window: 10_000_000 } })!.context).toEqual({ percent: 10, window: 10_000_000 });
  });
  it('validates limit kind and percent', () => {
    for (const limit of [{ kind: 'x'.repeat(21), percent: 1 }, { kind: 'Five', percent: 1 }, { kind: '', percent: 1 }, { kind: 'a b', percent: 1 },
      { kind: 'seven_day', percent: 1000 }, { kind: 'seven_day', percent: -1 }, { kind: 'seven_day', percent: NaN }, { kind: 'seven_day', percent: '5' }, 3]) {
      const e = parseEvent({ ...base, limit });
      expect(e).not.toBeNull();
      expect(e!.limit).toBeUndefined();
    }
    expect(parseEvent({ ...base, limit: { kind: '7d-x_1', percent: 999 } })!.limit).toEqual({ kind: '7d-x_1', percent: 999 });
  });
});

describe('roster in parseEvent', () => {
  it('accepts a Roster event and cleans entries', () => {
    const e = roster([{ type: 'kayy-scout', model: 'haiku' }, { type: ' kayy\u0000-coder\n' }, { type: '' }, { type: 5 }, 'x', { type: 'ok', model: 7 }]);
    expect(e.roster).toEqual([{ type: 'kayy-scout', model: 'haiku' }, { type: 'kayy-coder' }, { type: 'ok' }]);
  });
  it('caps at 12 entries and 40 chars', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ type: `t${i}` }));
    expect(roster(many).roster).toHaveLength(12);
    const e = roster([{ type: 'a'.repeat(60), model: 'm'.repeat(60) }]);
    expect(e.roster![0].type).toHaveLength(40);
    expect(e.roster![0].model).toHaveLength(40);
  });
  it('ignores a non-array roster but keeps the event', () => {
    const e = parseEvent({ ...base, event: 'Roster', roster: 'nope' });
    expect(e).not.toBeNull();
    expect(e!.roster).toBeUndefined();
  });
});

describe('context / limit in the reducer', () => {
  it('is sticky and replaced by a newer value', () => {
    let s = reduce(initialState(), { ...base, context: { percent: 10 }, limit: { kind: 'five_hour', percent: 5 } });
    s = reduce(s, { ...base, ts: 2 });
    expect(s.agents.s.context).toEqual({ percent: 10 });
    expect(s.agents.s.limit).toEqual({ kind: 'five_hour', percent: 5 });
    s = reduce(s, { ...base, ts: 3, context: { percent: 40 }, limit: { kind: 'five_hour', percent: 9 } });
    expect(s.agents.s.context?.percent).toBe(40);
    expect(s.agents.s.limit?.percent).toBe(9);
    s = reduce(s, { ...base, ts: 4, event: 'Stop' });
    expect(s.agents.s.context?.percent).toBe(40);
  });
});

describe('Roster event in the reducer', () => {
  const list = [{ type: 'kayy-scout', model: 'haiku' }];
  it('stores the latest list and never creates or changes an agent', () => {
    let s = reduce(initialState(), { ...base, event: 'Roster', roster: list });
    expect(s.agents).toEqual({});
    expect(s.roster).toEqual(list);
    s = reduce(s, { ...base, event: 'PreToolUse' });
    const before = s.agents;
    s = reduce(s, { ...base, ts: 9, event: 'Roster', roster: [{ type: 'x' }] });
    expect(s.agents).toBe(before);
    expect(s.roster).toEqual([{ type: 'x' }]);
  });
  it('keeps the roster across SessionEnd, tick and pruneStale', () => {
    let s = reduce(initialState(), { ...base, event: 'Roster', roster: list });
    s = reduce(s, { ...base, event: 'Stop', ts: 1000 });
    expect(tick(s, 1000 + 20_000).roster).toEqual(list);
    expect(pruneStale(s, 1000 + 10 * 60 * 60 * 1000).roster).toEqual(list);
    s = reduce(s, { ...base, event: 'SessionEnd' });
    expect(s.agents).toEqual({});
    expect(s.roster).toEqual(list);
  });
  it('a Roster event without a list leaves the state alone and schedules nothing', () => {
    const s0 = initialState();
    expect(reduce(s0, { ...base, event: 'Roster' })).toBe(s0);
    expect(nextDueMs(reduce(s0, { ...base, event: 'Roster', roster: list }), 0)).toBeNull();
  });
});

describe('Roster in log and gate', () => {
  it('EventLog does not count or persist a Roster event', () => {
    const log = new EventLog(null);
    log.append({ ...base, event: 'Roster', roster: [{ type: 'a' }] });
    expect(Object.keys(log.day('1970-01-01').perAgent)).toEqual([]);
  });
  it('SourceGate treats Roster like any event', () => {
    const g = new SourceGate(() => 0);
    expect(g.acceptEvent({ ...base, event: 'Roster', source: 'mod' })).toBe(true);
    expect(g.acceptEvent({ ...base, event: 'Roster', source: 'hook' })).toBe(false);
  });
});
