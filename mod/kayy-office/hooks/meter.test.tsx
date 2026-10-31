import { expect, mock, test } from 'claude-code/testing'

const CONFIG = JSON.stringify({ token: 'tok-1', port: 47821 })

const flush = async (clock: { settle: () => Promise<void> }) => {
  for (let i = 0; i < 20; i++) await clock.settle()
}

type Usage = { context: any; rateLimits: any[]; cost?: { usd: number } }

const setup = async ($: any, on: any, first: Usage) => {
  const clock = mock.clock(on, { now: 5 })
  mock.env(on, { APPDATA: 'C:/AppData' })
  mock.store(on, {})
  const events: any[] = []
  const usageArgs: any[] = []
  const state = { usage: first, isOffered: true }
  on('fs.read', (_: any, e: any) => ({ value: e.path.endsWith('config.json') ? CONFIG : '{}' }))
  on('http.fetch', (_: any, e: any) => {
    if (e.url.endsWith('/event')) events.push(JSON.parse(e.init.body))
    return { value: { status: 204, ok: true, headers: {}, text: '' } }
  })
  on('session.id', () => ({ value: 's1' }))
  on('session.cwd', () => ({ value: 'C:\\proj' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', (_: any, e: any) => (usageArgs.push(e), { value: state.usage }))
  on('command.register', (_: any, e: any) => ({ value: { command: e.name } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.panes', () => ({ value: [] }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('turn.complete', () => ({ text: '' }))
  on('agent.offer', () => ({ isOffered: state.isOffered }))
  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })
  await flush(clock)
  return { clock, events, usageArgs, state }
}

const turn = async ($: any, clock: any) => {
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId: 't' })
  await flush(clock)
}

const PANE = {
  plugin: 'kayy-office',
  component: 'Pane',
  requestId: 'kayy-office',
  surface: 'desktop',
  props: { title: 'Kayy Office', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const usage = (percent: number | undefined, limits: any[] = [], tokens = 340_000): Usage => ({
  context: percent === undefined ? { window: 1_000_000 } : { percent, tokens, window: 1_000_000 },
  rateLimits: limits,
  cost: { usd: 0.1 },
})

// ---------- context + limit ----------

test('session start carries context and the five_hour limit; usage is never asked for a breakdown', async ($: any, on: any) => {
  const { events, usageArgs } = await setup($, on, usage(33.6, [{ kind: 'seven_day', percentUsed: 80 }, { kind: 'five_hour', percentUsed: 20.6 }]))
  const start = events.find(e => e.event === 'SessionStart')
  expect(start.context).toEqual({ percent: 34, tokens: 340_000, window: 1_000_000 })
  expect(start.limit).toEqual({ kind: 'five_hour', percent: 21 })
  expect(usageArgs.length > 0).toBe(true)
  for (const a of usageArgs) expect(a?.breakdown).toBeUndefined()
})

test('without five_hour the first rate limit counts; kind is cut at 20 chars, percent up to 999', async ($: any, on: any) => {
  const { events } = await setup($, on, usage(10, [{ kind: 'spend_limit_with_a_very_long_name', percentUsed: 1500 }]))
  expect(events.find(e => e.event === 'SessionStart').limit).toEqual({ kind: 'spend_limit_with_a_v', percent: 999 })
})

test('unknown parts are omitted, not zeroed', async ($: any, on: any) => {
  const { events } = await setup($, on, usage(undefined, []))
  const start = events.find(e => e.event === 'SessionStart')
  expect('context' in start).toBe(false)
  expect('limit' in start).toBe(false)
})

test('a turn sends the fields only when the rounded percent moved by a point', async ($: any, on: any) => {
  const { clock, events, state } = await setup($, on, usage(34, [{ kind: 'five_hour', percentUsed: 21 }]))
  state.usage = usage(34.4, [{ kind: 'five_hour', percentUsed: 21.4 }]) // same rounded values
  await turn($, clock)
  let stop = events.filter(e => e.event === 'Stop').at(-1)
  expect('context' in stop).toBe(false)
  expect('limit' in stop).toBe(false)
  state.usage = usage(35, [{ kind: 'five_hour', percentUsed: 21 }]) // only context moved
  await turn($, clock)
  stop = events.filter(e => e.event === 'Stop').at(-1)
  expect(stop.context.percent).toBe(35)
  expect('limit' in stop).toBe(false)
  state.usage = usage(35, [{ kind: 'five_hour', percentUsed: 23 }])
  await turn($, clock)
  stop = events.filter(e => e.event === 'Stop').at(-1)
  expect('context' in stop).toBe(false)
  expect(stop.limit).toEqual({ kind: 'five_hour', percent: 23 })
})

test('tool calls never carry context or limit', async ($: any, on: any) => {
  on('tool.call', () => ({ result: {} }))
  const { clock, events } = await setup($, on, usage(34, [{ kind: 'five_hour', percentUsed: 21 }]))
  await $.tool.call({ tool: 'Read', file_path: 'a.ts' })
  await flush(clock)
  const tools = events.filter(e => e.event === 'PreToolUse' || e.event === 'PostToolUse')
  expect(tools.length).toBe(2)
  for (const e of tools) {
    expect('context' in e).toBe(false)
    expect('limit' in e).toBe(false)
  }
})

test('the pane shows one line "Kontext 34 % · 5h 21 %", partial when parts are unknown, none when both are', async ($: any, on: any) => {
  const { clock, state } = await setup($, on, usage(34, [{ kind: 'five_hour', percentUsed: 21 }]))
  let ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /^Kontext/ }))?.text).toBe('Kontext 34 % · 5h 21 %')
  await ui.unmount()
  state.usage = usage(34, [])
  await turn($, clock)
  ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /^Kontext/ }))?.text).toBe('Kontext 34 %')
  await ui.unmount()
  state.usage = usage(undefined, [{ kind: 'seven_day', percentUsed: 7 }])
  await turn($, clock)
  ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /7d 7 %/ }))?.text).toBe('7d 7 %')
  await ui.unmount()
  state.usage = usage(undefined, [])
  await turn($, clock)
  ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /Kontext|7d|5h/ })).toBeUndefined()
  await ui.unmount()
})

