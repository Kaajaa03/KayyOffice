import { expect, test } from 'claude-code/testing'
import { DEFAULT_RULES, chooseModel } from './routing'
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

test('tester and reviewer route to sonnet by default; existing routes stay', () => {
  expect(chooseModel(DEFAULT_RULES, { subagentType: 'kayy-tester' })).toBe('sonnet')
  expect(chooseModel(DEFAULT_RULES, { subagentType: 'kayy-reviewer' })).toBe('sonnet')
  expect(chooseModel(DEFAULT_RULES, { subagentType: 'kayy-reviewer', model: 'opus' })).toBeUndefined()
  expect(DEFAULT_RULES.byType['kayy-scout']).toBe('haiku')
  expect(DEFAULT_RULES.byType['kayy-coder']).toBe('sonnet')
  expect(DEFAULT_RULES.byType['kayy-architect']).toBe('opus')
  expect(parseRules('{"byType":{"kayy-tester":"haiku"}}').rules.byType['kayy-tester']).toBe('haiku')
})

test('a non-number maxPromptChars falls back to defaults', () => {
  expect(parseRules('{"maxPromptChars":"400"}').isFallback).toBe(true)
})
