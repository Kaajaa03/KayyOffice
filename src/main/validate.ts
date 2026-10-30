import { EVENT_NAMES } from '../shared/types';
import type { AgentEvent, EventName, Progress } from '../shared/types';

export const MAX_BODY_BYTES = 65536;

const str = (v: unknown, max: number): string | undefined =>
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
  if (parentId) out.parentId = parentId;
  if (tool) out.tool = tool;
  if (message !== undefined) out.message = message;
  return out;
}
