import { atom, update, type EngineInterface } from 'claude-code'
import type { PendingRow } from '../types'
import { summaryOf } from './mapping'
import { askOverlay, type Decision, type PermissionPayload } from './overlay'
import { QUESTION_TOOL } from './question'
import type { Office } from './state'

const pending = atom({ plugin: 'kayy-office', key: 'pending' } as const, [] as PendingRow[], { shape: 'pending-1' })

/** How long an ask waits for the overlay or the pane before the normal dialog takes over. */
export const ASK_TIMEOUT_MS = 20_000
/**
 * With the overlay off, only the pane is waited on; nothing else is in flight then, so the
 * hook's own 10 s budget runs: stay well inside it.
 */
export const PANE_ONLY_MS = 7_000

/**
 * Interactive tools whose dialog is never answered from outside. AskUserQuestion is not here: it
 * reaches the overlay only through `question.ts` (a card of option buttons, never allow/deny).
 */
export const NEVER_FORWARD = new Set(['ExitPlanMode'])

export const PANE_ID = 'kayy-office'

export type CheckEvent = { tool: string; input: unknown; tool_use_id?: string; agentId?: string; approver?: string }
export type Verdict = { decision: 'allow' | 'ask' | 'deny'; reason?: string }

/**
 * Only a real call (it has a tool_use_id) whose ask a person would answer is forwarded:
 * never a query from another plugin, never a host or headless approver, never a core allow/deny.
 */
export const shouldForward = (e: CheckEvent, core: Verdict): boolean =>
  core.decision === 'ask' && !NEVER_FORWARD.has(e.tool) && e.tool !== QUESTION_TOOL && e.tool_use_id !== undefined && e.approver === 'person'

/** What the approver needs from the outside world; `ioFor` builds it from `$`, tests fake it. */
export type ApproverIo = {
  ask: (payload: PermissionPayload) => Promise<Decision | undefined>
  isPaneShown: () => Promise<boolean>
  show: (row: PendingRow) => Promise<void>
  hide: (id: string) => Promise<void>
  after: (ms: number, fn: () => void) => { cancel: () => void }
  waiters: Map<string, (decision: Decision | undefined) => void>
}

/**
 * Puts one forwardable ask to the overlay and, when the pane is shown, to the pane too; the
 * first answer wins. allow/deny come back with `reason: 'Kayy Office'`; anything else
 * (ask, timeout, error, overlay off) returns `core` unchanged.
 */
export async function approve(io: ApproverIo, e: CheckEvent, core: Verdict, sessionId: string): Promise<Verdict> {
  if (!shouldForward(e, core)) return core
  const id = e.tool_use_id!
  const summary = summaryOf(e.input)
  const agentId = e.agentId ?? sessionId
  const isPane = await io.isPaneShown().catch(() => false)

  let finish: (d: Decision | undefined) => void = () => undefined
  const answer = new Promise<Decision | undefined>(resolve => {
    let isDone = false
    finish = d => {
      if (isDone) return
      isDone = true
      resolve(d)
    }
  })
  const timers = [io.after(ASK_TIMEOUT_MS, () => finish(undefined))]

  if (isPane) {
    io.waiters.set(id, d => finish(d))
    await io.show({ id, agentId, tool: e.tool, summary }).catch(() => undefined)
  }

  io.ask({ sessionId, agentId, tool: e.tool, summary }).then(
    d => {
      if (d !== undefined || !isPane) finish(d)
      else timers.push(io.after(PANE_ONLY_MS, () => finish(undefined)))
    },
    () => finish(undefined),
  )

  const decision = await answer
  for (const t of timers) t.cancel()
  if (isPane) {
    io.waiters.delete(id)
    await io.hide(id).catch(() => undefined)
  }
  return decision === 'allow' || decision === 'deny' ? { decision, reason: 'Kayy Office' } : core
}

async function isPaneShown($: EngineInterface) {
  return (await $.ui.panes()).some(p => p.id === PANE_ID && p.isPlaced)
}

async function showPending($: EngineInterface, row: PendingRow) {
  await update($, pending, list => [...list.filter(p => p.id !== row.id), row])
}

async function hidePending($: EngineInterface, id: string) {
  await update($, pending, list => list.filter(p => p.id !== id))
}

export function ioFor($: EngineInterface, office: Office): ApproverIo {
  return {
    ask: payload => askOverlay($, office, payload),
    isPaneShown: () => isPaneShown($),
    show: row => showPending($, row),
    hide: id => hidePending($, id),
    after: (ms, fn) => $.clock.after(ms, fn),
    waiters: office.waiters,
  }
}

/** A press on the pane's card: answers the waiting ask, or just clears a stale card. */
export async function answerFromPane($: EngineInterface, office: Office, id: string, decision: Decision) {
  const waiter = office.waiters.get(id)
  if (waiter !== undefined) waiter(decision)
  else await hidePending($, id)
}
