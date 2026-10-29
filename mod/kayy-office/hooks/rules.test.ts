import { expect, test } from 'claude-code/testing'
import { DEFAULT_RULES } from './routing'
import { parseRules } from './rules'

test('a valid json overrides only what it sets', () => {
  const r = parseRules('{"byType":{"Explore":"sonnet"}}')
  expect(r.isFallback).toBe(false)
  expect(r.rules.byType.Explore).toBe('sonnet')
  expect(r.rules.byType.Plan).toBe('opus')
  expect(r.rules.readVerbs).toEqual(DEFAULT_RULES.readVerbs)
})

test('undefined text falls back to defaults', () => {
  const r = parseRules(undefined)
  expect(r.isFallback).toBe(true)
  expect(r.rules).toEqual(DEFAULT_RULES)
})

test('invalid json falls back to defaults', () => {
  expect(parseRules('{nope').isFallback).toBe(true)
})

test('an unknown alias falls back to defaults', () => {
  const r = parseRules('{"byType":{"Explore":"gpt"}}')
  expect(r.isFallback).toBe(true)
  expect(r.rules).toEqual(DEFAULT_RULES)
})

test('a non-number maxPromptChars falls back to defaults', () => {
  expect(parseRules('{"maxPromptChars":"400"}').isFallback).toBe(true)
})
