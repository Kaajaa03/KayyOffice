import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseEvent } from '../src/main/validate';
import { initialState, reduce } from '../src/main/state';
import { EventLog, renderDevLog, localDate } from '../src/main/log';
import { startServer } from '../src/main/server';
import { loadConfig, updateConfig } from '../src/main/config';
import { pillLines } from '../src/renderer/pill';
import type { Agent, AgentEvent } from '../src/shared/types';

const base: AgentEvent = { ts: 1, sessionId: 's', agentId: 's', event: 'PostToolUse', cwd: 'C:\\dev\\Proj', tool: 'TodoWrite' };

describe('progress in parseEvent', () => {
  it('keeps a valid progress and sanitizes current', () => {
    const e = parseEvent({ ...base, progress: { done: 2, total: 5, current: 'Schreibe\u0000 Tests\n' } })!;
    expect(e.progress).toEqual({ done: 2, total: 5, current: 'Schreibe Tests' });
  });
  it('truncates current to 80 characters and drops an empty one', () => {
    expect(parseEvent({ ...base, progress: { done: 0, total: 1, current: 'x'.repeat(200) } })!.progress!.current).toHaveLength(80);
    expect(parseEvent({ ...base, progress: { done: 0, total: 1, current: '  \n ' } })!.progress).toEqual({ done: 0, total: 1 });
  });
  it.each([
    ['done > total', { done: 3, total: 2 }],
    ['total 0', { done: 0, total: 0 }],
    ['total 100', { done: 0, total: 100 }],
    ['negative', { done: -1, total: 2 }],
    ['fraction', { done: 1.5, total: 2 }],
    ['strings', { done: '1', total: '2' }],
    ['not an object', 'x'],
  ])('ignores an invalid progress (%s) but keeps the event', (_n, progress) => {
    const e = parseEvent({ ...base, progress });
    expect(e).not.toBeNull();
    expect(e!.progress).toBeUndefined();
  });
});

describe('progress in the reducer', () => {
  it('is sticky across events, replaced by a new list and cleared on Stop', () => {
    let s = reduce(initialState(), { ...base, progress: { done: 1, total: 4, current: 'A' } });
    expect(s.agents.s.progress).toEqual({ done: 1, total: 4, current: 'A' });
    s = reduce(s, { ...base, event: 'PreToolUse', tool: 'Bash' });
    expect(s.agents.s.progress).toEqual({ done: 1, total: 4, current: 'A' });
    s = reduce(s, { ...base, progress: { done: 2, total: 4, current: 'B' } });
    expect(s.agents.s.progress?.done).toBe(2);
    s = reduce(s, { ...base, event: 'Stop' });
    expect(s.agents.s.progress).toBeUndefined();
  });
  it('a new session start clears it', () => {
    let s = reduce(initialState(), { ...base, progress: { done: 1, total: 2 } });
    s = reduce(s, { ...base, event: 'SessionStart' });
    expect(s.agents.s.progress).toBeUndefined();
  });
});

describe('progress in the log', () => {
  const T0 = new Date(2026, 9, 30, 10, 0, 0).getTime();
  const DATE = localDate(T0);
  const ev = (o: Partial<AgentEvent>): AgentEvent => ({ ...base, ts: T0, ...o });

  it('counts completed tasks as the maximum seen per agent and day, and lists them in the dev-log', () => {
    const log = new EventLog(null);
    log.append(ev({ progress: { done: 1, total: 5 } }));
    log.append(ev({ ts: T0 + 1, progress: { done: 3, total: 5 } }));
    log.append(ev({ ts: T0 + 2, progress: { done: 2, total: 4 } })); // a new, shorter list does not lower the day's maximum
    expect(log.day(DATE).perAgent.s.tasksDone).toBe(3);
    expect(renderDevLog(log.day(DATE), 'de')).toContain('Aufgaben erledigt: 3');
    expect(renderDevLog(log.day(DATE), 'en')).toContain('Tasks done: 3');
  });
  it('persists only the numbers, never the task text (it describes the work and may contain names)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kayy-prog-'));
    const log = new EventLog(dir);
    log.append(ev({ progress: { done: 1, total: 2, current: 'Fix secret-project login' } }));
    log.flush();
    const raw = readFileSync(join(dir, `${DATE}.jsonl`), 'utf8');
    expect(raw).not.toContain('secret-project');
    expect(raw).not.toContain('current');
    expect(new EventLog(dir).day(DATE).perAgent.s.tasksDone).toBe(1); // survives a restart
  });
  it('the english dev-log is fully translated', () => {
    const log = new EventLog(null);
    log.append(ev({ event: 'PreToolUse', tool: 'Edit', file: 'C:\\dev\\a.ts' }));
    const md = renderDevLog(log.day(DATE), 'en');
    expect(md).toContain('tool calls');
    expect(md).toContain('Files: a.ts');
    expect(renderDevLog({ date: DATE, perAgent: {} }, 'en')).toContain('No agent activity');
    expect(renderDevLog({ date: DATE, perAgent: {} }, 'de')).toContain('Keine Agent-Aktivität');
  });
});

