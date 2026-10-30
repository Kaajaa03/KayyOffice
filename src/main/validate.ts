import { EVENT_NAMES } from '../shared/types';
import type { AgentEvent, ContextUsage, EventName, Progress, RosterEntry, UsageLimit } from '../shared/types';

export const MAX_BODY_BYTES = 65536;

export const str = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' ? v.slice(0, max) : undefined;

const MAX_TASKS = 99;
const MAX_CURRENT = 80;
// C0/C1 controls and the Unicode line/paragraph separators: they must never reach a canvas label
const CONTROL = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]', 'g');

function parseProgress(raw: unknown): Progress | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { done, total, current } = raw as Record<string, unknown>;
  if (!Number.isInteger(done) || !Number.isInteger(total)) return undefined;
  const d = done as number;
  const n = total as number;
  if (n < 1 || n > MAX_TASKS || d < 0 || d > n) return undefined;
  const text = typeof current === 'string' ? current.replace(CONTROL, '').trim().slice(0, MAX_CURRENT) : '';
  return text ? { done: d, total: n, current: text } : { done: d, total: n };
}

const MAX_ROSTER = 12;
const MAX_ROSTER_TEXT = 40;
const MAX_TOKENS = 10_000_000;
const LIMIT_KIND = new RegExp('^[a-z0-9_-]{1,20}$');

const countOf = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_TOKENS ? v : undefined;

function parseContext(raw: unknown): ContextUsage | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { percent, tokens, window } = raw as Record<string, unknown>;
  if (typeof percent !== 'number' || !Number.isInteger(percent) || percent < 0 || percent > 100) return undefined;
  const out: ContextUsage = { percent };
  const tk = countOf(tokens);
  const win = countOf(window);
  if (tk !== undefined) out.tokens = tk;
  if (win !== undefined) out.window = win;
  return out;
}

function parseLimit(raw: unknown): UsageLimit | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { kind, percent } = raw as Record<string, unknown>;
  if (typeof kind !== 'string' || !LIMIT_KIND.test(kind)) return undefined;
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 999) return undefined;
  return { kind, percent: Math.round(percent) };
}

const label = (v: unknown): string => (typeof v === 'string' ? v.replace(CONTROL, '').trim().slice(0, MAX_ROSTER_TEXT) : '');

function parseRoster(raw: unknown): RosterEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: RosterEntry[] = [];
  for (const it of raw) {
    if (out.length >= MAX_ROSTER) break;
    if (typeof it !== 'object' || it === null) continue;
    const type = label((it as Record<string, unknown>).type);
    if (!type) continue;
    const model = label((it as Record<string, unknown>).model);
    out.push(model ? { type, model } : { type });
  }
  return out;
}

export function parseEvent(raw: unknown): AgentEvent | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const sessionId = str(r.sessionId, 200);
  const agentId = str(r.agentId, 200);
  const cwd = str(r.cwd, 500);
  if (!sessionId || !agentId || cwd === undefined) return null;
  if (typeof r.event !== 'string' || !EVENT_NAMES.includes(r.event as EventName)) return null;
  if (typeof r.ts !== 'number' || !Number.isFinite(r.ts)) return null;
  const out: AgentEvent = { ts: r.ts, sessionId, agentId, event: r.event as EventName, cwd };
  const parentId = str(r.parentId, 200);
  const tool = str(r.tool, 100);
  const message = str(r.message, 500);
  const agentType = str(r.agentType, 100);
  if (agentType) out.agentType = agentType;
  if (r.source === 'mod' || r.source === 'hook') out.source = r.source;
  const model = str(r.model, 100);
  if (model) out.model = model;
  const file = str(r.file, 200);
  if (file) out.file = file;
  if (typeof r.costUsd === 'number' && Number.isFinite(r.costUsd) && r.costUsd >= 0) out.costUsd = r.costUsd;
  const progress = parseProgress(r.progress);
  if (progress) out.progress = progress;
  else if (r.progress === null) out.progress = null; // explicit "task list is gone"
  const context = parseContext(r.context);
  if (context) out.context = context;
  const limit = parseLimit(r.limit);
  if (limit) out.limit = limit;
  const roster = parseRoster(r.roster);
  if (roster) out.roster = roster;
  if (parentId) out.parentId = parentId;
  if (tool) out.tool = tool;
  if (message !== undefined) out.message = message;
  return out;
}
