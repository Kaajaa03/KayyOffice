import { expect, mock, test } from 'claude-code/testing'
import { equalsConstantTime, hmacHex } from './sha256'

const TOKEN = 'tok-123'
const PORT = 47821
const CONFIG = JSON.stringify({ token: TOKEN, port: PORT })

type Sent = { url: string; headers: Record<string, string>; raw: string; body: any; isAuthentic: boolean }
type Reply = { status: number; ok: boolean; headers: Record<string, string>; text: string }

type Options = {
  config?: string | Error
  eventsFail?: boolean
  core?: () => 'allow' | 'ask' | 'deny'
  permission?: (req: Sent) => Reply | Promise<Reply>
  toolResult?: any | (() => any)
  isPaneOpen?: boolean
  askByDefault?: boolean
  noSessionId?: boolean
  noToastHook?: boolean
}

const proven = (req: Sent, decision: string): Reply => ({
  status: 200,
  ok: true,
  headers: { 'x-kayy-proof': hmacHex(TOKEN, `res|${req.headers['x-kayy-nonce']}|${decision}`) },
  text: JSON.stringify({ decision }),
})

/** The fake overlay checks auth as the real one does: HMAC over nonce, path and the exact body. */
const isAuthentic = (path: string, headers: Record<string, string>, raw: string) => {
  const nonce = headers['x-kayy-nonce'] ?? ''
  return /^[0-9a-f]{32}$/.test(nonce) && equalsConstantTime(headers['x-kayy-auth'] ?? '', hmacHex(TOKEN, `req|${nonce}|${path}|${raw}`))
}

// Events leave fire-and-forget through a queue of $ calls: let it drain.
const flush = async (clock: { settle: () => Promise<void> }) => {
  for (let i = 0; i < 20; i++) await clock.settle()
}

