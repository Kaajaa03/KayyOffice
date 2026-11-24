// Small usage history: cost (USD) and session count per local day, kept 30 days in usage.json.
// Cost arrives as a cumulative number per session, so only the delta to the last known value is counted.
// Stored: numbers and day strings only; session ids as short hashes (no prompts, paths or ids in clear).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { appLog } from './diag';
import { writeFileAtomic } from './fsutil';
import { localDate } from './log';

export interface UsageDay { usd: number; sessions: number }
export interface UsageData {
  days: Record<string, UsageDay>;
  /** Per session (hash): last cumulative cost and the last day it was counted on. */
  sessions: Record<string, { cost: number; day: string }>;
}
export interface UsageRow extends UsageDay { day: string }

export const RETENTION_DAYS = 30;
const FLUSH_MS = 5000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const emptyUsage = (): UsageData => ({ days: {}, sessions: {} });

export function parseUsage(raw: unknown): UsageData {
  const out = emptyUsage();
  if (!isObj(raw)) return out;
  if (isObj(raw.days)) {
    for (const [k, v] of Object.entries(raw.days)) {
      if (DAY.test(k) && isObj(v) && num(v.usd) && num(v.sessions)) out.days[k] = { usd: v.usd, sessions: Math.floor(v.sessions) };
    }
  }
  if (isObj(raw.sessions)) {
    for (const [k, v] of Object.entries(raw.sessions)) {
      if (/^[0-9a-f]{1,32}$/.test(k) && isObj(v) && num(v.cost) && typeof v.day === 'string' && DAY.test(v.day)) out.sessions[k] = { cost: v.cost, day: v.day };
    }
  }
  return out;
}

const hashId = (id: string): string => createHash('sha1').update(id).digest('hex').slice(0, 16);

/** A lower value never lowers the baseline (a stray value must not make the same cost count twice). */
/** Adds the cost delta of one session to `day`; a session counts once per day it reports on. Pure. */
export function recordCost(data: UsageData, sessionId: string, costUsd: number, day: string): UsageData {
  if (!num(costUsd) || !DAY.test(day)) return data;
  const key = hashId(sessionId);
  const prev = data.sessions[key];
  const delta = prev && costUsd > prev.cost ? costUsd - prev.cost : prev ? 0 : costUsd;
  const cur = data.days[day] ?? { usd: 0, sessions: 0 };
  const newOnDay = !prev || prev.day !== day;
  return {
    days: { ...data.days, [day]: { usd: cur.usd + delta, sessions: cur.sessions + (newOnDay ? 1 : 0) } },
    sessions: { ...data.sessions, [key]: { cost: prev ? Math.max(prev.cost, costUsd) : costUsd, day } },
  };
}

function daysBack(today: string, n: number): string {
  const [y, m, d] = today.split('-').map(Number);
  return localDate(new Date(y, m - 1, d - n).getTime());
}

/** Drops days (and session baselines) older than the retention window, today included. */
export function pruneUsage(data: UsageData, today: string): UsageData {
  const oldest = daysBack(today, RETENTION_DAYS - 1);
  const out = emptyUsage();
  for (const [k, v] of Object.entries(data.days)) if (k >= oldest) out.days[k] = v;
  for (const [k, v] of Object.entries(data.sessions)) if (v.day >= oldest) out.sessions[k] = v;
  return out;
}

/** The last `n` days, oldest first; days without data are zero. */
export function lastDays(data: UsageData, today: string, n: number): UsageRow[] {
  const rows: UsageRow[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = daysBack(today, i);
    rows.push({ day, ...(data.days[day] ?? { usd: 0, sessions: 0 }) });
  }
  return rows;
}

export class UsageStore {
  private data: UsageData;
  private timer: NodeJS.Timeout | null = null;

  constructor(private file: string, private now: () => number = Date.now) {
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch { raw = undefined; /* missing or broken: start empty */ }
    this.data = pruneUsage(parseUsage(raw), localDate(this.now()));
  }

  record(sessionId: string, costUsd: number): void {
    const today = localDate(this.now());
    this.data = pruneUsage(recordCost(this.data, sessionId, costUsd, today), today);
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), FLUSH_MS);
      this.timer.unref();
    }
  }

  recent(n = 7): UsageRow[] { return lastDays(this.data, localDate(this.now()), n); }

  flush(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    try { writeFileAtomic(this.file, JSON.stringify(this.data)); } catch (e) { appLog('warn', 'usage: usage.json not written', e); }
  }
}
