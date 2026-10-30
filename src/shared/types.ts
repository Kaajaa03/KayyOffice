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
  agentType?: string;
  tool?: string;
  cwd: string;
  message?: string;
  /** Who produced the event: the Claude mod (preferred) or a classic hook. */
  source?: 'mod' | 'hook';
  /** Model alias/id of the agent (e.g. "haiku", "claude-opus-5-5"). */
  model?: string;
  /** File the tool works on (file_path), shortened. */
  file?: string;
  /** Session cost so far in USD (reported on session-level events). */
  costUsd?: number;
  /** Task-list progress (TodoWrite): completed / total and the task in progress. `null` clears it. */
  progress?: Progress | null;
}

export interface Progress {
  done: number;
  total: number;
  /** The task currently in progress (display text, max 80 chars). */
  current?: string;
}

export type AgentStatus = 'idle' | 'working' | 'waiting' | 'done' | 'error';
type ToolCategory = 'code' | 'terminal' | 'browser' | 'other';

export interface Agent {
  id: string;
  sessionId: string;
  parentId?: string;
  cwd: string;
  status: AgentStatus;
  category?: ToolCategory;
  lastEventTs: number;
  message?: string;
  /** Subagent type reported by Claude Code (e.g. "Explore"). */
  name?: string;
  /** Set by roles.json matching (main process). */
  role?: string;
  color?: string;
  model?: string;
  /** File the agent is currently working on (cleared on Stop / next tool). */
  file?: string;
  costUsd?: number;
  /** Task-list progress; kept until the agent stops or a new session starts. */
  progress?: Progress;
}

export type PermissionDecision = 'allow' | 'deny' | 'ask';

export interface PermissionPayload {
  sessionId: string;
  agentId: string;
  tool: string;
  summary: string;
  source?: 'mod' | 'hook';
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