const setup = async ($: any, on: any, o: Options = {}) => {
  const clock = mock.clock(on, { now: 1_000 })
  mock.env(on, { APPDATA: 'C:/Users/me/AppData/Roaming' })
  const sent: Sent[] = []
  const reads: string[] = []
  const opened: string[] = []
  const config = o.config ?? CONFIG
  on('fs.read', (_: any, e: any) => {
    reads.push(e.path)
    if (!e.path.endsWith('config.json')) return { value: '{}' }
    return config instanceof Error ? { deny: config.message } : { value: config }
  })
  on('http.fetch', async (_: any, e: any) => {
    const raw: string = e.init?.body ?? ''
    const path = new URL(e.url).pathname
    const headers = e.init?.headers ?? {}
    const req: Sent = { url: e.url, headers, raw, body: JSON.parse(raw || 'null'), isAuthentic: isAuthentic(path, headers, raw) }
    sent.push(req)
    if (!req.isAuthentic) return { value: { status: 401, ok: false, headers: {}, text: '' } }
    if (e.url.endsWith('/permission')) {
      if (o.permission === undefined) return { deny: 'ECONNREFUSED' }
      return { value: await o.permission(req) }
    }
    return o.eventsFail ? { deny: 'ECONNREFUSED' } : { value: { status: 204, ok: true, headers: {}, text: '' } }
  })
  on('session.id', () => (o.noSessionId ? { deny: 'no id' } : { value: 's1' }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [], cost: { usd: 0.42 } } }))
  on('command.register', (_: any, e: any) => ({ value: { command: e.name } }))
  on('ui.status', () => ({ value: undefined }))
  if (!o.noToastHook) on('ui.toast', () => ({ value: undefined }))
  on('ui.panes', () => ({
    value: o.isPaneOpen ? [{ id: 'kayy-office', title: 'Kayy Office', isShown: true, isFocused: false, isPlaced: true }] : [],
  }))
  on('ui.open', (_: any, e: any) => (opened.push('open:' + e.id), { value: { isPlaced: true } }))
  on('ui.close', (_: any, e: any) => (opened.push('close:' + e.id), { value: undefined }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('session.end', (_: any, e: any) => ({ sessionId: e.sessionId }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', () => (typeof o.toolResult === 'function' ? o.toolResult() : o.toolResult) ?? { result: {} })
  on('tool.check', () => ({ decision: o.core?.() ?? (o.permission || o.isPaneOpen || o.askByDefault ? 'ask' : 'allow') }))
  on('agent.spawn', (_: any, e: any) => ({ model: e.model ?? 'claude-sonnet-x', agentId: 'a1' }))
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  await flush(clock)
  return { sent, reads, opened, clock, events: () => sent.filter(s => s.url.endsWith('/event')).map(s => s.body) }
}

// ---------- event mapping ----------

test('maps session, tool, subagent, turn and end to overlay events', async ($: any, on: any) => {
  const { sent, clock, events, reads } = await setup($, on)
  await $.tool.call({ tool: 'Read', file_path: '/proj/src/a.ts' })
  await $.agent.spawn({ prompt: 'suche x', description: 'd', subagentType: 'Explore' })
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId: 't1', agentId: 'a1' })
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId: 't2' })
  await $.session.end({ reason: 'other', sessionId: 's1', resume: {} as any })
  await flush(clock)

  expect(reads.some(p => /AppData[\\/]Roaming[\\/]KayyOffice[\\/]config\.json$/.test(p))).toBe(true)
  expect(sent[0]!.url).toBe(`http://127.0.0.1:${PORT}/event`)
  // The token never travels: every request is signed with a fresh nonce instead.
  expect(sent.every(s => s.isAuthentic)).toBe(true)
  expect(sent.some(s => 'x-kayy-token' in s.headers || JSON.stringify(s.headers).includes(TOKEN) || s.raw.includes(TOKEN))).toBe(false)
  expect(new Set(sent.map(s => s.headers['x-kayy-nonce'])).size).toBe(sent.length)
  const base = { ts: 1_000, sessionId: 's1', cwd: '/proj' }
  expect(events()).toEqual([
    { ...base, agentId: 's1', event: 'SessionStart', model: 'claude-opus-5-5', costUsd: 0.42 },
    { ...base, agentId: 's1', event: 'PreToolUse', tool: 'Read', file: '/proj/src/a.ts', model: 'claude-opus-5-5' },
    { ...base, agentId: 's1', event: 'PostToolUse', tool: 'Read', file: '/proj/src/a.ts', model: 'claude-opus-5-5' },
    { ...base, agentId: 'a1', parentId: 's1', event: 'SubagentStart', agentType: 'Explore', model: 'haiku' },
    { ...base, agentId: 'a1', parentId: 's1', event: 'SubagentStop', agentType: 'Explore', model: 'haiku' },
    { ...base, agentId: 's1', event: 'Stop', model: 'claude-opus-5-5', costUsd: 0.42 },
    { ...base, agentId: 's1', event: 'SessionEnd' },
  ])
})

