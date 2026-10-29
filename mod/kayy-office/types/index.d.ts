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
}

/** A permission ask waiting for an answer from the overlay or the pane. */
export type PendingRow = { id: string; agentId: string; tool: string; summary: string }

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
    }
  }
}
