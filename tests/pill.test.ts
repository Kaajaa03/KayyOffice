import { describe, it, expect } from 'vitest';
import { pillLines, labelFor, askerLabel } from '../src/renderer/pill';
import type { Agent } from '../src/shared/types';

const ag = (o: Partial<Agent>): Agent => ({ id: 'abcdef123', sessionId: 's', cwd: 'C:\\dev\\KayyOffice', status: 'idle', lastEventTs: 0, ...o });

describe('labelFor', () => {
  it('prefers role, then sub-agent, then project folder', () => {
    expect(labelFor(ag({ role: 'Reviewer', parentId: 'p' }), 'de')).toBe('Reviewer');
    expect(labelFor(ag({ parentId: 'p' }), 'en')).toBe('sub-agent');
    expect(labelFor(ag({ parentId: 'p' }), 'de')).toBe('Sub-Agent');
    expect(labelFor(ag({}), 'de')).toBe('Chat');
    expect(labelFor(ag({ parentId: 'p', name: 'Explore' }), 'de')).toBe('Explore');
  });
});

describe('pillLines (german)', () => {
  it('working shows the file name when known', () => {
    expect(pillLines(ag({ status: 'working', category: 'code', file: 'C:\\dev\\x\\src\\state.ts' }), 'de').sub).toBe('state.ts');
  });
  it('working without file shows the tool category', () => {
    expect(pillLines(ag({ status: 'working', category: 'terminal' }), 'de').sub).toBe('Terminal');
    expect(pillLines(ag({ status: 'working', category: 'browser' }), 'de').sub).toBe('Browser');
    expect(pillLines(ag({ status: 'working', category: 'code' }), 'de').sub).toBe('Code');
    expect(pillLines(ag({ status: 'working' }), 'de').sub).toBe('denkt');
  });
  it('other states have short texts', () => {
    expect(pillLines(ag({ status: 'waiting' }), 'de').sub).toBe('braucht dich');
    expect(pillLines(ag({ status: 'done' }), 'de').sub).toBe('fertig');
    expect(pillLines(ag({ status: 'idle' }), 'de').sub).toBe('ruht');
    expect(pillLines(ag({ status: 'error' }), 'de').sub).toBe('Fehler');
  });
  it('a waiting agent that asks a real decision says so (Orchestrator signal)', () => {
    expect(pillLines(ag({ status: 'waiting', message: 'Entscheidung: Welche Datenbank?' }), 'de').sub).toBe('Entscheidung');
    expect(pillLines(ag({ status: 'waiting', message: 'permission: Bash' }), 'de').sub).toBe('braucht dich');
  });
  it('status dot colors differ per state and title/sub are truncated', () => {
    const dots = new Set((['working', 'waiting', 'done', 'idle', 'error'] as const).map((s) => pillLines(ag({ status: s }), 'de').dot));
    expect(dots.size).toBe(5);
    const p = pillLines(ag({ role: 'A very long role name indeed', status: 'working', file: 'a_really_long_file_name_component.ts' }), 'de');
    expect(p.title.length).toBeLessThanOrEqual(14);
    expect(p.sub.length).toBeLessThanOrEqual(16);
    expect(p.sub.endsWith('…')).toBe(true);
  });
});

describe('pillLines (english)', () => {
  it('uses the english table', () => {
    expect(pillLines(ag({ status: 'waiting' }), 'en').sub).toBe('needs you');
    expect(pillLines(ag({ status: 'done' }), 'en').sub).toBe('done');
    expect(pillLines(ag({ status: 'waiting', message: 'Entscheidung: x' }), 'en').sub).toBe('decision');
  });
});

describe('askerLabel (who asks on the permission card)', () => {
  const all = (...a: Agent[]) => a;
  it('role or project plus agent type', () => {
    const a = ag({ id: 'a', role: 'Reviewer', name: 'Explore' });
    expect(askerLabel(a, 'a', all(a), 'de')).toBe('Reviewer · Explore');
    const b = ag({ id: 'b', name: 'Plan' });
    expect(askerLabel(b, 'b', all(b), 'de')).toBe('KayyOffice · Plan');
  });
  it('a sub-agent without a reported type is marked as sub-agent', () => {
    const a = ag({ id: 'a', parentId: 'p' });
    expect(askerLabel(a, 'a', all(a), 'en')).toBe('KayyOffice · sub-agent');
  });
  it('adds a short session id when two agents share the label', () => {
    const a = ag({ id: 'a', sessionId: 'a1b2c3d4e5' });
    const b = ag({ id: 'b', sessionId: 'ffeedd9988' });
    expect(askerLabel(a, 'a', all(a, b), 'de')).toBe('KayyOffice · #a1b2c3');
    expect(askerLabel(b, 'b', all(a, b), 'de')).toBe('KayyOffice · #ffeedd');
  });
  it('falls back to the short agent id when the agent is unknown', () => {
    expect(askerLabel(undefined, 'abcdefghijkl', [], 'de')).toBe('abcdefgh');
  });
});

describe('subagent name pipeline', () => {
  it('SubagentStart agentType survives parseEvent + reduce and shows as the pill title', async () => {
    const { parseEvent } = await import('../src/main/validate');
    const { initialState, reduce } = await import('../src/main/state');
    const e = parseEvent({ ts: 1, sessionId: 's', agentId: 'a1', parentId: 's', event: 'SubagentStart', cwd: 'C:\p', agentType: 'Explore' })!;
    const a = reduce(initialState(), e).agents.a1;
    expect(labelFor(a, 'de')).toBe('Explore');
  });
});
