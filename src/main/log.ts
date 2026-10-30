import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appLog } from './diag';
import { t } from '../shared/i18n';
import type { Lang } from '../shared/i18n';
import { projectOf } from '../shared/project';
import { toolCategory } from '../shared/types';
import type { AgentEvent } from '../shared/types';

export interface AgentDay { toolCalls: number; activeMs: number; projects: string[]; files: string[]; tasksDone: number }
export interface DaySummary { date: string; perAgent: Record<string, AgentDay> }

const FLUSH_MS = 10_000;
export const LOG_KEEP_DAYS = 30;
const DAY_FILE = /^(\d{4})-(\d{2})-(\d{2})\.jsonl$/;

const pad = (n: number) => String(n).padStart(2, '0');
export function localDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Aggregates events per local day; optional JSONL persistence, flushed lazily (no idle timers). */
export class EventLog {
  private days = new Map<string, DaySummary>();
  private open = new Map<string, number>(); // agentId -> ts of unmatched PreToolUse
  private buffer = new Map<string, string[]>(); // date -> JSONL lines
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private dir: string | null) {}

  append(e: AgentEvent): void {
    if (e.event === 'Roster') return; // available types, not activity: neither persisted nor counted
    const date = localDate(e.ts);
    this.ingest(this.summary(date), e);
    if (this.dir) {
      const lines = this.buffer.get(date) ?? [];
      // message and task text may contain secrets/names: never persisted; progress keeps only its numbers
      const progress = e.progress && { done: e.progress.done, total: e.progress.total };
      lines.push(JSON.stringify({ ...e, message: undefined, progress }));
      this.buffer.set(date, lines);
      this.timer ??= setTimeout(() => this.flush(), FLUSH_MS);
    }
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.dir || !this.buffer.size) return;
    try {
      mkdirSync(this.dir, { recursive: true });
      for (const [date, lines] of this.buffer) appendFileSync(join(this.dir, `${date}.jsonl`), lines.join('\n') + '\n');
    } catch (e) {
      appLog('warn', 'log: could not write event log', e); // a full disk must not crash the overlay
    }
    this.buffer.clear();
  }

  day(date: string): DaySummary {
    const known = this.days.get(date);
    if (known) return known;
    const s: DaySummary = { date, perAgent: {} };
    const file = this.dir ? join(this.dir, `${date}.jsonl`) : null;
    if (file && existsSync(file)) {
      const open = new Map<string, number>();
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (!line) continue;
        try { this.ingest(s, JSON.parse(line) as AgentEvent, open); } catch { /* skip corrupt line */ }
      }
      this.days.set(date, s);
    }
    return s;
  }

  private summary(date: string): DaySummary {
    let s = this.days.get(date);
    if (!s) { s = this.day(date); this.days.set(date, s); }
    return s;
  }

  private ingest(s: DaySummary, e: AgentEvent, open = this.open): void {
    const a = (s.perAgent[e.agentId] ??= { toolCalls: 0, activeMs: 0, projects: [], files: [], tasksDone: 0 });
    // a new, shorter task list must not lower what was already completed today
    if (e.progress) a.tasksDone = Math.max(a.tasksDone, e.progress.done);
    if (e.cwd) {
      const p = projectOf(e);
      if (!a.projects.includes(p)) a.projects.push(p);
    }
    if (e.event === 'PreToolUse') {
      a.toolCalls++;
      open.set(e.agentId, e.ts);
      if (e.file && toolCategory(e.tool) === 'code') {
        const name = e.file.split(/[\\/]/).filter(Boolean).pop()!;
        a.files = [...a.files.filter((f) => f !== name), name].slice(-5);
      }
    } else if (e.event === 'PostToolUse') {
      const t0 = open.get(e.agentId);
      if (t0 !== undefined) { a.activeMs += Math.max(0, e.ts - t0); open.delete(e.agentId); }
    } else if (e.event === 'Stop' || e.event === 'SessionEnd' || e.event === 'SubagentStop') {
      open.delete(e.agentId);
    }
  }
}

export function weekSummary(endDate: string, log: EventLog): DaySummary[] {
  const end = new Date(`${endDate}T12:00:00`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(end);
    d.setDate(end.getDate() - (6 - i));
    return log.day(localDate(d.getTime()));
  });
}

const duration = (ms: number, lang: Lang) =>
  ms < 60_000 ? t(lang, 'unit.sec', { n: Math.round(ms / 1000) }) : t(lang, 'unit.min', { n: Math.round(ms / 60_000) });

export function renderDevLog(s: DaySummary, lang: Lang = 'de'): string {
  const byProject = new Map<string, Array<[string, AgentDay]>>();
  for (const [agent, d] of Object.entries(s.perAgent)) {
    for (const p of d.projects.length ? d.projects : ['(unknown)']) {
      byProject.set(p, [...(byProject.get(p) ?? []), [agent, d]]);
    }
  }
  const out = [`# ${t(lang, 'devlog.title', { date: s.date })}`, ''];
  if (!byProject.size) out.push(t(lang, 'devlog.none'));
  for (const [project, agents] of byProject) {
    out.push(`## ${project}`);
    for (const [agent, d] of agents) {
      const parts = [t(lang, 'devlog.line', { n: d.toolCalls, time: duration(d.activeMs, lang) })];
      if (d.tasksDone) parts.push(t(lang, 'devlog.tasks', { n: d.tasksDone }));
      if (d.files?.length) parts.push(t(lang, 'devlog.files', { list: d.files.join(', ') }));
      out.push(`- **${agent}** — ${parts.join(' — ')}`);
    }
    out.push('');
  }
  return out.join('\n');
}

// Prefixed names: the target dir may be a vault whose own notes are called <date>.md.
export function writeDevLog(dir: string, s: DaySummary, lang: Lang = 'de'): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `kayy-devlog-${s.date}.md`);
  writeFileSync(file, renderDevLog(s, lang));
  return file;
}

export function writeWeekLog(dir: string, endDate: string, log: EventLog, lang: Lang = 'de'): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `kayy-week-${endDate}.md`);
  writeFileSync(file, weekSummary(endDate, log).map((d) => renderDevLog(d, lang)).join('\n---\n\n'));
  return file;
}

const dayNumber = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 86_400_000); // UTC: DST-proof

/** Day files (YYYY-MM-DD.jsonl) strictly older than keepDays; anything else is left alone. */
export function selectExpired(names: string[], today: string, keepDays: number): string[] {
  const [ty, tm, td] = today.split('-').map(Number);
  const limit = dayNumber(ty, tm, td) - keepDays;
  return names.filter((n) => {
    const m = DAY_FILE.exec(n);
    return !!m && dayNumber(Number(m[1]), Number(m[2]), Number(m[3])) < limit;
  });
}

/** Deletes expired JSONL day files; returns what was removed. A missing dir is not an error. */
export function pruneLogs(dir: string, today: string, keepDays = LOG_KEEP_DAYS): string[] {
  let names: string[];
  try { names = readdirSync(dir); } catch { return []; /* no logs yet */ }
  const removed: string[] = [];
  for (const n of selectExpired(names, today, keepDays)) {
    try { unlinkSync(join(dir, n)); removed.push(n); } catch { /* in use: next start retries */ }
  }
  return removed;
}
