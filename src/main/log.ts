import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectOf } from '../shared/project';
import type { AgentEvent } from '../shared/types';

export interface AgentDay { toolCalls: number; activeMs: number; projects: string[] }
export interface DaySummary { date: string; perAgent: Record<string, AgentDay> }

const FLUSH_MS = 10_000;

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
    const date = localDate(e.ts);
    this.ingest(this.summary(date), e);
    if (this.dir) {
      const lines = this.buffer.get(date) ?? [];
      lines.push(JSON.stringify(e));
      this.buffer.set(date, lines);
      this.timer ??= setTimeout(() => this.flush(), FLUSH_MS);
    }
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.dir || !this.buffer.size) return;
    mkdirSync(this.dir, { recursive: true });
    for (const [date, lines] of this.buffer) appendFileSync(join(this.dir, `${date}.jsonl`), lines.join('\n') + '\n');
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
    const a = (s.perAgent[e.agentId] ??= { toolCalls: 0, activeMs: 0, projects: [] });
    if (e.cwd) {
      const p = projectOf(e);
      if (!a.projects.includes(p)) a.projects.push(p);
    }
    if (e.event === 'PreToolUse') {
      a.toolCalls++;
      open.set(e.agentId, e.ts);
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

const minutes = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`);

export function renderDevLog(s: DaySummary): string {
  const byProject = new Map<string, Array<[string, AgentDay]>>();
  for (const [agent, d] of Object.entries(s.perAgent)) {
    for (const p of d.projects.length ? d.projects : ['(unknown)']) {
      byProject.set(p, [...(byProject.get(p) ?? []), [agent, d]]);
    }
  }
  const out = [`# Dev-Log ${s.date}`, ''];
  if (!byProject.size) out.push('_Keine Agent-Aktivität._');
  for (const [project, agents] of byProject) {
    out.push(`## ${project}`);
    for (const [agent, d] of agents) out.push(`- **${agent}** — ${d.toolCalls} Tool-Calls, aktiv ${minutes(d.activeMs)}`);
    out.push('');
  }
  return out.join('\n');
}

export function writeDevLog(dir: string, s: DaySummary): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${s.date}.md`);
  writeFileSync(file, renderDevLog(s));
  return file;
}