test('a routed spawn reports the chosen model; a caller model and a resume keep theirs', async ($: any, on: any) => {
  const { clock, events } = await setup($, on)
  await $.agent.spawn({ prompt: 'implement x', description: 'd', subagentType: 'Plan' })
  await $.agent.spawn({ prompt: 'x', description: 'd', subagentType: 'Explore', model: 'sonnet' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await flush(clock)
  const starts = events().filter(e => e.event === 'SubagentStart')
  expect(starts.map(e => [e.agentType, e.model])).toEqual([
    ['Plan', 'opus'],
    ['Explore', 'sonnet'],
  ])
  // A Bash command is never guessed into `file`.
  expect(events().find(e => e.event === 'PreToolUse').file).toBeUndefined()
})

test('a failed tool is reported as ERROR: <tool> failed, without its output', async ($: any, on: any) => {
  const secret = 'AKIA-SECRET-OUTPUT'
  const { clock, events, sent } = await setup($, on, { toolResult: { isError: true, result: secret, text: secret } })
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await flush(clock)
  expect(events().find(e => e.event === 'PostToolUse').message).toBe('ERROR: Bash failed')
  expect(sent.some(s => s.raw.includes(secret))).toBe(false)
})

// ---------- silent failure and back-off ----------

test('a missing config sends nothing and never breaks the tool call', async ($: any, on: any) => {
  const { sent, clock } = await setup($, on, { config: new Error('ENOENT') })
  const ran = await $.tool.call({ tool: 'Bash', command: 'ls' })
  await flush(clock)
  expect(ran.deny).toBeUndefined()
  expect(sent).toEqual([])
})

test('a session that cannot say its id sends nothing and changes no result', async ($: any, on: any) => {
  const { sent, clock } = await setup($, on, { noSessionId: true, askByDefault: true, permission: req => proven(req, 'allow') })
  const ran = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(ran.deny).toBeUndefined()
  expect((await $.tool.check({ tool: 'Bash', input: { command: 'x' } })).decision).toBe('ask')
  await flush(clock)
  expect(sent).toEqual([])
})

test('after a failed send the overlay is left alone for 30 s, then tried again', async ($: any, on: any) => {
  const { sent, clock } = await setup($, on, { eventsFail: true })
  expect(sent.length).toBe(1) // SessionStart failed
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await flush(clock)
  expect(sent.length).toBe(1) // paused: Pre and Post dropped
  await clock.advance(29_000)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await flush(clock)
  expect(sent.length).toBe(1)
  await clock.advance(1_001)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await flush(clock)
  expect(sent.length).toBe(2) // one retry, which fails and pauses again
})

// ---------- approver (the full matrix runs against a fake IO in approver.test.ts) ----------

test('a $.tool.check query (no tool_use_id, no approver) is never forwarded', async ($: any, on: any) => {
  const { sent } = await setup($, on, { permission: req => proven(req, 'allow') })
  expect(await $.tool.check({ tool: 'Bash', input: { command: 'rm -rf build' } })).toEqual({ decision: 'ask' })
  expect(sent.filter(s => s.url.endsWith('/permission'))).toEqual([])
})

test('a tool call decided without a person (background loop) is never forwarded', async ($: any, on: any) => {
  const { sent, clock } = await setup($, on, { permission: req => proven(req, 'allow') })
  await $.tool.call({ tool: 'Bash', command: 'rm -rf build' })
  await flush(clock)
  expect(sent.filter(s => s.url.endsWith('/permission'))).toEqual([])
})

test('a core deny or allow stays as it is', async ($: any, on: any) => {
  let core: 'deny' | 'allow' = 'deny'
  const { sent } = await setup($, on, { core: () => core, permission: req => proven(req, 'allow') })
  expect((await $.tool.check({ tool: 'Bash', input: { command: 'x' } })).decision).toBe('deny')
  core = 'allow'
  expect((await $.tool.check({ tool: 'Bash', input: { command: 'x' } })).decision).toBe('allow')
  expect(sent.filter(s => s.url.endsWith('/permission'))).toEqual([])
})

// ---------- pane ----------

const PANE = {
  plugin: 'kayy-office',
  component: 'Pane',
  requestId: 'kayy-office',
  props: {
    title: 'Kayy Office',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('the pane lists agents with model chips, cost and router counts on every surface', async ($: any, on: any) => {
  await setup($, on)
  await $.agent.spawn({ prompt: 'suche x', description: 'd', subagentType: 'Explore' })
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Haupt-Agent/ }))?.text).toContain('wartet')
    expect((await ui.find({ type: 'Text', text: /Explore/ }))?.text).toMatch(/^ {2}● läuft Explore.*\[H\]/)
    expect((await ui.find({ type: 'Text', text: /Kosten/ }))?.text).toBe('Kosten: $0.42')
    expect((await ui.find({ type: 'Text', text: /^Router/ }))?.text).toBe('Router: haiku 1 · sonnet 0 · opus 0')
    await ui.unmount()
  }
})

test('a pending ask is drawn on the pane with Erlauben, Ablehnen and Dialog', async ($: any, on: any) => {
  on('state.get', { key: 'pending' }, () => ({
    value: { value: { shape: 'pending-1', value: [{ id: 'tu1', agentId: 's1', tool: 'Bash', summary: 'npm publish' }] }, version: 1 },
  }))
  await setup($, on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /npm publish/ }))?.text).toBe('Bash: npm publish')
    const keys = (await ui.findAll({ type: 'Button' })).map((b: any) => b.key)
    expect(keys).toEqual(['allow-tu1', 'deny-tu1', 'ask-tu1'])
    await ui.unmount()
  }
})

test('the kayy-router hint is shown once, not on every start', async ($: any, on: any) => {
  const toasts: string[] = []
  mock.store(on)
  on('ui.toast', (_: any, e: any) => (toasts.push(e.text), { value: undefined }))
  await setup($, on, { noToastHook: true })
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  expect(toasts.filter(t => t.includes('kayy-router'))).toHaveLength(1)
})

