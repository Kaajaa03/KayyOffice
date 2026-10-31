import { expect, mock, test } from 'claude-code/testing'
import { ORCHESTRATOR_ID, ORCHESTRATOR_TEXT, withOrchestrator } from './orchestrator'

const CONFIG = JSON.stringify({ token: 'tok-1', port: 47821 })
const ENGINE = [
  { id: 'intro', text: 'You are Claude Code.', scope: 'shared' as const },
  { id: 'env', text: 'cwd: /proj', scope: 'session' as const },
]

const flush = async (clock: { settle: () => Promise<void> }) => {
  for (let i = 0; i < 20; i++) await clock.settle()
}

const setup = async ($: any, on: any, store: Record<string, unknown> = {}) => {
  const clock = mock.clock(on, { now: 5 })
  mock.env(on, { APPDATA: 'C:/AppData' })
  mock.store(on, store)
  const events: any[] = []
  on('fs.read', (_: any, e: any) => ({ value: e.path.endsWith('config.json') ? CONFIG : '{}' }))
  on('http.fetch', (_: any, e: any) => {
    if (e.url.endsWith('/event')) events.push(JSON.parse(e.init.body))
    return { value: { status: 204, ok: true, headers: {}, text: '' } }
  })
  on('session.id', () => ({ value: 's1' }))
  on('session.cwd', () => ({ value: 'C:\\proj' }))
  on('session.root', () => ({ value: 'C:\\proj' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [], cost: { usd: 0.1 } } }))
  on('command.register', (_: any, e: any) => ({ value: { command: e.name } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.panes', () => ({ value: [] }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('tool.check', (_: any, e: any) => ({ decision: e.tool === 'Bash' ? 'ask' : 'allow' }))
  on('prompt.compose', () => ({ sections: ENGINE }))
  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })
  await flush(clock)
  return { clock, events }
}

const run = ($: any, args: string) => $.command.run({ command: 'office', args })

const PANE = {
  plugin: 'kayy-office',
  component: 'Pane',
  requestId: 'kayy-office',
  surface: 'desktop',
  props: { title: 'Kayy Office', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

// ---------- orchestration policy (pure) ----------

test('the policy text is lean English: at most 100 words, names all five agents and the cold start', () => {
  expect(ORCHESTRATOR_TEXT.split(/\s+/).filter(Boolean).length <= 100).toBe(true)
  for (const word of ['kayy-scout', 'kayy-coder', 'kayy-tester', 'kayy-reviewer', 'kayy-architect', 'codex-worker', 'cold', 'irreversible', 'assumption']) {
    expect(ORCHESTRATOR_TEXT).toContain(word)
  }
})

test('on appends exactly one session section at the end; off leaves the list alone', () => {
  const on = withOrchestrator(ENGINE, true)
  expect(on.slice(0, 2)).toEqual(ENGINE)
  expect(on.at(-1)).toEqual({ id: ORCHESTRATOR_ID, text: ORCHESTRATOR_TEXT, scope: 'session' })
  expect(withOrchestrator(on, true)).toEqual(on) // never twice
  expect(withOrchestrator(ENGINE, false)).toEqual(ENGINE)
  expect(withOrchestrator(on, false)).toEqual(ENGINE)
})

// ---------- integration ----------

const COMPOSE = { model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['desktop'], tools: [], outputStyle: null, traits: [] }
const compose = async ($: any) => (await $.prompt.compose(COMPOSE)).sections

test('the system prompt gets the policy by default, and not once it is switched off', async ($: any, on: any) => {
  await setup($, on)
  const first = await compose($)
  expect(first.filter((s: any) => s.id === ORCHESTRATOR_ID)).toHaveLength(1)
  expect(first.at(-1)).toEqual({ id: ORCHESTRATOR_ID, text: ORCHESTRATOR_TEXT, scope: 'session' })
  expect(first.slice(0, 2)).toEqual(ENGINE)
  expect((await run($, 'orchestrator off')).text).toContain('Orchestrator aus')
  expect(await compose($)).toEqual(ENGINE)
  expect((await run($, 'orchestrator status')).text).toContain('Orchestrator aus')
  expect((await run($, 'status')).text).toContain('Orchestrator aus')
  expect((await run($, 'orchestrator on')).text).toContain('Orchestrator an')
  expect((await compose($)).filter((s: any) => s.id === ORCHESTRATOR_ID)).toHaveLength(1)
})

test('orchestrator off is remembered in the store across sessions', async ($: any, on: any) => {
  await setup($, on, { orchestrator: false })
  expect(await compose($)).toEqual(ENGINE)
})

const restart = ($: any) => $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })

