import { atom, read, update, type EngineInterface, type Register } from 'claude-code'
import type { AgentRow, PendingRow } from '../types'
import { PANE_ID, approve, ioFor, shouldForward, type CheckEvent } from './approver'
import { errorOf, fileOf, makeEvent, type EventName } from './mapping'
import { sendEvent } from './overlay'
import { hasTodoList, sameProgress, todoProgress, type Progress } from './progress'
import { renderPane } from './pane'
import { autopilotCheck } from './autopilot'
import { withOrchestrator } from './orchestrator'
import { AUTOPILOT_WARNING, autopilotIoFor, autopilotSummary, decisionOf, loadSwitches, setAutopilot, setDecision, setOrchestrator } from './pilot'
import { aliasOf, countRoute, routeFor, routerCommand, showStatus, summary, usd } from './router'
import { MAIN, newOffice, setAgent, type Office } from './state'

const agents = atom({ plugin: 'kayy-office', key: 'agents' } as const, [] as AgentRow[], { shape: 'agents-1' })
const pending = atom({ plugin: 'kayy-office', key: 'pending' } as const, [] as PendingRow[], { shape: 'pending-1' })
const cost = atom({ plugin: 'kayy-office', key: 'cost' } as const, null as number | null)
const isOff = atom({ plugin: 'kayy-office', key: 'isOff' } as const, false)

const TITLE = 'Kayy Office'

/** Session id and cwd, cached; throws when the session cannot say (then no event is sent). */
async function where($: EngineInterface, office: Office) {
  if (office.sessionId === undefined) office.sessionId = await $.session.id()
  if (office.cwd === undefined) office.cwd = await $.session.cwd()
  return { ts: await $.clock.now(), sessionId: office.sessionId, cwd: office.cwd }
}

/** Sends one event; any failure on the way is swallowed. */
async function emit(
  $: EngineInterface,
  office: Office,
  event: EventName,
  agentId: string | undefined,
  extra: Parameters<typeof makeEvent>[3] = {},
) {
  try {
    const at = await where($, office)
    const parentId = extra.parentId ?? (agentId !== undefined ? (office.spawned.get(agentId)?.parentId ?? at.sessionId) : undefined)
    sendEvent($, office, makeEvent(at, event, agentId, { ...extra, parentId }))
  } catch {
    // the overlay is optional: never let it touch the session
  }
}

async function quietly(work: Promise<unknown>) {
  try {
    await work
  } catch {
    // pane state is best effort
  }
}

const modelOf = (office: Office, agentId: string | undefined) =>
  agentId === undefined ? office.mainModel : office.spawned.get(agentId)?.model

async function officeStatus($: EngineInterface, office: Office) {
  const list = await read($, agents)
  const busy = list.filter(a => a.status === 'running').length
  const asks = (await read($, pending)).length
  const routerLine = await summary($)
  const spent = await read($, cost)
  return [
    `Kayy Office: ${list.length} Agents (${busy} aktiv), ${asks} offene Freigaben.`,
    `Kosten: ${spent === null ? 'unbekannt' : `$${spent.toFixed(2)}`}`,
    `Router: ${routerLine}`,
    await autopilotSummary($),
    `Orchestrator ${office.isOrchestrator === false ? 'aus' : 'an'}`,
  ].join('\n')
}

async function toggleOffice($: EngineInterface) {
  const isOpen = (await $.ui.panes()).some(p => p.id === PANE_ID)
  if (isOpen) {
    await $.ui.close({ id: PANE_ID })
    return 'Kayy Office geschlossen.'
  }
  await $.ui.open({ id: PANE_ID, title: TITLE })
  return 'Kayy Office geöffnet.'
}

const USAGE = 'Nutzung: /office [status] | /office autopilot [on|off|status] | /office orchestrator [on|off|status]'