// ---------- /office ----------

test('/office opens the pane, closes it when open, and /office status sums up', async ($: any, on: any) => {
  const { opened } = await setup($, on)
  expect((await $.command.run({ command: 'office', args: '' })).text).toBe('Kayy Office geöffnet.')
  expect(opened).toEqual(['open:kayy-office'])
  expect((await $.command.run({ command: 'office', args: 'status' })).text).toContain('Kosten: $0.42')
  expect((await $.command.run({ command: 'office', args: 'x' })).text).toContain('Nutzung: /office [status]')
})

test('/office closes an open pane', async ($: any, on: any) => {
  const { opened } = await setup($, on, { isPaneOpen: true })
  expect((await $.command.run({ command: 'office', args: '' })).text).toBe('Kayy Office geschlossen.')
  expect(opened).toEqual(['close:kayy-office'])
})

// ---------- progress (WP3) ----------

const todos = (...s: string[]) => ({ tool: 'TodoWrite', todos: s.map((status, i) => ({ content: `Task ${i}`, status, activeForm: `Task ${i} läuft` })) })
const posts = (events: () => any[]) => events().filter(e => e.event === 'PostToolUse')

test('TodoWrite sends progress on PostToolUse, only when it changed for that agent', async ($: any, on: any) => {
  const { clock, events } = await setup($, on)
  await $.tool.call(todos('in_progress', 'pending'))
  await $.tool.call(todos('in_progress', 'pending'))
  await $.tool.call(todos('completed', 'in_progress'))
  await $.tool.call({ ...todos('in_progress', 'pending'), agentId: 'a9' })
  await flush(clock)
  expect(posts(events).map(e => e.progress)).toEqual([
    { done: 0, total: 2, current: 'Task 0 läuft' },
    undefined,
    { done: 1, total: 2, current: 'Task 1 läuft' },
    { done: 0, total: 2, current: 'Task 0 läuft' },
  ])
  expect(events().filter(e => e.event === 'PreToolUse').every(e => e.progress === undefined)).toBe(true)
})

test('progress is never sent for other tools or invalid lists', async ($: any, on: any) => {
  const { clock, events } = await setup($, on)
  await $.tool.call({ tool: 'Bash', command: 'ls', todos: [{ content: 'x', status: 'pending' }] })
  await $.tool.call({ tool: 'TodoWrite', todos: [] })
  await $.tool.call({ tool: 'TodoWrite', todos: 'nope' })
  await flush(clock)
  expect(events().some(e => 'progress' in e)).toBe(false)
})

test('after Stop the same list is sent again', async ($: any, on: any) => {
  const { clock, events } = await setup($, on)
  await $.tool.call(todos('pending'))
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId: 't1' })
  await $.tool.call(todos('pending'))
  await flush(clock)
  expect(posts(events).map(e => e.progress)).toEqual([{ done: 0, total: 1 }, { done: 0, total: 1 }])
})

test('a failed TodoWrite sends no progress', async ($: any, on: any) => {
  const { clock, events } = await setup($, on, { toolResult: { isError: true, result: 'x' } })
  await $.tool.call(todos('pending'))
  await flush(clock)
  expect(events().some(e => 'progress' in e)).toBe(false)
})

test('progress with an unreachable overlay changes no result', async ($: any, on: any) => {
  const { sent, clock } = await setup($, on, { eventsFail: true })
  const ran = await $.tool.call(todos('in_progress'))
  await flush(clock)
  expect(ran.deny).toBeUndefined()
  expect(sent.length).toBe(1)
})

test('the pane shows "3/7 · current" per agent and clears it on Stop', async ($: any, on: any) => {
  await setup($, on)
  await $.tool.call({ tool: 'TodoWrite', todos: [...Array(3).fill({ content: 'a', status: 'completed' }), { content: 'Datei anlegen', status: 'in_progress', activeForm: 'Lege Datei an' }, ...Array(3).fill({ content: 'b', status: 'pending' })] })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /Haupt-Agent/ }))?.text).toContain('3/7 · Lege Datei an')
  await ui.unmount()
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId: 't1' })
  const ui2 = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui2.find({ type: 'Text', text: /Haupt-Agent/ }))?.text).not.toMatch(/\d\/\d/)
  await ui2.unmount()
})

