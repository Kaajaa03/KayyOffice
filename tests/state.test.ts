import { describe, it, expect } from 'vitest';
import { initialState, reduce, tick, pruneStale, DONE_TO_IDLE_MS } from '../src/main/state';
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
