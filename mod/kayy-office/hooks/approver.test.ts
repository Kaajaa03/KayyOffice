import { expect, test } from 'claude-code/testing'
import { ASK_TIMEOUT_MS, NEVER_FORWARD, PANE_ONLY_MS, approve, shouldForward, type ApproverIo, type CheckEvent, type Verdict } from './approver'
import type { Decision } from './overlay'

// The approver's core is pure over its IO: a fake overlay, pane and clock stand in for `$`.
const fakeIo = (overlay: () => Promise<Decision | undefined>, isPane = false) => {
  const timers: { at: number; fn: () => void; isCancelled: boolean }[] = []
  const asked: unknown[] = []
  const shown: string[] = []
  const hidden: string[] = []
  let now = 0
  const io: ApproverIo = {
    ask: payload => (asked.push(payload), overlay()),
    isPaneShown: async () => isPane,
    show: async row => void shown.push(`${row.tool}: ${row.summary}`),
    hide: async id => void hidden.push(id),
    after: (ms, fn) => {
      const t = { at: now + ms, fn, isCancelled: false }
      timers.push(t)
      return { cancel: () => void (t.isCancelled = true) }
    },
    waiters: new Map(),
  }
  const advance = async (ms: number) => {
    now += ms
    for (const t of timers) if (!t.isCancelled && t.at <= now) (t.isCancelled = true), t.fn()
    await tick()
  }
  return { io, asked, shown, hidden, advance }
}
const tick = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

const CALL: CheckEvent = { tool: 'Bash', input: { command: 'rm -rf build' }, tool_use_id: 'tu1', approver: 'person' }
const ASK: Verdict = { decision: 'ask', reason: 'core rule' }

test('a forwardable core ask answered allow or deny is returned with reason Kayy Office', async () => {
  for (const d of ['allow', 'deny'] as const) {
    const { io, asked } = fakeIo(async () => d)
    expect(await approve(io, CALL, ASK, 's1')).toEqual({ decision: d, reason: 'Kayy Office' })
    expect(asked).toEqual([{ sessionId: 's1', agentId: 's1', tool: 'Bash', summary: 'rm -rf build' }])
  }
})

test('an overlay ask, an error or the overlay off returns core unchanged', async () => {
  for (const overlay of [async () => 'ask' as const, async () => undefined, () => Promise.reject(new Error('x'))]) {
    const { io } = fakeIo(overlay)
    expect(await approve(io, CALL, ASK, 's1')).toBe(ASK)
  }
})

test('no answer within 20 s returns core', async () => {
  const { io, advance } = fakeIo(() => new Promise(() => undefined))
  const verdict = approve(io, CALL, ASK, 's1')
  await tick()
  await advance(ASK_TIMEOUT_MS - 1)
  let settled = false
  void verdict.then(() => (settled = true))
  await tick()
  expect(settled).toBe(false)
  await advance(1)
  expect(await verdict).toBe(ASK)
})

test('a core allow or deny is never forwarded and never changed', async () => {
  for (const decision of ['allow', 'deny'] as const) {
    const { io, asked } = fakeIo(async () => 'allow')
    const core: Verdict = { decision }
    expect(await approve(io, CALL, core, 's1')).toBe(core)
    expect(asked).toEqual([])
  }
})

test('only a real call put to a person is forwarded', () => {
  expect(shouldForward(CALL, ASK)).toBe(true)
  expect(shouldForward({ ...CALL, tool_use_id: undefined }, ASK)).toBe(false) // a plugin's $.tool.check query
  expect(shouldForward({ ...CALL, approver: 'host' }, ASK)).toBe(false) // SDK / desktop host callback
  expect(shouldForward({ ...CALL, approver: undefined }, ASK)).toBe(false) // nobody can be asked (headless)
  expect(shouldForward({ ...CALL, tool: 'ExitPlanMode' }, ASK)).toBe(false)
  expect(shouldForward({ ...CALL, tool: 'AskUserQuestion' }, ASK)).toBe(false) // a question is no allow/deny card
})

test('only ExitPlanMode is never forwarded; AskUserQuestion has its own card path', () => {
  expect([...NEVER_FORWARD]).toEqual(['ExitPlanMode'])
})

test('a query, a host approver or ExitPlanMode never reaches the overlay', async () => {
  const { io, asked } = fakeIo(async () => 'allow')
  for (const e of [{ ...CALL, tool_use_id: undefined }, { ...CALL, approver: 'host' }, { ...CALL, tool: 'ExitPlanMode' }]) {
    expect(await approve(io, e, ASK, 's1')).toBe(ASK)
  }
  expect(asked).toEqual([])
})

test('with the pane shown, the first answer wins: the pane before a silent overlay', async () => {
  const { io, shown, hidden } = fakeIo(() => new Promise(() => undefined), true)
  const verdict = approve(io, CALL, ASK, 's1')
  await tick()
  expect(shown).toEqual(['Bash: rm -rf build'])
  io.waiters.get('tu1')!('deny')
  io.waiters.get('tu1')?.('allow') // a second answer changes nothing
  expect(await verdict).toEqual({ decision: 'deny', reason: 'Kayy Office' })
  expect(hidden).toEqual(['tu1'])
  expect(io.waiters.size).toBe(0)
})

test('with the pane shown, an overlay answer wins and the card is released', async () => {
  const { io, hidden } = fakeIo(async () => 'allow', true)
  expect(await approve(io, CALL, ASK, 's1')).toEqual({ decision: 'allow', reason: 'Kayy Office' })
  expect(hidden).toEqual(['tu1'])
})

test('with the overlay off, the pane alone is waited on for 7 s, then core', async () => {
  const { io, advance } = fakeIo(async () => undefined, true)
  const verdict = approve(io, CALL, ASK, 's1')
  await tick()
  await advance(PANE_ONLY_MS)
  expect(await verdict).toBe(ASK)
})

test('the pane button Dialog hands the ask back to core', async () => {
  const { io } = fakeIo(() => new Promise(() => undefined), true)
  const verdict = approve(io, CALL, ASK, 's1')
  await tick()
  io.waiters.get('tu1')!('ask')
  expect(await verdict).toBe(ASK)
})
