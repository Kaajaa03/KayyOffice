import { expect, test } from 'claude-code/testing'
import { askQuestions, askableOf, answersOf, resultOf, updatedInputOf, type QuestionPayload } from './question'
import { QUESTION_TIMEOUT_MS, askQuestion, verifyChoice } from './overlay'
import { newOffice } from './state'
import { hmacHex } from './sha256'

const Q1 = { question: 'Which library?', header: 'Lib', multiSelect: false, options: [{ label: 'dayjs', description: 'small' }, { label: 'luxon', description: 'big' }] }
const Q2 = { question: 'Which style?', header: 'Style', multiSelect: false, options: [{ label: 'A', description: '' }, { label: 'B', description: '' }, { label: 'C', description: '' }] }
const INPUT = { questions: [Q1, Q2] }
const WHO = { sessionId: 's1', agentId: 's1' }

test('single-select choice questions are askable', () => {
  const qs = askableOf(INPUT)!
  expect(qs.map(q => q.question)).toEqual(['Which library?', 'Which style?'])
  expect(qs[1]!.options.map(o => o.label)).toEqual(['A', 'B', 'C'])
})

test('multi select, text, number, odd shapes and duplicates stay with the normal dialog', () => {
  expect(askableOf({ questions: [{ ...Q1, multiSelect: true }] })).toBeUndefined()
  expect(askableOf({ questions: [{ ...Q1, kind: 'text' }] })).toBeUndefined()
  expect(askableOf({ questions: [{ ...Q1, kind: 'number' }] })).toBeUndefined()
  expect(askableOf({ questions: [] })).toBeUndefined()
  expect(askableOf({ questions: [Q1, Q1] })).toBeUndefined() // same question text would collide as a key
  expect(askableOf({ questions: [{ ...Q1, options: [Q1.options[0]] }] })).toBeUndefined()
  expect(askableOf({ questions: [{ ...Q1, options: [{ label: 'x' }, { label: 'x' }] }] })).toBeUndefined()
  expect(askableOf({ questions: [{ ...Q1, options: [{ label: '' }, { label: 'y' }] }] })).toBeUndefined()
  expect(askableOf({ questions: [{ ...Q1, question: '  ' }] })).toBeUndefined()
  expect(askableOf(undefined)).toBeUndefined()
  expect(askableOf('x')).toBeUndefined()
})

test('picks map to { question text: option label }', () => {
  const qs = askableOf(INPUT)!
  expect(answersOf(qs, [1, 2])).toEqual({ 'Which library?': 'luxon', 'Which style?': 'C' })
})

test('a pick out of range, a missing pick or a fractional one gives no answers', () => {
  const qs = askableOf(INPUT)!
  expect(answersOf(qs, [2, 0])).toBeUndefined()
  expect(answersOf(qs, [-1, 0])).toBeUndefined()
  expect(answersOf(qs, [0])).toBeUndefined()
  expect(answersOf(qs, [0.5, 0])).toBeUndefined()
})

test('updatedInput keeps the questions and adds answers (it replaces the whole input)', () => {
  const answers = { 'Which library?': 'dayjs', 'Which style?': 'A' }
  const updated = updatedInputOf(INPUT, answers)
  expect(updated).toEqual({ questions: [Q1, Q2], answers })
  expect(updated.questions).toBe(INPUT.questions)
  expect(resultOf(INPUT, answers)).toEqual({ questions: [Q1, Q2], answers })
})

test('questions are asked in turn, each as a card with its own options', async () => {
  const seen: QuestionPayload[] = []
  const answers = await askQuestions(async p => (seen.push(p), 1), askableOf(INPUT)!, WHO)
  expect(answers).toEqual({ 'Which library?': 'luxon', 'Which style?': 'B' })
  expect(seen).toEqual([
    { ...WHO, tool: 'AskUserQuestion', summary: 'Which library?', options: ['dayjs', 'luxon'] },
    { ...WHO, tool: 'AskUserQuestion', summary: 'Which style?', options: ['A', 'B', 'C'] },
  ])
})

test('one unanswered question (timeout, overlay off) means no answers at all and stops asking', async () => {
  let calls = 0
  const answers = await askQuestions(async () => (++calls === 1 ? 0 : undefined), askableOf(INPUT)!, WHO)
  expect(answers).toBeUndefined()
  expect(calls).toBe(2)
  calls = 0
  expect(await askQuestions(async () => (calls++, undefined), askableOf(INPUT)!, WHO)).toBeUndefined()
  expect(calls).toBe(1)
})

test('a reply counts as a click only with the proof for exactly that index', () => {
  const T = 'tok'
  const nonce = 'ab'.repeat(16)
  const good = (i: number) => ({ headers: { 'x-kayy-proof': hmacHex(T, `res|${nonce}|choice:${i}`) }, text: JSON.stringify({ decision: 'choice', choice: i }) })
  expect(verifyChoice(T, nonce, good(1), 3)).toBe(1)
  expect(verifyChoice(T, nonce, good(3), 3)).toBeUndefined() // out of range
  expect(verifyChoice(T, nonce, { ...good(1), text: JSON.stringify({ decision: 'choice', choice: 2 }) }, 3)).toBeUndefined() // proof is for 1
  expect(verifyChoice(T, nonce, { headers: {}, text: JSON.stringify({ decision: 'choice', choice: 0 }) }, 3)).toBeUndefined()
  expect(verifyChoice('other', nonce, good(0), 3)).toBeUndefined()
  expect(verifyChoice(T, 'cd'.repeat(16), good(0), 3)).toBeUndefined()
  expect(verifyChoice(T, nonce, { headers: { 'x-kayy-proof': hmacHex(T, `res|${nonce}|allow`) }, text: JSON.stringify({ decision: 'allow' }) }, 3)).toBeUndefined()
  expect(verifyChoice(T, nonce, { headers: {}, text: 'nope' }, 3)).toBeUndefined()
})

test('an overlay that never answers yields undefined after the timeout, and the timer is cleared on a reply', async () => {
  const timers: { at: number; fn: () => void; isCancelled: boolean }[] = []
  let now = 0
  const tick = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  }
  const make = (fetch: () => Promise<unknown>) =>
    ({
      clock: { now: async () => now, after: (ms: number, fn: () => void) => { const t = { at: now + ms, fn, isCancelled: false }; timers.push(t); return { cancel: () => void (t.isCancelled = true) } } },
      http: { fetch },
    }) as unknown as Parameters<typeof askQuestion>[0]
  const office = newOffice()
  office.config = { token: 'tok', port: 4000 }
  const payload = { ...WHO, tool: 'AskUserQuestion', summary: 'Which library?', options: ['dayjs', 'luxon'] }

  const hung = askQuestion(make(() => new Promise(() => undefined)), office, payload)
  let settled = false
  void hung.then(() => (settled = true))
  await tick()
  now += QUESTION_TIMEOUT_MS - 1
  for (const t of timers) if (!t.isCancelled && t.at <= now) t.fn()
  await tick()
  expect(settled).toBe(false)
  now += 1
  for (const t of timers) if (!t.isCancelled && t.at <= now) t.fn()
  expect(await hung).toBeUndefined()

  timers.length = 0
  const fast = await askQuestion(make(async () => ({ ok: true, status: 200, headers: {}, text: '{}' })), office, payload)
  expect(fast).toBeUndefined() // no proof -> normal dialog, but the reply came in time
  expect(timers.every(t => t.isCancelled)).toBe(true)
})
