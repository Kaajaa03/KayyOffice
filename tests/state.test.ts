import { describe, it, expect } from 'vitest';
import { initialState, reduce, tick, pruneStale, nextDueMs, DONE_TO_IDLE_MS, SUBAGENT_LINGER_MS, STALE_MS } from '../src/main/state';
import type { AgentEvent, AppState } from '../src/shared/types';

const ev = (o: Partial<AgentEvent>): AgentEvent => ({
  ts: 1000, sessionId: 's1', agentId: 's1', event: 'PreToolUse', cwd: 'C:\\p\\proj', ...o,
});

function deepFreeze<T>(o: T): T {
  Object.values(o as object).forEach((v) => typeof v === 'object' && v && deepFreeze(v));
  return Object.freeze(o);
}

describe('reduce', () => {
  it('PreToolUse Bash -> working/terminal', () => {
    const s = reduce(initialState(), ev({ tool: 'Bash' }));
    expect(s.agents.s1.status).toBe('working');
    expect(s.agents.s1.category).toBe('terminal');
  });
  it('Notification -> waiting with message', () => {
    const s = reduce(initialState(), ev({ event: 'Notification', message: 'needs permission' }));
    expect(s.agents.s1.status).toBe('waiting');
    expect(s.agents.s1.message).toBe('needs permission');
  });
  it('Stop -> done, tick after DONE_TO_IDLE_MS -> idle', () => {
    let s = reduce(initialState(), ev({ event: 'Stop', ts: 1000 }));
    expect(s.agents.s1.status).toBe('done');
    expect(tick(s, 1000 + DONE_TO_IDLE_MS - 1).agents.s1.status).toBe('done');
    s = tick(s, 1000 + DONE_TO_IDLE_MS);
    expect(s.agents.s1.status).toBe('idle');
  });
  it('SubagentStart creates child; SessionEnd removes parent and children', () => {
    let s = reduce(initialState(), ev({ event: 'SessionStart' }));
    s = reduce(s, ev({ event: 'SubagentStart', agentId: 'a2', parentId: 's1' }));
    expect(s.agents.a2.parentId).toBe('s1');
    s = reduce(s, ev({ event: 'SessionEnd' }));
    expect(Object.keys(s.agents)).toEqual([]);
  });
  it('late PostToolUse for unknown session creates exactly one agent; pruneStale removes it', () => {
    const s = reduce(initialState(), ev({ event: 'PostToolUse', sessionId: 'x', agentId: 'x', ts: 1000 }));
    expect(Object.keys(s.agents)).toEqual(['x']);
    expect(Object.keys(pruneStale(s, 1000 + 60_000, 30_000).agents)).toEqual([]);
  });
  it('pruneStale keeps a waiting agent much longer than others', () => {
    let s = reduce(initialState(), ev({ sessionId: 'w', agentId: 'w', event: 'Notification', ts: 0 }));
    s = reduce(s, ev({ sessionId: 'k', agentId: 'k', event: 'PreToolUse', ts: 0 }));
    const MIN = 60_000;
    const after20 = pruneStale(s, 20 * MIN, 15 * MIN);
    expect(Object.keys(after20.agents)).toEqual(['w']);
    expect(Object.keys(pruneStale(s, 3 * 60 * MIN, 15 * MIN).agents)).toEqual([]);
  });
  it('SubagentStop without start does not throw or change state', () => {
    const s0 = initialState();
    const s = reduce(s0, ev({ event: 'SubagentStop', agentId: 'nope', parentId: 's1' }));
    expect(s).toEqual(s0);
  });
  it('keeps the agent name from agentType across later events', () => {
    let s = reduce(initialState(), ev({ event: 'SubagentStart', agentId: 'a2', parentId: 's1', agentType: 'Explore' }));
    s = reduce(s, ev({ agentId: 'a2', parentId: 's1', tool: 'Read' }));
    expect(s.agents.a2.name).toBe('Explore');
  });
  it('tracks current file, sticky model and cost; clears file on Stop', () => {
    let s = reduce(initialState(), ev({ tool: 'Edit', file: 'C:\\p\\a.ts', model: 'sonnet' }));
    expect(s.agents.s1).toMatchObject({ file: 'C:\\p\\a.ts', model: 'sonnet' });
    s = reduce(s, ev({ event: 'PostToolUse', tool: 'Edit' }));
    expect(s.agents.s1.file).toBe('C:\\p\\a.ts'); // stays until the next tool or Stop
    s = reduce(s, ev({ event: 'PreToolUse', tool: 'Bash' }));
    expect(s.agents.s1.file).toBeUndefined();
    expect(s.agents.s1.model).toBe('sonnet');
    s = reduce(s, ev({ event: 'Stop', costUsd: 0.42 }));
    expect(s.agents.s1).toMatchObject({ costUsd: 0.42, model: 'sonnet' });
    expect(s.agents.s1.file).toBeUndefined();
  });
  it('two sessions in same cwd -> two agents', () => {
    let s = reduce(initialState(), ev({ sessionId: 'a', agentId: 'a' }));
    s = reduce(s, ev({ sessionId: 'b', agentId: 'b' }));
    expect(Object.keys(s.agents).sort()).toEqual(['a', 'b']);
  });
  it('does not mutate input state', () => {
    const s0: AppState = deepFreeze(reduce(initialState(), ev({})));
    expect(() => reduce(s0, ev({ event: 'Stop' }))).not.toThrow();
  });
});