describe('progress in the name pill', () => {
  const ag = (o: Partial<Agent>): Agent => ({ id: 'a', sessionId: 's', cwd: 'C:\\dev\\Proj', status: 'working', category: 'code', lastEventTs: 0, ...o });

  it('shows the current task instead of the file and exposes the ratio for the bar', () => {
    const p = pillLines(ag({ file: 'C:\\x\\state.ts', progress: { done: 2, total: 5, current: 'Tests schreiben' } }), 'de');
    expect(p.sub).toBe('Tests schreiben');
    expect(p.progress).toBeCloseTo(0.4);
  });
  it('without current falls back to the file; without progress there is no ratio', () => {
    expect(pillLines(ag({ file: 'C:\\x\\state.ts', progress: { done: 1, total: 2 } }), 'de').sub).toBe('state.ts');
    expect(pillLines(ag({}), 'de').progress).toBeUndefined();
  });
  it('waiting/done keep their status text but still show the bar', () => {
    const p = pillLines(ag({ status: 'waiting', progress: { done: 1, total: 4, current: 'X' } }), 'de');
    expect(p.sub).toBe('braucht dich');
    expect(p.progress).toBeCloseTo(0.25);
  });
  it('a long current is truncated to the pill width budget', () => {
    expect(pillLines(ag({ progress: { done: 0, total: 3, current: 'Eine wirklich sehr lange Aufgabenbeschreibung' } }), 'de').sub.length).toBeLessThanOrEqual(16);
  });
});

describe('hook.js maps TodoWrite to progress', () => {
  const HOOK = resolve(__dirname, '../hook/hook.js');
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => { while (closers.length) await closers.pop()!(); });

  function run(dir: string, input: unknown): Promise<void> {
    return new Promise((res) => {
      const p = spawn('node', [HOOK], { env: { ...process.env, KAYY_CONFIG_DIR: dir } });
      p.on('close', () => res());
      p.stdin.end(JSON.stringify(input));
    });
  }

  it('sends done/total/current for a PostToolUse of TodoWrite and nothing for other tools', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kayy-hook-'));
    const cfg = loadConfig(dir);
    const got: AgentEvent[] = [];
    const s = await startServer({ token: cfg.token, port: 48210, onEvent: (e) => got.push(e) });
    closers.push(s.close);
    updateConfig(dir, { port: s.port });
    const todos = [
      { content: 'Plan', status: 'completed', activeForm: 'Planning' },
      { content: 'Build', status: 'in_progress', activeForm: 'Building it' },
      { content: 'Ship', status: 'pending', activeForm: 'Shipping' },
    ];
    await run(dir, { hook_event_name: 'PostToolUse', session_id: 's1', tool_name: 'TodoWrite', cwd: 'C:\\p', tool_input: { todos } });
    await run(dir, { hook_event_name: 'PostToolUse', session_id: 's1', tool_name: 'Bash', cwd: 'C:\\p', tool_input: { todos } });
    await run(dir, { hook_event_name: 'PostToolUse', session_id: 's1', tool_name: 'TodoWrite', cwd: 'C:\\p', tool_input: { todos: 'broken' } });
    expect(got).toHaveLength(3);
    expect(got[0].progress).toEqual({ done: 1, total: 3, current: 'Building it' });
    expect(got[1].progress).toBeUndefined();
    expect(got[2].progress).toBeUndefined();
  });
});