test('a subagent keeps its own progress until its own turn completes', async ($: any, on: any) => {
  await setup($, on)
  await $.agent.spawn({ prompt: 'x', description: 'd', subagentType: 'Explore' })
  await $.tool.call({ ...todos('completed', 'pending'), agentId: 'a1' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /Explore/ }))?.text).toContain('1/2')
  expect((await ui.find({ type: 'Text', text: /Haupt-Agent/ }))?.text).not.toMatch(/\d\/\d/)
  await ui.unmount()
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId: 't2', agentId: 'a1' })
  const ui2 = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui2.find({ type: 'Text', text: /Explore/ }))?.text).not.toMatch(/\d\/\d/)
  await ui2.unmount()
})

// ---------- progress clear (null) ----------

const empty = { tool: 'TodoWrite', todos: [] as unknown[] }

test('an empty list after a real one sends exactly one progress null; a second empty list sends nothing', async ($: any, on: any) => {
  const { clock, events } = await setup($, on)
  await $.tool.call(todos('in_progress', 'pending'))
  await $.tool.call(empty)
  await $.tool.call(empty)
  await flush(clock)
  expect(posts(events).map(e => e.progress)).toEqual([{ done: 0, total: 2, current: 'Task 0 läuft' }, null, undefined])
  expect(posts(events)[2]).not.toHaveProperty('progress')
})

test('after a null the same list is sent again', async ($: any, on: any) => {
  const { clock, events } = await setup($, on)
  await $.tool.call(todos('pending'))
  await $.tool.call(empty)
  await $.tool.call(todos('pending'))
  await flush(clock)
  expect(posts(events).map(e => e.progress)).toEqual([{ done: 0, total: 1 }, null, { done: 0, total: 1 }])
})

test('an empty list sends nothing when no progress was ever sent', async ($: any, on: any) => {
  const { clock, events } = await setup($, on)
  await $.tool.call(empty)
  await flush(clock)
  expect(events().some(e => 'progress' in e)).toBe(false)
})

test('a malformed todos value sends nothing and keeps the stored progress', async ($: any, on: any) => {
  const { clock, events } = await setup($, on)
  await $.tool.call(todos('pending'))
  await $.tool.call({ tool: 'TodoWrite', todos: 'nope' })
  await $.tool.call({ tool: 'TodoWrite' })
  await $.tool.call(todos('pending'))
  await flush(clock)
  expect(posts(events).map(e => e.progress)).toEqual([{ done: 0, total: 1 }, undefined, undefined, undefined])
})

test('more than 99 items behave like an empty list', async ($: any, on: any) => {
  const { clock, events } = await setup($, on)
  await $.tool.call(todos('pending'))
  await $.tool.call(todos(...Array(100).fill('pending')))
  await $.tool.call(todos(...Array(100).fill('pending')))
  await flush(clock)
  expect(posts(events).map(e => e.progress)).toEqual([{ done: 0, total: 1 }, null, undefined])
})

test('a failed or denied empty TodoWrite sends no null and keeps the stored progress', async ($: any, on: any) => {
  let result: any
  const { clock, events } = await setup($, on, { toolResult: () => result })
  await $.tool.call(todos('pending'))
  result = { isError: true, result: 'x' }
  await $.tool.call(empty)
  result = { deny: 'nein' }
  await $.tool.call(empty)
  result = undefined
  await $.tool.call(empty)
  await flush(clock)
  expect(posts(events).map(e => e.progress)).toEqual([{ done: 0, total: 1 }, undefined, undefined, null])
})

test('a null with an unreachable overlay changes no result', async ($: any, on: any) => {
  const { sent, clock } = await setup($, on, { eventsFail: true })
  await $.tool.call(todos('in_progress'))
  const ran = await $.tool.call(empty)
  await flush(clock)
  expect(ran.deny).toBeUndefined()
  expect(sent.length).toBe(1)
})

test('the pane drops "3/7" when the list is cleared', async ($: any, on: any) => {
  await setup($, on)
  await $.tool.call(todos('completed', 'pending'))
  await $.tool.call(empty)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /Haupt-Agent/ }))?.text).not.toMatch(/\d\/\d/)
  await ui.unmount()
})
