import { expect, test } from 'claude-code/testing'
import { todoProgress } from './progress'

const t = (status: unknown, content: unknown = 'x', activeForm?: unknown) => ({ content, status, ...(activeForm === undefined ? {} : { activeForm }) })
const list = (todos: unknown) => ({ todos })

test('counts completed and total; current is the in_progress activeForm', () => {
  const p = todoProgress(list([t('completed'), t('in_progress', 'Datei anlegen', 'Lege Datei an'), t('pending')]))
  expect(p).toEqual({ done: 1, total: 3, current: 'Lege Datei an' })
})

test('current falls back to content, and is absent without an in_progress item', () => {
  expect(todoProgress(list([t('in_progress', 'Tests')]))).toEqual({ done: 0, total: 1, current: 'Tests' })
  expect(todoProgress(list([t('completed'), t('pending')]))).toEqual({ done: 1, total: 2 })
})

test('empty, non-array and non-object input give undefined', () => {
  expect(todoProgress(list([]))).toBeUndefined()
  expect(todoProgress(list('x'))).toBeUndefined()
  expect(todoProgress(list({}))).toBeUndefined()
  expect(todoProgress({})).toBeUndefined()
  expect(todoProgress(null)).toBeUndefined()
  expect(todoProgress(undefined)).toBeUndefined()
  expect(todoProgress('todos')).toBeUndefined()
  expect(todoProgress([t('pending')])).toBeUndefined()
})

test('1 item and 99 items count, 100 items do not', () => {
  expect(todoProgress(list([t('completed')]))).toEqual({ done: 1, total: 1 })
  expect(todoProgress(list(Array.from({ length: 99 }, () => t('pending'))))).toEqual({ done: 0, total: 99 })
  expect(todoProgress(list(Array.from({ length: 100 }, () => t('pending'))))).toBeUndefined()
})

test('malformed items and unknown statuses are ignored, not counted', () => {
  const p = todoProgress(list([t('completed'), t('done'), t(undefined), null, 'x', 5, [], { status: 'pending' }, t('pending', 7), t('pending')]))
  expect(p).toEqual({ done: 1, total: 2 })
  expect(todoProgress(list([t('done'), null]))).toBeUndefined()
})

test('a non-string or empty activeForm falls back to content', () => {
  expect(todoProgress(list([t('in_progress', 'Inhalt', 5)]))?.current).toBe('Inhalt')
  expect(todoProgress(list([t('in_progress', 'Inhalt', '')]))?.current).toBe('Inhalt')
})

test('current is capped at 80 chars and stripped of control characters', () => {
  expect(todoProgress(list([t('in_progress', 'x', 'a'.repeat(200))]))?.current).toBe('a'.repeat(80))
  expect(todoProgress(list([t('in_progress', 'x', 'a\u0000b\nc\u001b[31md\u007fe\u0085f')]))?.current).toBe('abc[31mdef')
  expect(todoProgress(list([t('in_progress', '\u0001\u0002')]))).toEqual({ done: 0, total: 1 })
})

test('only the first in_progress item names the current task', () => {
  expect(todoProgress(list([t('in_progress', 'a'), t('in_progress', 'b')]))?.current).toBe('a')
})

test('control characters incl. U+2028/U+2029 are removed from current', () => {
  const p = todoProgress(list([t('in_progress', 'a b c\u0085d\u009fe\u0000f\u007fg\nh', undefined)]))
  expect(p).toEqual({ done: 0, total: 1, current: 'abcdefgh' })
})
