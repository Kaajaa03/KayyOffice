import { atom, read, update, type EngineInterface } from 'claude-code'
import type { ContextInfo, LimitInfo } from './mapping'
import { DEFAULT_RULES, chooseModel, type Alias } from './routing'
import { parseRules } from './rules'
import type { Office } from './state'
import { statusText } from './status'

const counts = atom({ plugin: 'kayy-office', key: 'counts' } as const, { haiku: 0, sonnet: 0, opus: 0 })
const isOff = atom({ plugin: 'kayy-office', key: 'isOff' } as const, false)
const cost = atom({ plugin: 'kayy-office', key: 'cost' } as const, null as number | null)

export type Usage = { cost?: number; context?: ContextInfo; limit?: LimitInfo }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const pct = (v: number, max: number) => Math.min(max, Math.max(0, Math.round(v)))

/** Cost, context fill and account limit from one `$.session.usage()` call (never with `breakdown`: it can cost tokens). */
export async function readUsage($: EngineInterface): Promise<Usage> {
  try {
    const u = await $.session.usage()
    const out: Usage = {}
    if (isNum(u.cost?.usd)) out.cost = u.cost.usd
    const c = u.context
    if (isNum(c?.percent)) {
      out.context = { percent: pct(c.percent, 100) }
      if (isNum(c.tokens)) out.context.tokens = c.tokens
      if (isNum(c.window)) out.context.window = c.window
    }
    const limits = Array.isArray(u.rateLimits) ? u.rateLimits : []
    const l = limits.find(r => r?.kind === 'five_hour') ?? limits[0]
    if (l !== undefined && typeof l.kind === 'string' && l.kind.length > 0 && isNum(l.percentUsed)) {
      out.limit = { kind: l.kind.slice(0, 20), percent: pct(l.percentUsed, 999) }
    }
    return out
  } catch {
    return {}
  }
}

export async function summary($: EngineInterface) {
  const spent = (await readUsage($)).cost
  if (spent !== undefined) await update($, cost, () => spent)
  return statusText(await read($, counts), spent, !(await read($, isOff)))
}

export async function showStatus($: EngineInterface) {
  $.ui.status(await summary($))
}

export async function loadRules($: EngineInterface, office: Office) {
  if (office.rules !== undefined) return office.rules
  const text = await $.fs.read(`${$.plugin.root}/rules.json`).then(
    t => (typeof t === 'string' ? t : undefined),
    () => undefined,
  )
  const parsed = parseRules(text)
  office.rules = parsed.rules
  if (parsed.isFallback) $.ui.toast('kayy-office: rules.json fehlt oder ist ungültig, nutze Standardregeln')
  return office.rules
}

/** The alias to spawn with, or undefined to leave the spawn's model alone. */
export async function routeFor(
  $: EngineInterface,
  office: Office,
  e: { subagentType: string; prompt?: string; model?: string; fork: boolean },
): Promise<Alias | undefined> {
  if (e.fork) return undefined
  return chooseModel((await loadRules($, office)) ?? DEFAULT_RULES, e)
}

export async function countRoute($: EngineInterface, used: Alias | undefined) {
  if (used !== undefined) await update($, counts, c => ({ ...c, [used]: c[used] + 1 }))
}

export const aliasOf = (model: string | undefined): Alias | undefined =>
  (model ?? '').match(/haiku|sonnet|opus/)?.[0] as Alias | undefined

export async function routerCommand($: EngineInterface, args: string) {
  const arg = args.trim().toLowerCase()
  if (arg === 'on' || arg === 'off') {
    await update($, isOff, () => arg === 'off')
    await showStatus($)
    return { text: `Routing ${arg}. ${await summary($)}` }
  }
  if (arg === '' || arg === 'status') return { text: await summary($) }
  return { text: 'Usage: /router [status|on|off]' }
}