describe('finished subagents free their desk', () => {
  const withSub = () => {
    let s = reduce(initialState(), ev({ event: 'SessionStart', ts: 0 }));
    s = reduce(s, ev({ event: 'SubagentStart', agentId: 'a2', parentId: 's1', ts: 0 }));
    return reduce(s, ev({ event: 'SubagentStop', agentId: 'a2', parentId: 's1', ts: 1000 }));
  };
  it('removes a done subagent SUBAGENT_LINGER_MS after its last event, not before', () => {
    const s = withSub();
    expect(s.agents.a2.status).toBe('done');
    const early = tick(s, 1000 + SUBAGENT_LINGER_MS - 1);
    expect(early.agents.a2.status).toBe('done'); // stays done, does not fade to idle first
    expect(Object.keys(tick(s, 1000 + SUBAGENT_LINGER_MS).agents)).toEqual(['s1']);
  });
  it('keeps working/waiting subagents and a done main session', () => {
    let s = reduce(initialState(), ev({ event: 'SubagentStart', agentId: 'a2', parentId: 's1', ts: 0 }));
    s = reduce(s, ev({ event: 'Stop', ts: 0 }));
    const out = tick(s, 3_600_000);
    expect(out.agents.a2.status).toBe('working');
    expect(out.agents.s1.status).toBe('idle');
  });
});

describe('nextDueMs', () => {
  it('is null when there are no agents (no timer at all)', () => {
    expect(nextDueMs(initialState(), 5000)).toBeNull();
  });
  it('returns the delay until the earliest of idle fade, subagent removal and prune', () => {
    const working = reduce(initialState(), ev({ ts: 0 }));
    expect(nextDueMs(working, 1000)).toBe(STALE_MS - 1000);
    const done = reduce(working, ev({ event: 'Stop', ts: 2000 }));
    expect(nextDueMs(done, 3000)).toBe(DONE_TO_IDLE_MS - 1000);
    const sub = reduce(done, ev({ event: 'SubagentStart', agentId: 'a2', parentId: 's1', ts: 4000 }));
    const subDone = reduce(sub, ev({ event: 'SubagentStop', agentId: 'a2', parentId: 's1', ts: 4000 }));
    expect(nextDueMs(subDone, 5000)).toBe(2000 + DONE_TO_IDLE_MS - 5000); // main fade still first
    const only = reduce(initialState(), ev({ event: 'SubagentStart', agentId: 'a2', parentId: 's1', ts: 0 }));
    expect(nextDueMs(reduce(only, ev({ event: 'SubagentStop', agentId: 'a2', parentId: 's1', ts: 0 })), 1000)).toBe(SUBAGENT_LINGER_MS - 1000);
  });
  it('uses the 8x longer prune window for a waiting agent and never returns a negative delay', () => {
    const w = reduce(initialState(), ev({ event: 'Notification', ts: 0 }));
    expect(nextDueMs(w, 1000)).toBe(STALE_MS * 8 - 1000);
    expect(nextDueMs(w, STALE_MS * 9)).toBe(0);
  });
  it('is exact: the state is unchanged just before the delay and changes at it', () => {
    const s = reduce(reduce(initialState(), ev({ ts: 0 })), ev({ event: 'Stop', ts: 100 }));
    const d = nextDueMs(s, 200)!;
    expect(tick(s, 200 + d - 1)).toBe(s);
    expect(tick(s, 200 + d)).not.toBe(s);
  });
});
