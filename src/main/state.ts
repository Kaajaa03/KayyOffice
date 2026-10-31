import { toolCategory } from '../shared/types';
import type { Agent, AgentEvent, AppState } from '../shared/types';

export const DONE_TO_IDLE_MS = 15000;
/** A finished subagent frees its desk this long after its last event. */
export const SUBAGENT_LINGER_MS = 20000;
/** A quiet agent is pruned after this long (a waiting one after 2x, because an interrupted question sends no Stop; an idle one after IDLE_STALE_MS). */
export const STALE_MS = 15 * 60 * 1000;
/** An unused chat (idle) loses its character after this long. */
export const IDLE_STALE_MS = 5 * 60 * 1000;

const isSubagent = (a: Agent) => a.parentId !== undefined;
const staleAfter = (a: Agent) => (a.status === 'waiting' ? STALE_MS * 2 : a.status === 'idle' ? IDLE_STALE_MS : STALE_MS);

export function initialState(): AppState {
  return { agents: {} };
}

function upsert(state: AppState, e: AgentEvent, patch: Partial<Agent>): AppState {
  const prev = state.agents[e.agentId];
  const agent: Agent = {
    id: e.agentId,
    sessionId: e.sessionId,
    parentId: e.parentId ?? prev?.parentId,
    cwd: e.cwd,
    status: prev?.status ?? 'idle',
    category: prev?.category,
    role: prev?.role,
    color: prev?.color,
    name: e.agentType ?? prev?.name,
    model: e.model ?? prev?.model,
    costUsd: e.costUsd ?? prev?.costUsd,
    file: e.file ?? prev?.file,
    context: e.context ?? prev?.context,
    limit: e.limit ?? prev?.limit,
    progress: e.progress === null ? undefined : (e.progress ?? prev?.progress),
    message: undefined,
    ...patch,
    lastEventTs: e.ts,
  };
  return { ...state, agents: { ...state.agents, [e.agentId]: agent } };
}

export function reduce(state: AppState, e: AgentEvent): AppState {
  // a Roster event is about available agent types: it never creates or changes an agent
  if (e.event === 'Roster') return e.roster ? { ...state, roster: e.roster } : state;
  switch (e.event) {
    case 'SessionStart':
      return upsert(state, e, { status: 'idle', progress: undefined });
    case 'PreToolUse':
      return upsert(state, e, { status: 'working', category: toolCategory(e.tool), file: e.file });
    case 'PostToolUse':
      if (e.message?.startsWith('ERROR:')) return upsert(state, e, { status: 'error', message: e.message });
      return upsert(state, e, { status: 'working', category: toolCategory(e.tool) });
    case 'Notification':
      return upsert(state, e, { status: 'waiting', message: e.message });
    case 'Stop':
      return upsert(state, e, { status: 'done', file: undefined, progress: undefined });
    case 'SubagentStart':
      return upsert(state, e, { status: 'working' });
    case 'SubagentStop':
      return state.agents[e.agentId] ? upsert(state, e, { status: 'done' }) : state;
    case 'SessionEnd': {
      const agents = Object.fromEntries(
        Object.entries(state.agents).filter(([, a]) => a.sessionId !== e.sessionId),
      );
      return { ...state, agents };
    }
  }
}

export function tick(state: AppState, now: number): AppState {
  let changed = false;
  const agents: Record<string, Agent> = {};
  for (const [id, a] of Object.entries(state.agents)) {
    const age = now - a.lastEventTs;
    if (a.status === 'done' && isSubagent(a) && age >= SUBAGENT_LINGER_MS) {
      changed = true; // desk freed
    } else if (a.status === 'done' && !isSubagent(a) && age >= DONE_TO_IDLE_MS) {
      agents[id] = { ...a, status: 'idle' };
      changed = true;
    } else agents[id] = a;
  }
  return changed ? { ...state, agents } : state;
}

/** Delay in ms until tick/pruneStale next have something to do; null when nothing is time-driven. */
export function nextDueMs(state: AppState, now: number): number | null {
  let due = Infinity;
  for (const a of Object.values(state.agents)) {
    due = Math.min(due, a.lastEventTs + staleAfter(a));
    if (a.status === 'done') due = Math.min(due, a.lastEventTs + (isSubagent(a) ? SUBAGENT_LINGER_MS : DONE_TO_IDLE_MS));
  }
  return due === Infinity ? null : Math.max(0, due - now);
}

/** Removes agents that stayed quiet longer than `staleAfter`; the same rule nextDueMs schedules by. */
export function pruneStale(state: AppState, now: number): AppState {
  const entries = Object.entries(state.agents);
  const kept = entries.filter(([, a]) => now - a.lastEventTs < staleAfter(a));
  return kept.length === entries.length ? state : { ...state, agents: Object.fromEntries(kept) };
}
