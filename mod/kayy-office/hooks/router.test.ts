import { expect, test } from 'claude-code/testing'

const setup = async ($: any, on: any, rulesText: string | Error) => {
  const models: (string | undefined)[] = []
  const statuses: (string | undefined)[] = []
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('fs.read', () => (rulesText instanceof Error ? Promise.reject(rulesText) : { value: rulesText }))
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [], cost: { usd: 0.42 } } }))
  on('turn.complete', () => ({ text: '' }))
  on('command.register', () => ({ value: { command: 'router' } }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', (_: any, e: any) => (statuses.push(e.text), { value: undefined }))
  on('agent.spawn', (_: any, e: any) => {
    models.push(e.model)
    return { model: e.model ?? 'inherit', agentId: 'a' + models.length }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  return { models, statuses }
}

const spawn = ($: any, subagentType: string, model?: string) =>
  $.agent.spawn({ prompt: 'suche x', description: 'd', subagentType, model })

test('routes a spawn, keeps a caller model, and shows counts and cost', async ($, on) => {
  const { models, statuses } = await setup($, on, '{}')
  await spawn($, 'Explore')
  await spawn($, 'Explore', 'opus')
  expect(models).toEqual(['haiku', 'opus'])
  expect(statuses.at(-1)).toBe('haiku 1 · opus 1 · $0.42')
})

test('a failing rules read still lets spawns through on defaults', async ($, on) => {
  const { models } = await setup($, on, new Error('missing'))
  await spawn($, 'Plan')
  expect(models).toEqual(['opus'])
})

test('a resumed agent is neither rerouted nor counted', async ($, on) => {
  const { models, statuses } = await setup($, on, '{}')
  await $.agent.spawn({ prompt: 'x', description: 'd', subagentType: 'Explore', resume: { agentId: 'a1' } } as any)
  expect(models).toEqual([undefined])
  expect(statuses).toEqual([])
})

test('the status line is refreshed when a turn completes', async ($, on) => {
  const { statuses } = await setup($, on, '{}')
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId: 't1' })
  expect(statuses.at(-1)).toBe('Router bereit · $0.42')
})

const run = ($: any, args: string) => $.command.run({ command: 'router', args })

test('/router off stops routing and counting, /router on resumes it', async ($, on) => {
  const { models } = await setup($, on, '{}')
  const off = await run($, 'off')
  expect(off.text).toContain('off')
  await spawn($, 'Explore')
  expect(models).toEqual([undefined])
  const onAgain = await run($, 'on')
  expect(onAgain.text).toContain('on')
  await spawn($, 'Explore')
  expect(models).toEqual([undefined, 'haiku'])
})

test('/router shows the counts, and an unknown argument shows the usage', async ($, on) => {
  await setup($, on, '{}')
  await spawn($, 'Explore')
  expect((await run($, '')).text).toContain('haiku 1')
  expect((await run($, 'status')).text).toContain('haiku 1')
  expect((await run($, 'nope')).text).toContain('/router [status|on|off]')
})
