import { expect, test } from 'claude-code/testing'
import { DEFAULT_RULES, chooseModel } from './routing'

const pick = (subagentType: string, prompt?: string, model?: string) =>
  chooseModel(DEFAULT_RULES, { subagentType, prompt, model })

test('maps known agent types to their model', () => {
  expect(pick('Explore')).toBe('haiku')
  expect(pick('kayy-scout')).toBe('haiku')
  expect(pick('claude-code-guide')).toBe('haiku')
  expect(pick('kayy-coder')).toBe('sonnet')
  expect(pick('Plan')).toBe('opus')
  expect(pick('kayy-architect')).toBe('opus')
})

test('keeps a model the caller already set', () => {
  expect(pick('Explore', 'x', 'opus')).toBeUndefined()
  expect(pick('general-purpose', 'suche x', 'weird-model')).toBeUndefined()
})

test('leaves fork and unknown types alone', () => {
  expect(pick('fork')).toBeUndefined()
  expect(pick('my-plugin:x')).toBeUndefined()
})

test('general-purpose with a short read-only prompt goes to haiku', () => {
  expect(pick('general-purpose', 'Suche alle TODOs und liste sie')).toBe('haiku')
  expect(pick('general-purpose', 'COUNT the files')).toBe('haiku')
  expect(pick('general-purpose', 'Zähle die Dateien')).toBe('haiku')
})

test('general-purpose with mixed read and write verbs goes to sonnet', () => {
  expect(pick('general-purpose', 'suche und lösche die Datei')).toBe('sonnet')
})

test('general-purpose with empty, missing or long prompt goes to sonnet', () => {
  expect(pick('general-purpose', '')).toBe('sonnet')
  expect(pick('general-purpose')).toBe('sonnet')
  expect(pick('general-purpose', 'suche ' + 'x'.repeat(400))).toBe('sonnet')
})

test('write verbs are matched by stem, so inflected forms still force sonnet', () => {
  expect(pick('general-purpose', 'Lies config.yml und ändern den Port')).toBe('sonnet')
  expect(pick('general-purpose', 'Suche X und lösch es')).toBe('sonnet')
  expect(pick('general-purpose', 'find and fixing the bug')).toBe('sonnet')
  expect(pick('general-purpose', 'Finde alle TODOs und entferne sie')).toBe('sonnet')
  expect(pick('general-purpose', 'search the repo and create a file')).toBe('sonnet')
})
