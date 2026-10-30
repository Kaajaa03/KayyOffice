import { atom, update, type EngineInterface } from 'claude-code'
import type { AgentRow, OverlayLink } from '../types'
import type { Progress } from './progress'
import type { Rules } from './routing'

// Values the pane draws from live in $.state (they outlive a reload). The validator wants the
// atoms a file reads declared in that file, so each module declares the ones it uses, identically.
const agents = atom({ plugin: 'kayy-office', key: 'agents' } as const, [] as AgentRow[], { shape: 'agents-1' })
const link = atom({ plugin: 'kayy-office', key: 'link' } as const, 'unknown' as OverlayLink)

export const MAIN = 'main'
const MAX_ROWS = 30

/** What the module keeps for the session outside $.state: caches and in-flight waits. */
export type Office = {
  config?: { token: string; port: number }
  pausedUntil: number
  queue: Promise<void>
  queued: number
  link: OverlayLink
  sessionId?: string
  cwd?: string
  mainModel?: string
  spawned: Map<string, { parentId?: string; type: string; model?: string }>
  /** Last progress sent per agent (key: agent id or MAIN); a repeat is not sent again. */
  progress: Map<string, Progress>
  waiters: Map<string, (decision: 'allow' | 'deny' | 'ask' | undefined) => void>
  rules?: Rules
  /** Cached from $.store at session start: autopilot (default off), orchestrator (default on). */
  isAutopilot?: boolean
  isOrchestrator?: boolean
}

export const newOffice = (): Office => ({
  pausedUntil: 0,
  queue: Promise.resolve(),
  queued: 0,
  link: 'unknown',
  spawned: new Map(),
  progress: new Map(),
  waiters: new Map(),
})

/** Upserts one agent row; done rows beyond the cap are dropped first. */
export async function setAgent($: EngineInterface, id: string, patch: Partial<AgentRow>) {
  await update($, agents, list => {
    const at = list.findIndex(a => a.id === id)
    const base: AgentRow = at >= 0 ? list[at]! : { id, type: id === MAIN ? 'main' : 'agent', status: 'running' }
    const row: AgentRow = { ...base, ...patch, id }
    // A patch clears a field by naming it undefined; the stored row never holds undefined.
    for (const k of Object.keys(row) as (keyof AgentRow)[]) if (row[k] === undefined) delete row[k]
    const next = at >= 0 ? list.map((a, i) => (i === at ? row : a)) : [...list, row]
    while (next.length > MAX_ROWS) {
      const old = next.findIndex(a => a.id !== MAIN && (a.status === 'done' || a.status === 'error'))
      next.splice(old >= 0 ? old : 1, 1)
    }
    return next
  })
}

export async function setLink($: EngineInterface, office: Office, value: OverlayLink) {
  if (office.link === value) return
  office.link = value
  await update($, link, () => value)
}
