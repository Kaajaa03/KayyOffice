import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventLog, renderDevLog, weekSummary, writeDevLog, writeWeekLog, localDate } from '../src/main/log';
import type { AgentEvent } from '../src/shared/types';

const T0 = new Date(2026, 9, 29, 10, 0, 0).getTime(); // local 2026-10-29 10:00
const DATE = '2026-10-29';
const ev = (o: Partial<AgentEvent>): AgentEvent => ({ ts: T0, sessionId: 's', agentId: 'coder', event: 'PreToolUse', cwd: 'C:\\dev\\KayyOffice', tool: 'Bash', ...o });

describe('EventLog', () => {
  it('counts tool calls', () => {
    const log = new EventLog(null);
    [0, 1, 2].forEach((i) => log.append(ev({ ts: T0 + i * 10 })));
    expect(log.day(DATE).perAgent.coder.toolCalls).toBe(3);
  });
  it('sums activeMs between PreToolUse and PostToolUse', () => {
    const log = new EventLog(null);
    log.append(ev({ ts: T0 }));
    log.append(ev({ ts: T0 + 4000, event: 'PostToolUse' }));
    log.append(ev({ ts: T0 + 10_000 }));
    log.append(ev({ ts: T0 + 11_000, event: 'PostToolUse' }));
    expect(log.day(DATE).perAgent.coder.activeMs).toBe(5000);
  });
  it('records projects once per agent', () => {
    const log = new EventLog(null);
    log.append(ev({}));
    log.append(ev({ ts: T0 + 1 }));
    expect(log.day(DATE).perAgent.coder.projects).toEqual(['KayyOffice']);
  });
  it('ignores a PostToolUse without a matching PreToolUse', () => {
    const log = new EventLog(null);
    log.append(ev({ event: 'PostToolUse' }));
    expect(log.day(DATE).perAgent.coder.activeMs).toBe(0);
  });
  it('persists to JSONL and a fresh instance reads it back', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kayy-log-'));
    const a = new EventLog(dir);
    a.append(ev({}));
    a.append(ev({ ts: T0 + 2000, event: 'PostToolUse' }));
    a.flush();
    expect(existsSync(join(dir, `${DATE}.jsonl`))).toBe(true);
    const b = new EventLog(dir);
    expect(b.day(DATE).perAgent.coder).toMatchObject({ toolCalls: 1, activeMs: 2000 });
  });
  it('returns an empty summary for a day without data', () => {
    expect(new EventLog(null).day('2020-01-01')).toEqual({ date: '2020-01-01', perAgent: {} });
  });
});

describe('renderDevLog / weekSummary / writeDevLog', () => {
  const log = new EventLog(null);
  log.append(ev({}));
  log.append(ev({ ts: T0 + 60_000, event: 'PostToolUse' }));

  it('renders markdown with project and agent', () => {
    const md = renderDevLog(log.day(DATE));
    expect(md).toContain(`# Dev-Log ${DATE}`);
    expect(md).toContain('## KayyOffice');
    expect(md).toContain('**coder**');
    expect(md).toContain('1 Tool-Calls');
  });
  it('weekSummary returns 7 days ending at endDate, missing days empty', () => {
    const w = weekSummary(DATE, log);
    expect(w).toHaveLength(7);
    expect(w[6].date).toBe(DATE);
    expect(w[0].date).toBe('2026-10-23');
    expect(w[0].perAgent).toEqual({});
  });
  it('writeDevLog uses a prefixed name so it cannot overwrite a user note like <date>.md', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'kayy-dev-')), 'nested');
    const file = writeDevLog(dir, log.day(DATE));
    expect(readFileSync(file, 'utf8')).toContain('Dev-Log');
    expect(file.endsWith(`kayy-devlog-${DATE}.md`)).toBe(true);
  });
  it('writeWeekLog writes kayy-week-<date>.md with 7 day sections', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kayy-week-'));
    const file = writeWeekLog(dir, DATE, log);
    expect(file.endsWith(`kayy-week-${DATE}.md`)).toBe(true);
    expect(readFileSync(file, 'utf8').match(/^# Dev-Log /gm)).toHaveLength(7);
  });
  it('localDate formats local dates as YYYY-MM-DD', () => expect(localDate(T0)).toBe(DATE));
});