// ---------- roster ----------

const offer = ($: any, agent: string, source = 'plugin') =>
  $.agent.offer({ agent, description: 'd', source, provider: { plugin: 'x', tier: 'user' } })
const rosters = (events: any[]) => events.filter(e => e.event === 'Roster')

test('a new non-built-in type sends one Roster event; the offer passes through unchanged', async ($: any, on: any) => {
  const { clock, events } = await setup($, on, usage(1))
  expect(rosters(events)).toHaveLength(0)
  expect(await offer($, 'kayy-scout')).toEqual({ isOffered: true })
  await flush(clock)
  expect(rosters(events)).toHaveLength(1)
  const r = rosters(events)[0]
  expect(r.sessionId).toBe('s1')
  expect(r.agentId).toBe('s1')
  expect(r.cwd).toBe('C:\\proj')
  expect(r.roster).toEqual([{ type: 'kayy-scout', model: 'haiku' }])
})

test('a refused offer stays refused', async ($: any, on: any) => {
  const { clock, events, state } = await setup($, on, usage(1))
  state.isOffered = false
  expect(await offer($, 'kayy-scout')).toEqual({ isOffered: false })
  await flush(clock)
  expect(rosters(events)).toHaveLength(0)
})

test('dedupe, built-in ignored, unchanged set sends nothing; sorted with model only where rules know it', async ($: any, on: any) => {
  const { clock, events } = await setup($, on, usage(1))
  await offer($, 'kayy-scout')
  await offer($, 'kayy-scout')
  await offer($, 'Explore', 'built-in')
  await offer($, 'kayy-architect')
  await offer($, 'codex-worker')
  await flush(clock)
  const all = rosters(events)
  expect(all).toHaveLength(3)
  expect(all.at(-1).roster).toEqual([
    { type: 'codex-worker', model: 'haiku' },
    { type: 'kayy-architect', model: 'opus' },
    { type: 'kayy-scout', model: 'haiku' },
  ])
})

test('the roster is capped at 12 entries and types at 40 chars', async ($: any, on: any) => {
  const { clock, events } = await setup($, on, usage(1))
  for (let i = 0; i < 15; i++) await offer($, 'agent-' + String(i).padStart(2, '0'))
  await offer($, 'x'.repeat(60))
  await flush(clock)
  const last = rosters(events).at(-1).roster
  expect(last).toHaveLength(12)
  for (const r of last) expect(r.type.length <= 40).toBe(true)
})

test('a non-empty roster is sent once more at session start', async ($: any, on: any) => {
  const { clock, events } = await setup($, on, usage(1))
  await offer($, 'kayy-coder')
  await flush(clock)
  const before = rosters(events).length
  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })
  await flush(clock)
  expect(rosters(events)).toHaveLength(before + 1)
  expect(rosters(events).at(-1).roster).toEqual([{ type: 'kayy-coder', model: 'sonnet' }])
})
