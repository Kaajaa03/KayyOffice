import { expect, test } from 'claude-code/testing'
import { statusText } from './status'

const counts = { haiku: 1, sonnet: 2, opus: 0 }

test('status text shows counts and cost', () => {
  expect(statusText(counts, 0.5, true)).toBe('haiku 1 · sonnet 2 · opus 0 · $0.50')
})

test('status text leaves out a cost that is not known', () => {
  expect(statusText(counts, undefined, true)).toBe('haiku 1 · sonnet 2 · opus 0')
})

test('status text says so when routing is off', () => {
  expect(statusText(counts, 1, false)).toBe('router off · haiku 1 · sonnet 2 · opus 0 · $1.00')
})
