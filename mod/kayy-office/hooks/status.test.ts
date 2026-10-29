import { expect, test } from 'claude-code/testing'
import { statusText } from './status'

const counts = { haiku: 1, sonnet: 2, opus: 0 }
const none = { haiku: 0, sonnet: 0, opus: 0 }

test('status text lists only models that were routed, plus cost', () => {
  expect(statusText(counts, 0.5, true)).toBe('haiku 1 · sonnet 2 · $0.50')
})

test('status text says "Router bereit" instead of a row of zeros', () => {
  expect(statusText(none, 0.5, true)).toBe('Router bereit · $0.50')
})

test('status text leaves out a cost that is not known', () => {
  expect(statusText(counts, undefined, true)).toBe('haiku 1 · sonnet 2')
  expect(statusText(none, undefined, true)).toBe('Router bereit')
})

test('status text says so when routing is off', () => {
  expect(statusText(counts, 1, false)).toBe('Router aus · haiku 1 · sonnet 2 · $1.00')
  expect(statusText(none, undefined, false)).toBe('Router aus')
})