async function autopilotCommand($: EngineInterface, office: Office, value: 'on' | 'off' | 'status') {
  if (value === 'on') {
    await setAutopilot($, office, true)
    return `Autopilot an: Routine (Lesen/Bearbeiten im Projekt, sichere Befehle) wird automatisch freigegeben. ${AUTOPILOT_WARNING} ${await autopilotSummary($)}`
  }
  if (value === 'off') {
    await setAutopilot($, office, false)
    return `Autopilot aus: jede Freigabe läuft wie gewohnt. ${await autopilotSummary($)}`
  }
  return autopilotSummary($)
}

async function orchestratorCommand($: EngineInterface, office: Office, value: 'on' | 'off' | 'status') {
  if (value !== 'status') await setOrchestrator($, office, value === 'on')
  return office.isOrchestrator !== false
    ? 'Orchestrator an: Claude delegiert passende Aufgaben an kayy-scout/-coder/-architect und fragt nur bei echten Entscheidungen.'
    : 'Orchestrator aus: kein Zusatz im System-Prompt.'
}

/** Once per install: kayy-office contains the router, so kayy-router must not run beside it. */
async function warnRouterOnce($: EngineInterface) {
  if ((await $.store.get('routerHintShown')) === true) return
  $.ui.toast('Kayy Office enthält den Router: kayy-router bitte nicht gleichzeitig laden (sonst doppeltes Routing).', {
    timeoutMs: 10_000,
  })
  await $.store.set('routerHintShown', true)
}

