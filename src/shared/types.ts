export type EventName =
  | 'SessionStart'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'Notification'
  | 'Stop'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'SessionEnd';

export const EVENT_NAMES: readonly EventName[] = [
  'SessionStart',
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'Stop',
  'SubagentStart',
  'SubagentStop',
  'SessionEnd',
];

export interface AgentEvent {
  ts: number;
  sessionId: string;
  agentId: string;
  parentId?: string;
  event: EventName;
  tool?: string;
  cwd: string;
  message?: string;
}

export type AgentStatus = 'idle' | 'working' | 'waiting' | 'done' | 'error';
export type ToolCategory = 'code' | 'terminal' | 'browser' | 'other';

export interface Agent {
  id: string;
  sessionId: string;
  parentId?: string;
  cwd: string;
  status: AgentStatus;
  category?: ToolCategory;
  lastEventTs: number;
  message?: string;
  role?: string;
}

export type PermissionDecision = 'allow' | 'deny' | 'ask';

export interface PermissionPayload {
  sessionId: string;
  agentId: string;
  tool: string;
  summary: string;
}

export interface PermissionRequestInfo {
  id: string;
  agentId: string;
  tool: string;
  summary: string;
  ts: number;
}

export interface AppState {
  agents: Record<string, Agent>;
}

export function toolCategory(tool?: string): ToolCategory {
  if (!tool) return 'other';
  if (/^(Edit|Write|NotebookEdit|MultiEdit)$/.test(tool)) return 'code';
  if (/^(Bash|PowerShell)$/.test(tool)) return 'terminal';
  if (/^(WebFetch|WebSearch)$/.test(tool) || /^mcp__.*(browser|chrome).*/i.test(tool)) return 'browser';
  return 'other';
}
