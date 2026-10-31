import type { PromptComposeSection } from 'claude-code'

export const ORCHESTRATOR_ID = 'kayy-office:orchestrator'

/** The one section the orchestrator adds to the system prompt (English, at most 100 words). */
export const ORCHESTRATOR_TEXT = [
  'Kayy policy. Work directly; a subagent starts cold, so delegate only when it pays:',
  'wide searches/reads → kayy-scout (haiku); read-only analysis, test drafts, boilerplate → codex-worker (verify output);',
  'independent tasks in parallel; clear implementation → kayy-coder (sonnet); tests missing → kayy-tester;',
  'risky or large diffs → kayy-reviewer; design or hard bugs → kayy-architect (opus).',
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
