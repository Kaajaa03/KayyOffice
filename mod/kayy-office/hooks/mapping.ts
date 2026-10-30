// Pure mapping from mod hook inputs to the overlay's AgentEvent (see the spec's protocol section).
import type { Progress } from './progress'

export type EventName =
  | 'SessionStart'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'Notification'
  | 'Stop'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'SessionEnd'
  | 'Roster'

export type ContextInfo = { percent: number; tokens?: number; window?: number }
export type LimitInfo = { kind: string; percent: number }
export type RosterEntry = { type: string; model?: string }

export type AgentEvent = {
  ts: number
  sessionId: string
  agentId: string
  parentId?: string
  event: EventName
  tool?: string
  cwd: string
  message?: string
  agentType?: string
  source: 'mod'
  model?: string
  costUsd?: number
  file?: string
  /** null clears the agent's bar in the overlay. */
  progress?: Progress | null
  context?: ContextInfo
  limit?: LimitInfo
  roster?: RosterEntry[]
}

/** Who and where an event happened: the fields every event carries. */
export type Where = { ts: number; sessionId: string; cwd: string }

export const cut = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v.slice(0, max) : undefined

// Keys tool.call carries beside the tool's own arguments; never part of a summary.
const RESERVED = new Set(['tool', 'tool_use_id', 'agentId', 'requestMeta', 'consent'])

const argsOf = (input: unknown): Record<string, unknown> | undefined =>
  typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : undefined

/** The tool's `file_path` (or a notebook's path), at most 200 chars; never guessed from a command. */
export const fileOf = (input: unknown): string | undefined => {
  const args = argsOf(input)
  return cut(args?.file_path, 200) ?? cut(args?.notebook_path, 200)
}

/** What a permission card shows: the command, else the file, else the arguments as JSON (max 300). */
export const summaryOf = (input: unknown): string => {
  const args = argsOf(input)
  if (args === undefined) return ''
  if (typeof args.command === 'string') return args.command.slice(0, 300)
  if (typeof args.file_path === 'string') return args.file_path.slice(0, 300)
  const rest: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args)) if (!RESERVED.has(k)) rest[k] = v
  try {
    return JSON.stringify(rest).slice(0, 300)
  } catch {
    return ''
  }
}

/**
 * `ERROR: <tool> failed` for a tool that failed or was refused; undefined for a clean result.
 * Never the tool's output or the refusal text: those may hold file contents or secrets.
 */
export const errorOf = (tool: string, ran: { deny?: string; isError?: true } | undefined): string | undefined => {
  if (ran === undefined) return undefined
  if (typeof ran.deny === 'string' || ran.isError === true) return `ERROR: ${tool.slice(0, 100)} failed`
  return undefined
}

/** Builds one event, leaving out every field that is empty. */
export const makeEvent = (
  where: Where,
  event: EventName,
  agentId: string | undefined,
  extra: {
    parentId?: string
    tool?: string
    message?: string
    agentType?: string
    model?: string
    costUsd?: number
    file?: string
    progress?: Progress | null
    context?: ContextInfo
    limit?: LimitInfo
    roster?: readonly RosterEntry[]
  } = {},
): AgentEvent => {
  const out: AgentEvent = {
    ts: where.ts,
    sessionId: where.sessionId.slice(0, 200),
    agentId: (agentId ?? where.sessionId).slice(0, 200),
    event,
    cwd: where.cwd.slice(0, 500),
    source: 'mod',
  }
  const parentId = cut(extra.parentId, 200)
  const tool = cut(extra.tool, 100)
  const message = cut(extra.message, 500)
  const agentType = cut(extra.agentType, 100)
  const model = cut(extra.model, 100)
  const file = cut(extra.file, 200)
  if (parentId !== undefined && parentId !== out.agentId) out.parentId = parentId
  if (tool !== undefined) out.tool = tool
  if (message !== undefined) out.message = message
  if (agentType !== undefined) out.agentType = agentType
  if (model !== undefined) out.model = model
  if (file !== undefined) out.file = file
  if (extra.progress !== undefined) out.progress = extra.progress
  if (typeof extra.costUsd === 'number' && Number.isFinite(extra.costUsd)) out.costUsd = extra.costUsd
  if (extra.context !== undefined) out.context = extra.context
  if (extra.limit !== undefined) out.limit = extra.limit
  if (extra.roster !== undefined) {
    out.roster = extra.roster.slice(0, 12).flatMap(r => {
      const type = cut(r.type, 40)
      const rowModel = cut(r.model, 100)
      return type === undefined ? [] : [rowModel === undefined ? { type } : { type, model: rowModel }]
    })
  }
  return out
}
