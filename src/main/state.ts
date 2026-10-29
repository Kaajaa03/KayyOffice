import { toolCategory } from '../shared/types';
import type { Agent, AgentEvent, AppState } from '../shared/types';

export const DONE_TO_IDLE_MS = 15000;

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
    message: undefined,
    ...patch,
    lastEventTs: e.ts,
  };
  return { agents: { ...state.agents, [e.agentId]: agent } };
}

export function reduce(state: AppState, e: AgentEvent): AppState {
  switch (e.event) {
    case 'SessionStart':
      return upsert(state, e, { status: 'idle' });
    case 'PreToolUse':
      return upsert(state, e, { status: 'working', category: toolCategory(e.tool), file: e.file });
    case 'PostToolUse':
      if (e.message?.startsWith('ERROR:')) return upsert(state, e, { status: 'error', message: e.message });
      return upsert(state, e, { status: 'working', category: toolCategory(e.tool) });
    case 'Notification':
      return upsert(state, e, { status: 'waiting', message: e.message });
    case 'Stop':
      return upsert(state, e, { status: 'done', file: undefined });
    case 'SubagentStart':
      return upsert(state, e, { status: 'working' });
    case 'SubagentStop':
      return state.agents[e.agentId] ? upsert(state, e, { status: 'done' }) : state;
    case 'SessionEnd': {
      const agents = Object.fromEntries(
        Object.entries(state.agents).filter(([, a]) => a.sessionId !== e.sessionId),
      );
      return { agents };
    }
  }
}

export function tick(state: AppState, now: number): AppState {
  let changed = false;
  const agents: Record<string, Agent> = {};
  for (const [id, a] of Object.entries(state.agents)) {
    if (a.status === 'done' && now - a.lastEventTs >= DONE_TO_IDLE_MS) {
      agents[id] = { ...a, status: 'idle' };
      changed = true;
    } else agents[id] = a;
  }
  return changed ? { agents } : state;
}

export function pruneStale(state: AppState, now: number, maxAgeMs: number): AppState {
  const entries = Object.entries(state.agents);
  // an agent that "needs you" stays visible 8x longer (e.g. 2 h) than other quiet agents
  const kept = entries.filter(([, a]) => now - a.lastEventTs < (a.status === 'waiting' ? maxAgeMs * 8 : maxAgeMs));
  return kept.length === entries.length ? state : { agents: Object.fromEntries(kept) };
}
