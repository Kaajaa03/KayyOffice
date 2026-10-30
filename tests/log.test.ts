import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventLog, renderDevLog, weekSummary, writeDevLog, writeWeekLog, localDate, selectExpired, pruneLogs } from '../src/main/log';
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
  it('collects the last 5 distinct edited files per agent (code tools only) and lists them in the dev-log', () => {
    const log = new EventLog(null);
    ['a', 'b', 'c', 'd', 'e', 'f', 'a'].forEach((f, i) => log.append(ev({ ts: T0 + i, tool: 'Edit', file: `C:\\p\\${f}.ts` })));
    log.append(ev({ ts: T0 + 20, tool: 'Read', file: 'C:\\p\\readonly.ts' }));
    const files = log.day(DATE).perAgent.coder.files;
    expect(files).toEqual(['c.ts', 'd.ts', 'e.ts', 'f.ts', 'a.ts']);
    expect(renderDevLog(log.day(DATE))).toContain('Dateien: c.ts, d.ts, e.ts, f.ts, a.ts');
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
  it('does not persist message text (may contain secrets) in the JSONL', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kayy-log-'));
    const l = new EventLog(dir);
    l.append(ev({ event: 'PostToolUse', message: 'ERROR: Authorization: Bearer abc123' }));
    l.flush();
    const raw = readFileSync(join(dir, `${DATE}.jsonl`), 'utf8');
    expect(raw).not.toContain('abc123');
    expect(raw).not.toContain('message');
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

describe('log retention', () => {
  const names = ['2026-09-29.jsonl', '2026-09-30.jsonl', '2026-10-15.jsonl', '2026-10-29.jsonl', 'notes.txt', '2026-09-01.md', 'x2026-01-01.jsonl'];
  it('selects only day files older than keepDays (exactly keepDays old is kept)', () => {
    expect(selectExpired(names, '2026-10-29', 30)).toEqual([]);
    expect(selectExpired(names, '2026-10-30', 30)).toEqual(['2026-09-29.jsonl']);
    expect(selectExpired(names, '2026-10-31', 30)).toEqual(['2026-09-29.jsonl', '2026-09-30.jsonl']);
    expect(selectExpired(names, '2026-12-31', 30)).toEqual(['2026-09-29.jsonl', '2026-09-30.jsonl', '2026-10-15.jsonl', '2026-10-29.jsonl']);
  });
  it('counts days correctly across a DST change', () => {
    expect(selectExpired(['2026-03-01.jsonl'], '2026-03-31', 30)).toEqual([]);
    expect(selectExpired(['2026-03-01.jsonl'], '2026-04-01', 30)).toEqual(['2026-03-01.jsonl']);
  });
  it('pruneLogs deletes expired files from disk, keeps the rest, and tolerates a missing dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kayy-prune-'));
    for (const n of names) writeFileSync(join(dir, n), '{}');
    expect(pruneLogs(dir, '2026-10-30', 30)).toEqual(['2026-09-29.jsonl']);
    expect(readdirSync(dir).sort()).toEqual(names.filter((n) => n !== '2026-09-29.jsonl').sort());
    expect(pruneLogs(join(dir, 'nope'), '2026-10-29', 30)).toEqual([]);
  });
});
