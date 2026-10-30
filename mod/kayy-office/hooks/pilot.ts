// The `$` side of autopilot, orchestrator and the decision signal: store, state, file system.
import { atom, read, update, type EngineInterface } from 'claude-code'
import type { AutopilotState } from '../types'
import { baseDir, targetPathOf, type AutopilotCtx, type AutopilotIo } from './autopilot'
import type { Office } from './state'

const autopilot = atom({ plugin: 'kayy-office', key: 'autopilot' } as const, { isOn: false, auto: 0, asked: 0 } as AutopilotState)
const decision = atom({ plugin: 'kayy-office', key: 'decision' } as const, null as string | null)

export const autopilotLine = (a: AutopilotState) => `Autopilot ${a.isOn ? 'an' : 'aus'} · ${a.auto} automatisch · ${a.asked} gefragt`

/** Reads both switches from $.store once per session (autopilot default off, orchestrator default on). */
export async function loadSwitches($: EngineInterface, office: Office) {
  office.isAutopilot = (await $.store.get('autopilot').catch(() => undefined)) === true
  office.isOrchestrator = (await $.store.get('orchestrator').catch(() => undefined)) !== false
  const isOn = office.isAutopilot
  await update($, autopilot, a => ({ ...a, isOn }))
}

/** Said once more whenever autopilot is switched on: the remaining risk in one sentence. */
export const AUTOPILOT_WARNING = 'Nur für eigene, vertrauenswürdige Projekte: automatisch bearbeitete Quelldateien können ändern, was Tests und Builds ausführen.'

export async function setAutopilot($: EngineInterface, office: Office, isOn: boolean) {
  office.isAutopilot = isOn
  await $.store.set('autopilot', isOn)
  await update($, autopilot, a => ({ ...a, isOn }))
}

export async function setOrchestrator($: EngineInterface, office: Office, isOn: boolean) {
  office.isOrchestrator = isOn
  await $.store.set('orchestrator', isOn)
}

export async function autopilotSummary($: EngineInterface) {
  return autopilotLine(await read($, autopilot))
}

export async function setDecision($: EngineInterface, question: string | null) {
  await update($, decision, () => question)
}

/** Where a path lands, links resolved; undefined when it cannot be placed (see `$.fs.stat`). */
async function placed($: EngineInterface, path: string) {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  const name = path.slice(cut + 1)
  const isPlaceable =
    !/^[A-Za-z]:(?![\\/])/.test(path) && !/^[\\/][\\/]/.test(path) && !/^[A-Za-z]:/.test(name) && name !== '' && name !== '.' && name !== '..'
  if (!isPlaceable) return undefined
  const own = await $.fs.stat(path, { resolve: true }).catch(() => undefined)
  if (own) return own.realPath
  const folder = cut < 0 ? '.' : path.slice(0, cut + 1)
  const dir = await $.fs.stat(folder, { resolve: true }).catch(() => undefined)
  if (dir?.realPath === undefined) return undefined
  const sep = dir.realPath.includes('\\') ? '\\' : '/'
  return `${dir.realPath.replace(/[\\/]$/, '')}${sep}${name}`
}

async function realOf($: EngineInterface, path: string) {
  return (await $.fs.stat(path, { resolve: true }).catch(() => undefined))?.realPath
}

async function contextFor($: EngineInterface, tool: string, args: unknown): Promise<AutopilotCtx> {
  // The root alone is the project; the cwd only serves as the base when it lies inside the root.
  const root = await $.session.root()
  const base = baseDir(root, await $.session.cwd())
  const realRoot = await realOf($, root)
  const home = (await $.env.get('USERPROFILE').catch(() => undefined)) || (await $.env.get('HOME').catch(() => undefined)) || undefined
  const target = targetPathOf(tool, args, base)
  // Resolve a relative target against the same base the policy uses, not the process cwd.
  const absolute = target === undefined ? undefined : /^([A-Za-z]:)?[\\/]/.test(target) ? target : `${base.replace(/[\\/]$/, '')}/${target}`
  const realPath = absolute === undefined ? undefined : await placed($, absolute)
  return { cwd: base, roots: [root], realRoots: realRoot === undefined ? [] : [realRoot], realPath, home }
}

async function count($: EngineInterface, kind: 'auto' | 'asked') {
  await update($, autopilot, a => ({ ...a, [kind]: a[kind] + 1 }))
}

export function autopilotIoFor($: EngineInterface, office: Office): AutopilotIo {
  return {
    isOn: async () => office.isAutopilot === true,
    context: (tool, args) => contextFor($, tool, args),
    count: kind => count($, kind),
  }
}

/** The question a decision tool puts to the person, cut to 120 chars; undefined for other tools. */
export const decisionOf = (tool: string, args: unknown): string | undefined => {
  if (tool === 'ExitPlanMode') return 'Plan freigeben?'
  if (tool !== 'AskUserQuestion') return undefined
  const first = (args as { questions?: { question?: unknown }[] } | undefined)?.questions?.[0]?.question
  return (typeof first === 'string' && first.trim() ? first.trim() : 'Frage an dich').slice(0, 120)
}
