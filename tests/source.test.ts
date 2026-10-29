import { describe, it, expect } from 'vitest';
import { SourceGate } from '../src/main/source';
import type { AgentEvent } from '../src/shared/types';

const ev = (sessionId: string, source?: 'mod' | 'hook'): AgentEvent => ({
  ts: 1, sessionId, agentId: sessionId, event: 'PreToolUse', cwd: 'x', ...(source ? { source } : {}),
});

describe('SourceGate', () => {
  it('lets hook events through until the mod reports for that session', () => {
    const g = new SourceGate();
    expect(g.acceptEvent(ev('a'))).toBe(true);
    expect(g.acceptEvent(ev('a', 'mod'))).toBe(true);
    expect(g.acceptEvent(ev('a'))).toBe(false);
    expect(g.acceptEvent(ev('b'))).toBe(true); // other session unaffected
  });
  it('mod events are always accepted', () => {
    const g = new SourceGate();
    expect(g.acceptEvent(ev('a', 'mod'))).toBe(true);
    expect(g.acceptEvent(ev('a', 'mod'))).toBe(true);
  });
  it('ignores hook permission requests of mod sessions, never mod ones', () => {
    const g = new SourceGate();
    g.acceptEvent(ev('a', 'mod'));
    expect(g.acceptPermission({ sessionId: 'a' })).toBe(false);
    expect(g.acceptPermission({ sessionId: 'a', source: 'mod' })).toBe(true);
    expect(g.acceptPermission({ sessionId: 'z' })).toBe(true);
  });
  it('a mod permission request also marks the session as mod-driven (events may be dropped)', () => {
    const g = new SourceGate();
    expect(g.acceptPermission({ sessionId: 'a', source: 'mod' })).toBe(true);
    expect(g.acceptPermission({ sessionId: 'a' })).toBe(false);
    expect(g.acceptEvent(ev('a'))).toBe(false);
  });
  it('falls back to hooks when the mod has been silent for 5 minutes', () => {
    let now = 0;
    const g = new SourceGate(() => now);
    g.acceptEvent(ev('a', 'mod'));
    now = 4 * 60_000;
    expect(g.acceptEvent(ev('a'))).toBe(false);
    now = 5 * 60_000 + 1;
    expect(g.acceptEvent(ev('a'))).toBe(true);
    expect(g.acceptPermission({ sessionId: 'a' })).toBe(true);
  });
});