export const register: Register = on => {
  const office = newOffice()

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'router', description: 'Model routing for subagents: /router [status|on|off]' })
    await $.command.register({ name: 'office', description: 'Kayy Office: Pane öffnen/schließen, Status, Autopilot, Orchestrator', argumentHint: '[status | autopilot on|off|status | orchestrator on|off|status]' })
    const started = await next(e)
    office.sessionId = undefined
    office.cwd = e.cwd
    office.spawned.clear()
    office.progress.clear()
    try {
      office.mainModel = await $.session.model()
    } catch {
      office.mainModel = undefined
    }
    await quietly(update($, agents, () => [{ id: MAIN, type: 'main', status: 'idle', ...(office.mainModel ? { model: office.mainModel } : {}) }]))
    await quietly(update($, pending, () => []))
    const spent = await usd($)
    if (spent !== undefined) await quietly(update($, cost, () => spent))
    await emit($, office, 'SessionStart', undefined, { model: office.mainModel, costUsd: spent })
    await quietly(warnRouterOnce($))
    await quietly(loadSwitches($, office))
    return started
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'router' }, ($, e) => routerCommand($, e.args))

  on('command.run', { command: 'office' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'status') return { text: await officeStatus($, office) }
    if (arg === '') return { text: await toggleOffice($) }
    const [sub, value = 'status', ...more] = arg.split(/\s+/)
    if (more.length === 0 && (value === 'on' || value === 'off' || value === 'status')) {
      if (sub === 'autopilot') return { text: await autopilotCommand($, office, value) }
      if (sub === 'orchestrator') return { text: await orchestratorCommand($, office, value) }
    }
    return { text: USAGE }
  })

  on('tool.call', async ($, e, next) => {
    const row = e.agentId ?? MAIN
    const file = fileOf(e)
    await emit($, office, 'PreToolUse', e.agentId, { tool: e.tool, file, model: modelOf(office, e.agentId) })
    await quietly(setAgent($, row, { status: 'running', tool: e.tool, file }))
    // A question or a plan for the person: the office shows that a decision is wanted (never answers it).
    const question = decisionOf(e.tool, e)
    if (question !== undefined) {
      await emit($, office, 'Notification', e.agentId, { tool: e.tool, message: `Entscheidung: ${question}`, model: modelOf(office, e.agentId) })
      await quietly(setDecision($, question))
    }
    const ran = await next(e).finally(() => (question !== undefined ? quietly(setDecision($, null)) : undefined))
    const message = errorOf(e.tool, ran)
    // TodoWrite: tasks done of all, sent only when it differs from this agent's last one.
    // A real list with nothing to show (empty, no valid items, over 99) clears a bar sent before: one null.
    let progress: Progress | null | undefined
    if (e.tool === 'TodoWrite' && message === undefined) {
      const todo = todoProgress(e)
      if (todo !== undefined) {
        if (!sameProgress(office.progress.get(row), todo)) progress = todo
      } else if (hasTodoList(e) && office.progress.has(row)) {
        progress = null
      }
    }
    if (progress === null) office.progress.delete(row)
    else if (progress !== undefined) office.progress.set(row, progress)
    await emit($, office, 'PostToolUse', e.agentId, { tool: e.tool, file, message, progress, model: modelOf(office, e.agentId) })
    await quietly(setAgent($, row, { status: 'running', tool: undefined, file: undefined, ...(progress !== undefined ? { progress: progress ?? undefined } : {}) }))
    return ran
  }).catch(($, e, next) => next(e))

  // Approver: only a real call's core `ask` meant for a person is ever put to the overlay.
  on('tool.check', async ($, e, next) => {
    const core = await next(e)
    // Autopilot first: routine in the project needs no card at all. Never touches a core allow/deny.
    const auto = await autopilotCheck(autopilotIoFor($, office), e as CheckEvent, core).catch(() => undefined)
    if (auto !== undefined) return auto
    if (!shouldForward(e as CheckEvent, core)) return core
    try {
      const at = await where($, office)
      return await approve(ioFor($, office), e as CheckEvent, core, at.sessionId)
    } catch {
      return core // fall through to the normal dialog
    }
  }).catch(($, e, next) => next(e))

  on('agent.spawn', async ($, e, next) => {
    // A resumed subagent or woken teammate keeps its model and is not a new spawn; off means hands off.
    const isRouting = !e.resume && !(await read($, isOff))
    const chosen = isRouting ? await routeFor($, office, e) : undefined
    const started = await next(chosen === undefined ? e : { ...e, model: chosen })
    if (isRouting) {
      await quietly(countRoute($, chosen ?? aliasOf(started.model)))
      await quietly(showStatus($))
    }
    const agentId = started.agentId
    if (started.deny === undefined && agentId !== undefined) {
      const model = chosen ?? started.model ?? e.model
      const at = await where($, office).catch(() => undefined)
      const parentId = e.parentAgentId ?? at?.sessionId
      office.spawned.set(agentId, { parentId, type: e.subagentType, model })
      const row: Partial<AgentRow> = { parentId: e.parentAgentId ?? MAIN, type: e.subagentType, status: 'running', model }
      await quietly(setAgent($, agentId, row))
      await emit($, office, 'SubagentStart', agentId, { parentId, agentType: e.subagentType, model })
    }
    return started
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    await quietly(showStatus($))
    if (e.agentId !== undefined) {
      // A subagent's run ends in its own turn.complete carrying its agentId.
      const known = office.spawned.get(e.agentId)
      const failed = e.reason === 'error'
      await emit($, office, 'SubagentStop', e.agentId, {
        agentType: known?.type,
        model: known?.model,
        message: failed ? 'ERROR: subagent failed' : undefined,
      })
      office.progress.delete(e.agentId)
      await quietly(setAgent($, e.agentId, { status: failed ? 'error' : 'done', tool: undefined, file: undefined, progress: undefined }))
    } else {
      if (e.usage?.model) office.mainModel = e.usage.model
      await emit($, office, 'Stop', undefined, { model: office.mainModel, costUsd: await usd($) })
      office.progress.delete(MAIN)
      await quietly(setAgent($, MAIN, { status: 'idle', tool: undefined, file: undefined, progress: undefined, model: office.mainModel }))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    office.sessionId = e.sessionId
    await emit($, office, 'SessionEnd', undefined)
    // A /clear goes on under a new session id: forget the old one.
    office.sessionId = undefined
    office.spawned.clear()
    office.progress.clear()
    await quietly(update($, pending, () => []))
    return next(e)
  }).catch(($, e, next) => next(e))

  // Orchestration policy: one short section at the end of the system prompt, while on.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (office.isOrchestrator === undefined) await quietly(loadSwitches($, office))
    return { sections: withOrchestrator(composed.sections, office.isOrchestrator !== false) }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: 'kayy-office' }, ($, e) => renderPane($, e, office))
}
