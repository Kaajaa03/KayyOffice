import { describe, it, expect } from 'vitest';
import { pillLines, labelFor } from '../src/renderer/pill';
import type { Agent } from '../src/shared/types';

const ag = (o: Partial<Agent>): Agent => ({ id: 'abcdef123', sessionId: 's', cwd: 'C:\\dev\\KayyOffice', status: 'idle', lastEventTs: 0, ...o });

describe('labelFor', () => {
  it('prefers role, then sub-agent, then project folder', () => {
    expect(labelFor(ag({ role: 'Reviewer', parentId: 'p' }))).toBe('Reviewer');
    expect(labelFor(ag({ parentId: 'p' }))).toBe('sub-agent');
    expect(labelFor(ag({}))).toBe('KayyOffice');
  });
});

describe('pillLines', () => {
  it('working shows the file name when known', () => {
    expect(pillLines(ag({ status: 'working', category: 'code', file: 'C:\\dev\\x\\src\\state.ts' })).sub).toBe('state.ts');
  });
  it('working without file shows the tool category', () => {
    expect(pillLines(ag({ status: 'working', category: 'terminal' })).sub).toBe('terminal');
    expect(pillLines(ag({ status: 'working', category: 'browser' })).sub).toBe('browser');
    expect(pillLines(ag({ status: 'working', category: 'code' })).sub).toBe('code');
    expect(pillLines(ag({ status: 'working' })).sub).toBe('thinking');
  });
  it('other states have short texts', () => {
    expect(pillLines(ag({ status: 'waiting' })).sub).toBe('needs you');
    expect(pillLines(ag({ status: 'done' })).sub).toBe('done');
    expect(pillLines(ag({ status: 'idle' })).sub).toBe('idle');
    expect(pillLines(ag({ status: 'error' })).sub).toBe('error');
  });
  it('a waiting agent that asks a real decision says so (Orchestrator signal)', () => {
    expect(pillLines(ag({ status: 'waiting', message: 'Entscheidung: Welche Datenbank?' })).sub).toBe('Entscheidung');
    expect(pillLines(ag({ status: 'waiting', message: 'permission: Bash' })).sub).toBe('needs you');
  });
  it('status dot colors differ per state and title/sub are truncated', () => {
    const dots = new Set((['working', 'waiting', 'done', 'idle', 'error'] as const).map((s) => pillLines(ag({ status: s })).dot));
    expect(dots.size).toBe(5);
    const p = pillLines(ag({ role: 'A very long role name indeed', status: 'working', file: 'a_really_long_file_name_component.ts' }));
    expect(p.title.length).toBeLessThanOrEqual(14);
    expect(p.sub.length).toBeLessThanOrEqual(16);
    expect(p.sub.endsWith('…')).toBe(true);
  });
});
