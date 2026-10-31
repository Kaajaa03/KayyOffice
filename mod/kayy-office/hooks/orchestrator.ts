import type { PromptComposeSection } from 'claude-code'

export const ORCHESTRATOR_ID = 'kayy-office:orchestrator'

/** The one section the orchestrator adds to the system prompt (English, at most 100 words). */
export const ORCHESTRATOR_TEXT = [
  'Kayy policy. Delegate by trigger, unprompted; tiny one-liners stay direct, since a subagent starts cold:',
  'searching/reading more than 2 files → kayy-scout (haiku); read-only analysis, test drafts, boilerplate → codex-worker (verify output);',
  'independent tasks in parallel; implementation with a clear plan → kayy-coder (sonnet); tests missing → kayy-tester;',
  'before finishing a non-trivial diff → kayy-reviewer; design or hard bugs → kayy-architect (opus).',
  'Give subagents exact paths, a one-line goal, a 150-word report limit.',
  'Run the relevant tests before calling work done.',
  'Ask the user only about irreversible actions, direction/architecture or cost;',
  'otherwise decide, note the assumption in one line, continue.',
].join(' ')

/** The engine's sections with the policy as the last `session` section (on), or without it (off). */
export const withOrchestrator = (sections: readonly PromptComposeSection[], isOn: boolean): PromptComposeSection[] => {
  const others = sections.filter(s => s.id !== ORCHESTRATOR_ID)
  return isOn ? [...others, { id: ORCHESTRATOR_ID, text: ORCHESTRATOR_TEXT, scope: 'session' }] : others
}
