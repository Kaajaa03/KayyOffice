import { EVENT_NAMES } from '../shared/types';
import type { AgentEvent, EventName } from '../shared/types';

export const MAX_BODY_BYTES = 65536;

const str = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' ? v.slice(0, max) : undefined;

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
  if (parentId) out.parentId = parentId;
  if (tool) out.tool = tool;
  if (message !== undefined) out.message = message;
  return out;
}
