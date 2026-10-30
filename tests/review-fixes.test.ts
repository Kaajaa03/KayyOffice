import { describe, it, expect } from 'vitest';
import { lstatSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InteractiveSync } from '../src/renderer/interactive';
import { writeFileAtomic } from '../src/main/fsutil';
import { initialState, nextDueMs, pruneStale, reduce, tick } from '../src/main/state';
import { parseEvent } from '../src/main/validate';
import { installHooks } from '../src/main/installer';
import type { Agent, AgentEvent } from '../src/shared/types';

describe('InteractiveSync (renderer/main click-through agreement)', () => {
  it('reports a change only when the wanted state differs', () => {
    const s = new InteractiveSync();
    expect(s.want(false)).toBe(false);
    expect(s.want(true)).toBe(true);
    expect(s.want(true)).toBe(false);
    expect(s.want(false)).toBe(true);
  });
  it('after reset() the next want(true) is sent again (main reset click-through while hidden)', () => {
    const s = new InteractiveSync();
    s.want(true);
    s.reset();
    expect(s.want(true)).toBe(true);
  });
});

describe('writeFileAtomic keeps symlinks intact', () => {
  it('writes through a symlink instead of replacing the link', (ctx) => {
    const dir = mkdtempSync(join(tmpdir(), 'kayy-fs-'));
    const target = join(dir, 'real.json');
    const link = join(dir, 'link.json');
    writeFileSync(target, 'old');
    try { symlinkSync(target, link, 'file'); } catch { return ctx.skip(); } // creating symlinks needs a privilege on Windows
    writeFileAtomic(link, 'new');
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readFileSync(target, 'utf8')).toBe('new');
  });
  it('still works for a path that does not exist yet', () => {
    const p = join(mkdtempSync(join(tmpdir(), 'kayy-fs-')), 'fresh.json');
    writeFileAtomic(p, 'x');
    expect(readFileSync(p, 'utf8')).toBe('x');
  });
});

describe('housekeeping can never spin', () => {
  const ag = (id: string, status: Agent['status'], lastEventTs: number, parentId?: string): Agent =>
    ({ id, sessionId: id, cwd: 'x', status, lastEventTs, parentId });

  it('after the due moment, tick+pruneStale either removed work or nextDueMs is > 0 (all statuses)', () => {
    const agents = [ag('a', 'idle', 0), ag('b', 'working', 0), ag('c', 'waiting', 0), ag('d', 'done', 0), ag('e', 'error', 0), ag('f', 'done', 0, 'd')];
    let state = { agents: Object.fromEntries(agents.map((a) => [a.id, a])) };
    let now = 0;
    for (let i = 0; i < 20; i++) {
      const wait = nextDueMs(state, now);
      if (wait === null) break;
      now += wait;
      state = pruneStale(tick(state, now), now);
      const again = nextDueMs(state, now);
      expect(again === null || again > 0).toBe(true);
    }
    expect(Object.keys(state.agents)).toEqual([]); // everything eventually leaves
  });
});

describe('task progress can be cleared explicitly', () => {
  const base: AgentEvent = { ts: 1, sessionId: 's', agentId: 's', event: 'PostToolUse', cwd: 'C:\\p', tool: 'TodoWrite' };

  it('parseEvent keeps progress: null as a clear signal', () => {
    expect(parseEvent({ ...base, progress: null })!.progress).toBeNull();
  });
  it('the reducer clears the stored progress on null but keeps it when the field is absent', () => {
    let s = reduce(initialState(), { ...base, progress: { done: 1, total: 3, current: 'A' } });
    s = reduce(s, { ...base, event: 'PreToolUse' });
    expect(s.agents.s.progress?.done).toBe(1);
    s = reduce(s, { ...base, progress: null });
    expect(s.agents.s.progress).toBeUndefined();
  });
});

describe('settings parse errors never echo file content', () => {
  it('does not leak a snippet of an invalid settings.json into the error message', () => {
    const p = join(mkdtempSync(join(tmpdir(), 'kayy-set-')), 'settings.json');
    writeFileSync(p, 'sk-ant-api03-VERYSECRETVALUE');
    let message = '';
    try { installHooks(p, 'C:\\h\\hook.js'); } catch (e) { message = (e as Error).message; }
    expect(message).toMatch(/settings\.json/);
    expect(message).not.toContain('sk-ant');
    expect(message).not.toContain('SECRET');
  });
});