test('autopilot is off by default; /office autopilot on|off|status persists and reports', async ($: any, on: any) => {
  await setup($, on)
  expect((await run($, 'autopilot status')).text).toBe('Autopilot aus · 0 automatisch · 0 gefragt')
  expect((await run($, 'autopilot on')).text).toContain('Autopilot an')
  expect((await run($, 'autopilot on')).text).toContain('Nur für eigene, vertrauenswürdige Projekte')
  await restart($) // a new session reads the switch back from the store
  expect((await run($, 'autopilot')).text).toBe('Autopilot an · 0 automatisch · 0 gefragt')
  expect((await run($, 'status')).text).toContain('Autopilot an · 0 automatisch · 0 gefragt')
  expect((await run($, 'status')).text).toContain('Orchestrator an')
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /^Autopilot/ }))?.text).toBe('Autopilot an · 0 automatisch · 0 gefragt')
  await ui.unmount()
  expect((await run($, 'autopilot off')).text).toContain('Autopilot aus')
  await restart($)
  expect((await run($, 'autopilot status')).text).toBe('Autopilot aus · 0 automatisch · 0 gefragt')
})

test('autopilot on never allows a check without a person or a real call', async ($: any, on: any) => {
  await setup($, on, { autopilot: true })
  // $.tool.check is a query: no tool_use_id, no approver.
  expect(await $.tool.check({ tool: 'Bash', input: { command: 'git status' } })).toEqual({ decision: 'ask' })
  expect((await run($, 'autopilot status')).text).toBe('Autopilot an · 0 automatisch · 0 gefragt')
})

test('an unknown /office argument shows the usage', async ($: any, on: any) => {
  await setup($, on)
  expect((await run($, 'autopilot maybe')).text).toContain('Nutzung: /office')
  expect((await run($, 'orchestrator on now')).text).toContain('Nutzung: /office')
})

test('AskUserQuestion signals a pending decision to the overlay and the pane', async ($: any, on: any) => {
  let release: () => void = () => undefined
  on('tool.call', (_: any, e: any) =>
    e.tool === 'AskUserQuestion' ? new Promise(r => (release = () => r({ result: {} }))) : { result: {} },
  )
  const { clock, events } = await setup($, on)
  const question = 'Welche Datenbank sollen wir nehmen: Postgres oder SQLite für das lokale Büro? ' + 'x'.repeat(80)
  const asking = $.tool.call({
    tool: 'AskUserQuestion',
    questions: [{ question, header: 'DB', multiSelect: false, options: [{ label: 'A', description: 'a' }, { label: 'B', description: 'b' }] }],
  })
  await flush(clock)
  let ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /Entscheidung offen/ }))?.text).toBe('Entscheidung offen: ' + question.slice(0, 120))
  await ui.unmount()
  release()
  await asking
  await $.tool.call({ tool: 'ExitPlanMode', plan: 'x' } as any)
  await flush(clock)
  const notes = events.filter(e => e.event === 'Notification')
  expect(notes.map(n => n.message)).toEqual(['Entscheidung: ' + question.slice(0, 120), 'Entscheidung: Plan freigeben?'])
  expect(notes[0].tool).toBe('AskUserQuestion')
  ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /Entscheidung offen/ })).toBeUndefined()
  await ui.unmount()
})
