export type RouterCounts = { haiku: number; sonnet: number; opus: number }

/** One agent row of the pane: the main loop (`id: 'main'`) or a subagent. */
export type AgentRow = {
  id: string
  parentId?: string
  type: string
  status: 'running' | 'idle' | 'done' | 'error'
  tool?: string
  file?: string
  model?: string
  /** From the agent's TodoWrite list: tasks done of all, and the one in progress. */
  progress?: { done: number; total: number; current?: string }
}

/** A permission ask waiting for an answer from the overlay or the pane. */
export type PendingRow = { id: string; agentId: string; tool: string; summary: string }

/** Autopilot switch and its counters: calls let through, calls left to the normal path. */
export type AutopilotState = { isOn: boolean; auto: number; asked: number }

/** Whether the overlay answered the last request. */
export type OverlayLink = 'unknown' | 'ok' | 'off'

declare module 'claude-code' {
  interface PluginState {
    'kayy-office': {
      counts: RouterCounts
      isOff: boolean
      agents: Shaped<AgentRow[]>
      pending: Shaped<PendingRow[]>
      cost: number | null
      link: OverlayLink
      autopilot: AutopilotState
      decision: string | null
    }
  }
}
